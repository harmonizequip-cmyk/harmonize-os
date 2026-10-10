-- ============================================================
-- STATUS: NÃO APLICADA. Rodar no Supabase (projeto vidnlzbxaxjlmzncqhxw) com o aval do dono.
--
-- Bloqueio da agenda do HIPRO por período.
--   1. bloqueios_equipamento: um período (de / até, inclusive) em que o
--      equipamento não pode ser reservado. Tipo: manutencao, recesso ou
--      outro. Serve para manutenção programada (começando hoje ou numa data
--      futura) e para recesso, viagem, feriado etc.
--   2. Funções para criar, mudar o último dia e excluir (só por elas;
--      quem tem o módulo "agenda"). Cada uma registra em movimentacoes.
--   3. Gatilho em calendar_events: reserva de HIPRO que cai num período
--      bloqueado é recusada com a mensagem do bloqueio. Reservas que já
--      existiam no período não são mexidas; a tela avisa antes de criar.
--   4. Manutenção: bloqueio do tipo manutencao que cobre hoje coloca o
--      equipamento em manutenção, com previsão de volta no dia seguinte ao
--      último dia bloqueado (o retorno automático que já existia continua
--      igual). "Voltar para ativo" e "Adiar previsão" passam a ajustar o
--      bloqueio também. A trava antiga por status agora só vale para
--      reservas antes da previsão de volta.
-- ============================================================

create table if not exists public.bloqueios_equipamento (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  tipo text not null check (tipo in ('manutencao', 'recesso', 'outro')),
  motivo text,
  data_inicio date not null,
  data_fim date not null,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (data_fim >= data_inicio)
);

create index if not exists bloqueios_equipamento_periodo_idx
  on public.bloqueios_equipamento (equipment_id, data_inicio, data_fim);

comment on table public.bloqueios_equipamento is
  'Períodos em que um HIPRO não pode ser reservado (manutenção programada, recesso, outro). Datas inclusivas. Escrito só pelas funções criar_bloqueio_equipamento, alterar_fim_bloqueio_equipamento e excluir_bloqueio_equipamento.';

alter table public.bloqueios_equipamento enable row level security;
drop policy if exists "bloqueios_select" on public.bloqueios_equipamento;
create policy "bloqueios_select" on public.bloqueios_equipamento
  for select using (has_module_permission('agenda') or has_module_permission('equipamentos'));

-- Rótulo do tipo, para mensagens.
create or replace function public.rotulo_bloqueio(p_tipo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_tipo when 'manutencao' then 'manutenção' when 'recesso' then 'recesso' else 'bloqueio' end;
$$;

-- Põe o equipamento em manutenção quando um bloqueio de manutenção cobre
-- hoje (previsão de volta = dia seguinte ao último dia bloqueado), e tira
-- quando o bloqueio que o colocou deixou de cobrir hoje. Não mexe numa
-- manutenção marcada à mão sem bloqueio.
create or replace function public.sincronizar_manutencao_por_bloqueio(p_equipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := public.hoje_local();
  v_eq record;
  v_bl record;
begin
  select id, name, status, status_previsto_fim into v_eq from equipments where id = p_equipment_id;
  if v_eq.id is null then
    return;
  end if;

  select * into v_bl from bloqueios_equipamento
   where equipment_id = p_equipment_id and tipo = 'manutencao'
     and data_inicio <= v_hoje and data_fim >= v_hoje
   order by data_fim desc
   limit 1;

  if v_bl.id is not null then
    if v_eq.status <> 'manutencao' then
      update equipments
         set status = 'manutencao',
             status_motivo = coalesce(nullif(trim(v_bl.motivo), ''), 'Manutenção programada'),
             status_desde = now(),
             status_previsto_fim = v_bl.data_fim + 1
       where id = p_equipment_id;
      perform public.registrar_movimentacao(
        'manutencao_iniciada', 'equipments', p_equipment_id, 'Equipamento ' || v_eq.name,
        jsonb_build_object('motivo', coalesce(nullif(trim(v_bl.motivo), ''), 'manutenção programada'),
                           'previsto_fim', to_char(v_bl.data_fim + 1, 'DD/MM/YYYY'))
      );
    elsif v_eq.status_previsto_fim is distinct from v_bl.data_fim + 1 then
      update equipments set status_previsto_fim = v_bl.data_fim + 1 where id = p_equipment_id;
    end if;
  end if;
end;
$$;

-- Retorno automático (já existia) + início automático da manutenção
-- programada. Chamada pela tela de Equipamentos e pelo gatilho da Agenda.
create or replace function public.aplicar_previsoes_manutencao_vencidas()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_equip record;
begin
  if not (public.has_module_permission('equipamentos') or public.has_module_permission('agenda')) then
    return;
  end if;

  for v_equip in
    select id, name from equipments
     where status = 'manutencao'
       and status_previsto_fim is not null
       and status_previsto_fim <= public.hoje_local()
  loop
    update equipments
       set status = 'ativo',
           status_motivo = null,
           status_desde = now(),
           status_previsto_fim = null
     where id = v_equip.id;

    perform public.registrar_movimentacao(
      'manutencao_finalizada', 'equipments', v_equip.id, 'Equipamento ' || v_equip.name,
      jsonb_build_object('motivo', 'retorno automático: a previsão de volta foi atingida')
    );
  end loop;

  for v_equip in select id from equipments loop
    perform public.sincronizar_manutencao_por_bloqueio(v_equip.id);
  end loop;
end;
$$;

create or replace function public.criar_bloqueio_equipamento(
  p_equipment_id uuid,
  p_tipo text,
  p_inicio date,
  p_fim date,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_id uuid;
  v_choque record;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para bloquear a agenda.';
  end if;
  if p_tipo not in ('manutencao', 'recesso', 'outro') then
    raise exception 'Tipo de bloqueio inválido.';
  end if;
  if p_inicio is null or p_fim is null then
    raise exception 'Informe o primeiro e o último dia do bloqueio.';
  end if;
  if p_fim < p_inicio then
    raise exception 'O último dia não pode ser antes do primeiro.';
  end if;
  if p_fim < public.hoje_local() then
    raise exception 'O período já passou.';
  end if;

  select name into v_nome from equipments where id = p_equipment_id;
  if v_nome is null then
    raise exception 'Equipamento não encontrado.';
  end if;

  select * into v_choque from bloqueios_equipamento
   where equipment_id = p_equipment_id and data_inicio <= p_fim and data_fim >= p_inicio
   limit 1;
  if v_choque.id is not null then
    raise exception 'O % já tem um bloqueio (%) de % a % que encosta nesse período. Mude ou exclua aquele antes.',
      v_nome, rotulo_bloqueio(v_choque.tipo), to_char(v_choque.data_inicio, 'DD/MM'), to_char(v_choque.data_fim, 'DD/MM');
  end if;

  insert into bloqueios_equipamento (equipment_id, tipo, motivo, data_inicio, data_fim)
  values (p_equipment_id, p_tipo, nullif(trim(p_motivo), ''), p_inicio, p_fim)
  returning id into v_id;

  perform public.registrar_movimentacao(
    'criado', 'equipments', p_equipment_id, 'Equipamento ' || v_nome,
    jsonb_build_object('acao_detalhada',
      'Agenda bloqueada (' || rotulo_bloqueio(p_tipo) || ') de ' || to_char(p_inicio, 'DD/MM/YYYY') || ' a ' || to_char(p_fim, 'DD/MM/YYYY'),
      'motivo', coalesce(nullif(trim(p_motivo), ''), 'não informado'))
  );

  perform public.sincronizar_manutencao_por_bloqueio(p_equipment_id);
  return v_id;
end;
$$;

-- Muda o último dia do bloqueio (a "data de volta" é o dia seguinte).
create or replace function public.alterar_fim_bloqueio_equipamento(p_bloqueio_id uuid, p_fim date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bl record;
  v_nome text;
  v_choque record;
  v_hoje date := public.hoje_local();
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para mudar o bloqueio.';
  end if;
  select * into v_bl from bloqueios_equipamento where id = p_bloqueio_id;
  if v_bl.id is null then
    raise exception 'Bloqueio não encontrado.';
  end if;
  if p_fim is null or p_fim < v_bl.data_inicio then
    raise exception 'O último dia não pode ser antes do primeiro (%).', to_char(v_bl.data_inicio, 'DD/MM/YYYY');
  end if;
  if p_fim < v_hoje - 1 then
    raise exception 'O último dia não pode ficar no passado.';
  end if;

  select * into v_choque from bloqueios_equipamento
   where equipment_id = v_bl.equipment_id and id <> v_bl.id
     and data_inicio <= p_fim and data_fim >= v_bl.data_inicio
   limit 1;
  if v_choque.id is not null then
    raise exception 'Esse novo prazo encosta em outro bloqueio (% a %).',
      to_char(v_choque.data_inicio, 'DD/MM'), to_char(v_choque.data_fim, 'DD/MM');
  end if;

  update bloqueios_equipamento set data_fim = p_fim where id = p_bloqueio_id;
  select name into v_nome from equipments where id = v_bl.equipment_id;

  -- Manutenção em curso deste bloqueio: acompanha o novo prazo, ou termina
  -- se o bloqueio deixou de cobrir hoje.
  if v_bl.tipo = 'manutencao' then
    update equipments
       set status_previsto_fim = p_fim + 1
     where id = v_bl.equipment_id and status = 'manutencao' and status_previsto_fim = v_bl.data_fim + 1;
  end if;

  perform public.registrar_movimentacao(
    'editado', 'equipments', v_bl.equipment_id, 'Equipamento ' || v_nome,
    jsonb_build_object('acao_detalhada',
      'Bloqueio (' || rotulo_bloqueio(v_bl.tipo) || ') agora vai até ' || to_char(p_fim, 'DD/MM/YYYY'))
  );

  perform public.aplicar_previsoes_manutencao_vencidas();
end;
$$;

create or replace function public.excluir_bloqueio_equipamento(p_bloqueio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bl record;
  v_nome text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para excluir o bloqueio.';
  end if;
  select * into v_bl from bloqueios_equipamento where id = p_bloqueio_id;
  if v_bl.id is null then
    raise exception 'Bloqueio não encontrado.';
  end if;
  select name into v_nome from equipments where id = v_bl.equipment_id;

  delete from bloqueios_equipamento where id = p_bloqueio_id;

  -- Se era a manutenção em curso que este bloqueio abriu, devolve o equipamento.
  if v_bl.tipo = 'manutencao' then
    update equipments
       set status = 'ativo', status_motivo = null, status_desde = now(), status_previsto_fim = null
     where id = v_bl.equipment_id and status = 'manutencao' and status_previsto_fim = v_bl.data_fim + 1;
    if found then
      perform public.registrar_movimentacao(
        'manutencao_finalizada', 'equipments', v_bl.equipment_id, 'Equipamento ' || v_nome,
        jsonb_build_object('motivo', 'bloqueio de manutenção excluído')
      );
    end if;
  end if;

  perform public.registrar_movimentacao(
    'excluido', 'equipments', v_bl.equipment_id, 'Equipamento ' || v_nome,
    jsonb_build_object('acao_detalhada',
      'Bloqueio (' || rotulo_bloqueio(v_bl.tipo) || ') de ' || to_char(v_bl.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(v_bl.data_fim, 'DD/MM/YYYY') || ' excluído')
  );
end;
$$;

-- "Voltar para ativo" também encerra o bloqueio de manutenção de hoje, para
-- ele não colocar o equipamento em manutenção de novo.
create or replace function public.definir_status_equipamento(
  p_equipment_id uuid,
  p_status text,
  p_motivo text default null,
  p_previsto_fim date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_status_atual text;
  v_detalhes jsonb;
  v_hoje date := public.hoje_local();
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar o status de equipamentos.';
  end if;

  if p_status not in ('ativo', 'manutencao') then
    raise exception 'Status inválido: %. Use ''ativo'' ou ''manutencao''.', p_status;
  end if;

  if p_status = 'manutencao' and p_previsto_fim is not null and p_previsto_fim < current_date then
    raise exception 'A previsão de retorno não pode ser uma data no passado.';
  end if;

  select name, status into v_nome, v_status_atual from equipments where id = p_equipment_id;
  if v_nome is null then
    raise exception 'Equipamento não encontrado (id %).', p_equipment_id;
  end if;

  if p_status = 'ativo' then
    delete from bloqueios_equipamento
     where equipment_id = p_equipment_id and tipo = 'manutencao'
       and data_inicio = v_hoje;
    update bloqueios_equipamento set data_fim = v_hoje - 1
     where equipment_id = p_equipment_id and tipo = 'manutencao'
       and data_inicio < v_hoje and data_fim >= v_hoje;
  end if;

  if v_status_atual = p_status then
    return;
  end if;

  update equipments
     set status = p_status,
         status_motivo = case when p_status = 'manutencao' then nullif(trim(p_motivo), '') else null end,
         status_desde = now(),
         status_previsto_fim = case when p_status = 'manutencao' then p_previsto_fim else null end
   where id = p_equipment_id;

  v_detalhes := jsonb_build_object('motivo', coalesce(nullif(trim(p_motivo), ''), 'não informado'));
  if p_status = 'manutencao' and p_previsto_fim is not null then
    v_detalhes := v_detalhes || jsonb_build_object('previsto_fim', to_char(p_previsto_fim, 'DD/MM/YYYY'));
  end if;

  perform public.registrar_movimentacao(
    case p_status when 'manutencao' then 'manutencao_iniciada' else 'manutencao_finalizada' end,
    'equipments', p_equipment_id, 'Equipamento ' || v_nome,
    v_detalhes
  );
end;
$$;

-- "Adiar previsão" também estica o bloqueio de manutenção de hoje.
create or replace function public.adiar_previsao_manutencao(
  p_equipment_id uuid,
  p_nova_previsao date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_status_atual text;
  v_hoje date := public.hoje_local();
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar a previsão de manutenção.';
  end if;

  if p_nova_previsao < current_date then
    raise exception 'A nova previsão não pode ser uma data no passado.';
  end if;

  select name, status into v_nome, v_status_atual from equipments where id = p_equipment_id;
  if v_nome is null then
    raise exception 'Equipamento não encontrado (id %).', p_equipment_id;
  end if;
  if v_status_atual <> 'manutencao' then
    raise exception 'Este equipamento não está em manutenção no momento.';
  end if;

  update bloqueios_equipamento set data_fim = greatest(p_nova_previsao - 1, data_inicio)
   where equipment_id = p_equipment_id and tipo = 'manutencao'
     and data_inicio <= v_hoje and data_fim >= v_hoje;

  update equipments set status_previsto_fim = p_nova_previsao where id = p_equipment_id;

  perform public.registrar_movimentacao(
    'editado', 'equipments', p_equipment_id, 'Equipamento ' || v_nome,
    jsonb_build_object('acao_detalhada', 'Previsão de retorno adiada para ' || to_char(p_nova_previsao, 'DD/MM/YYYY'))
  );
end;
$$;

-- Trava antiga por status: agora só para reservas antes da previsão de volta
-- (antes travava qualquer data enquanto estivesse em manutenção).
create or replace function public.validar_equipamento_coerente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_code equipment_code_type;
  v_equipment_status text;
  v_previsto_fim date;
begin
  perform public.aplicar_previsoes_manutencao_vencidas();

  if new.event_type in ('hipro_1', 'hipro_2') then
    if new.equipment_id is null then
      raise exception 'Evento do tipo % precisa de um equipamento vinculado.', new.event_type;
    end if;
    select code, status, status_previsto_fim into v_equipment_code, v_equipment_status, v_previsto_fim
      from equipments where id = new.equipment_id;
    if v_equipment_code::text is distinct from new.event_type::text then
      raise exception 'Evento do tipo % não pode apontar para o equipamento %.', new.event_type, v_equipment_code;
    end if;
    if v_equipment_status = 'manutencao'
       and new.status <> 'cancelada'
       and new.equipment_id is distinct from old.equipment_id
       and (v_previsto_fim is null or new.date_start < v_previsto_fim) then
      raise exception 'Este equipamento está em manutenção%. Escolha uma data a partir da volta ou outro equipamento.',
        case when v_previsto_fim is not null then ' até ' || to_char(v_previsto_fim - 1, 'DD/MM') else '' end;
    end if;
  elsif new.equipment_id is not null then
    raise exception 'Evento do tipo % não pode ter equipamento vinculado.', new.event_type;
  end if;
  return new;
end;
$$;

-- Reserva de HIPRO dentro de um período bloqueado é recusada. Só confere
-- quando a reserva nasce, muda de data ou de equipamento, ou volta de
-- cancelada: o que já existia no período continua como está.
create or replace function public.validar_bloqueio_equipamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bl record;
  v_nome text;
begin
  if new.equipment_id is null or new.status = 'cancelada' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.date_start = old.date_start
     and new.date_end = old.date_end
     and new.equipment_id is not distinct from old.equipment_id
     and old.status <> 'cancelada' then
    return new;
  end if;

  select * into v_bl from bloqueios_equipamento
   where equipment_id = new.equipment_id
     and data_inicio <= new.date_end and data_fim >= new.date_start
   order by data_inicio
   limit 1;
  if v_bl.id is not null then
    select name into v_nome from equipments where id = new.equipment_id;
    raise exception '%', format(
      'O %s está bloqueado (%s) de %s a %s%s. Escolha outra data ou mude o bloqueio em Equipamentos.',
      v_nome, rotulo_bloqueio(v_bl.tipo), to_char(v_bl.data_inicio, 'DD/MM'), to_char(v_bl.data_fim, 'DD/MM'),
      case when nullif(trim(v_bl.motivo), '') is not null then ': ' || trim(v_bl.motivo) else '' end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_bloqueio_equipamento on public.calendar_events;
create trigger trg_validar_bloqueio_equipamento
  before insert or update of date_start, date_end, equipment_id, status on public.calendar_events
  for each row execute function public.validar_bloqueio_equipamento();

revoke execute on function public.rotulo_bloqueio(text) from public, anon;
revoke execute on function public.sincronizar_manutencao_por_bloqueio(uuid) from public, anon, authenticated;
revoke execute on function public.criar_bloqueio_equipamento(uuid, text, date, date, text) from public, anon;
revoke execute on function public.alterar_fim_bloqueio_equipamento(uuid, date) from public, anon;
revoke execute on function public.excluir_bloqueio_equipamento(uuid) from public, anon;
revoke execute on function public.validar_bloqueio_equipamento() from public, anon;
grant execute on function public.rotulo_bloqueio(text) to authenticated, service_role;
grant execute on function public.sincronizar_manutencao_por_bloqueio(uuid) to service_role;
grant execute on function public.criar_bloqueio_equipamento(uuid, text, date, date, text) to authenticated, service_role;
grant execute on function public.alterar_fim_bloqueio_equipamento(uuid, date) to authenticated, service_role;
grant execute on function public.excluir_bloqueio_equipamento(uuid) to authenticated, service_role;
grant select on public.bloqueios_equipamento to authenticated, service_role;
