-- Cadastro de pacientes do Planejador HIPRO (pedido do dono, 30/10/2026).
--
-- Cada paciente pertence à cliente (profissional) que o atende: o paciente da
-- Dra. Ana fica com a Dra. Ana, e no portal ela vê só os dela. Todo
-- planejamento com nome de paciente fica ligado a um cadastro
-- (planejamentos.paciente_id), então a ficha do paciente junta todas as
-- sessões, mesmo quando o procedimento se repete ou muda de área.
--
-- salvar_planejamento não muda de assinatura: o editor manda o id escolhido
-- dentro do estado (estado.pacienteId). Sem id, a função acha o paciente da
-- mesma cliente pelo nome (sem acento, maiúscula nem espaço sobrando) ou cria.
-- Os planejamentos que já existem ganham o cadastro no fim deste script.

-- 1. Nome comparável: "  JOÃO  da Silva " = "joao da silva" (igual a normalizarNome em lib/historico-paciente.ts).
create or replace function public.normalizar_nome_paciente(p_nome text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(p_nome, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '\s+', ' ', 'g'));
$$;
revoke execute on function public.normalizar_nome_paciente(text) from public, anon;
grant execute on function public.normalizar_nome_paciente(text) to authenticated, service_role;

-- 2. Tabela.
create table if not exists public.pacientes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  whatsapp text,
  nascimento date,
  observacoes text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pacientes_cliente_nome_idx on public.pacientes (client_id, public.normalizar_nome_paciente(nome));
alter table public.pacientes enable row level security;
drop policy if exists "pacientes_select" on public.pacientes;
create policy "pacientes_select" on public.pacientes for select using (has_module_permission('agenda'));
drop policy if exists "pacientes_select_cliente" on public.pacientes;
create policy "pacientes_select_cliente" on public.pacientes for select
  using (client_id is not null and client_id = public.cliente_do_usuario());
grant select on public.pacientes to authenticated;
drop trigger if exists trg_somente_leitura on public.pacientes;
create trigger trg_somente_leitura before insert or update or delete on public.pacientes
  for each statement execute function public.bloquear_somente_leitura();
comment on table public.pacientes is
  'Pacientes do Planejador HIPRO, cada um da cliente (profissional) que o atende. planejamentos.paciente_id liga cada planejamento ao cadastro. Escrito só por salvar_paciente, juntar_pacientes, excluir_paciente e salvar_planejamento.';

alter table public.planejamentos add column if not exists paciente_id uuid references public.pacientes(id) on delete set null;
create index if not exists planejamentos_paciente_idx on public.planejamentos (paciente_id) where paciente_id is not null;

-- 3. Salvar planejamento: liga ao paciente (escolhido ou achado pelo nome).
create or replace function public.salvar_planejamento(p_id uuid, p_client_id uuid, p_calendar_event_id uuid, p_estado jsonb, p_total integer default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_e jsonb := coalesce(p_estado, '{}'::jsonb);
  v_data date;
  v_retorno date;
  v_saldo integer;
  v_cliente uuid := cliente_do_usuario();
  v_client_id uuid := p_client_id;
  v_evento uuid := p_calendar_event_id;
  v_nome text;
  v_paciente uuid;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para salvar planejamentos.';
  end if;
  if v_cliente is not null then
    v_client_id := v_cliente;
    if v_id is null then
      v_evento := null;
    else
      select calendar_event_id into v_evento from planejamentos where id = v_id and client_id = v_cliente;
      if not found then raise exception 'Planejamento não encontrado.'; end if;
    end if;
  end if;
  if jsonb_typeof(v_e) <> 'object' then
    raise exception 'Planejamento inválido.';
  end if;
  if pg_column_size(v_e) > 2000000 then
    raise exception 'Planejamento grande demais.';
  end if;
  begin v_data := nullif(v_e ->> 'data', '')::date; exception when others then v_data := null; end;
  begin v_retorno := nullif(v_e ->> 'dataRetorno', '')::date; exception when others then v_retorno := null; end;
  begin v_saldo := coalesce(nullif(v_e ->> 'saldoTotal', '')::integer, 0); exception when others then v_saldo := 0; end;

  -- Paciente: o escolhido na tela (se for da mesma cliente) ou o de mesmo nome; sem nenhum, cria.
  v_nome := nullif(btrim(regexp_replace(coalesce(v_e ->> 'paciente', ''), '\s+', ' ', 'g')), '');
  if v_nome is not null then
    begin
      select id, nome into v_paciente, v_nome from pacientes
       where id = nullif(v_e ->> 'pacienteId', '')::uuid and client_id is not distinct from v_client_id;
    exception when others then v_paciente := null;
    end;
    if v_paciente is null then
      v_nome := nullif(btrim(regexp_replace(coalesce(v_e ->> 'paciente', ''), '\s+', ' ', 'g')), '');
      select id, nome into v_paciente, v_nome from pacientes
       where client_id is not distinct from v_client_id
         and normalizar_nome_paciente(nome) = normalizar_nome_paciente(v_nome)
       order by created_at limit 1;
      if v_paciente is null then
        v_nome := nullif(btrim(regexp_replace(coalesce(v_e ->> 'paciente', ''), '\s+', ' ', 'g')), '');
        insert into pacientes (client_id, nome) values (v_client_id, v_nome) returning id into v_paciente;
      end if;
    end if;
    v_e := v_e || jsonb_build_object('paciente', v_nome, 'pacienteId', v_paciente::text);
  else
    v_e := v_e - 'pacienteId';
  end if;

  if v_id is null then
    insert into planejamentos (client_id, calendar_event_id, paciente, paciente_id, data, data_retorno, procedimento, saldo_total, total_disparos, estado)
    values (v_client_id, v_evento, v_nome, v_paciente, coalesce(v_data, hoje_local()), v_retorno,
            nullif(btrim(v_e ->> 'procNome'), ''), v_saldo, greatest(coalesce(p_total, 0), 0), v_e)
    returning id into v_id;
    perform registrar_movimentacao('criado', 'planejamento', v_id,
      'Planejamento HIPRO criado' || coalesce(' para ' || v_nome, '')
        || case when v_cliente is not null then ' (pela cliente)' else '' end,
      jsonb_build_object('client_id', v_client_id, 'calendar_event_id', v_evento, 'paciente_id', v_paciente));
  else
    update planejamentos set
      client_id = v_client_id,
      calendar_event_id = v_evento,
      paciente = v_nome,
      paciente_id = v_paciente,
      data = coalesce(v_data, data),
      data_retorno = v_retorno,
      procedimento = nullif(btrim(v_e ->> 'procNome'), ''),
      saldo_total = v_saldo,
      total_disparos = greatest(coalesce(p_total, 0), 0),
      estado = v_e,
      updated_at = now()
    where id = v_id and (v_cliente is null or client_id = v_cliente);
    if not found then raise exception 'Planejamento não encontrado.'; end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.salvar_planejamento(uuid, uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.salvar_planejamento(uuid, uuid, uuid, jsonb, integer) to authenticated, service_role;

-- 4. Ficha do paciente: criar ou editar. Trocar o nome leva junto os planejamentos dele.
create or replace function public.salvar_paciente(
  p_id uuid,
  p_client_id uuid,
  p_nome text,
  p_whatsapp text default null,
  p_nascimento date default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := cliente_do_usuario();
  v_client_id uuid := p_client_id;
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_id uuid := p_id;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para salvar pacientes.';
  end if;
  if v_nome is null then raise exception 'Escreva o nome do paciente.'; end if;
  if length(v_nome) > 120 then raise exception 'Nome grande demais.'; end if;
  if v_cliente is not null then v_client_id := v_cliente; end if;

  if v_id is null then
    if exists (select 1 from pacientes where client_id is not distinct from v_client_id
                and normalizar_nome_paciente(nome) = normalizar_nome_paciente(v_nome)) then
      raise exception 'Já existe um paciente com esse nome.';
    end if;
    insert into pacientes (client_id, nome, whatsapp, nascimento, observacoes)
    values (v_client_id, v_nome, nullif(btrim(p_whatsapp), ''), p_nascimento, nullif(btrim(left(p_observacoes, 2000)), ''))
    returning id into v_id;
    perform registrar_movimentacao('criado', 'paciente', v_id, 'Paciente cadastrado: ' || v_nome,
      jsonb_build_object('client_id', v_client_id));
  else
    update pacientes set
      nome = v_nome,
      whatsapp = nullif(btrim(p_whatsapp), ''),
      nascimento = p_nascimento,
      observacoes = nullif(btrim(left(p_observacoes, 2000)), ''),
      updated_at = now()
    where id = v_id and (v_cliente is null or client_id = v_cliente);
    if not found then raise exception 'Paciente não encontrado.'; end if;
    update planejamentos set paciente = v_nome, estado = estado || jsonb_build_object('paciente', v_nome)
     where paciente_id = v_id and paciente is distinct from v_nome;
    perform registrar_movimentacao('editado', 'paciente', v_id, 'Ficha do paciente atualizada: ' || v_nome, '{}'::jsonb);
  end if;
  return v_id;
end;
$$;
revoke execute on function public.salvar_paciente(uuid, uuid, text, text, date, text) from public, anon;
grant execute on function public.salvar_paciente(uuid, uuid, text, text, date, text) to authenticated, service_role;

-- 5. Juntar dois cadastros do mesmo paciente (nome escrito de dois jeitos).
create or replace function public.juntar_pacientes(p_manter uuid, p_juntar uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := cliente_do_usuario();
  m pacientes%rowtype;
  j pacientes%rowtype;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para juntar pacientes.';
  end if;
  if p_manter = p_juntar then raise exception 'Escolha outro paciente.'; end if;
  select * into m from pacientes where id = p_manter and (v_cliente is null or client_id = v_cliente);
  select * into j from pacientes where id = p_juntar and (v_cliente is null or client_id = v_cliente);
  if m.id is null or j.id is null then raise exception 'Paciente não encontrado.'; end if;
  if m.client_id is distinct from j.client_id then raise exception 'Os dois pacientes precisam ser da mesma cliente.'; end if;

  update planejamentos set paciente_id = m.id, paciente = m.nome, estado = estado || jsonb_build_object('paciente', m.nome, 'pacienteId', m.id::text)
   where paciente_id = j.id;
  update pacientes set
    whatsapp = coalesce(whatsapp, j.whatsapp),
    nascimento = coalesce(nascimento, j.nascimento),
    observacoes = case when j.observacoes is null then observacoes
                       when observacoes is null then j.observacoes
                       else observacoes || E'\n' || j.observacoes end,
    updated_at = now()
   where id = m.id;
  delete from pacientes where id = j.id;
  perform registrar_movimentacao('editado', 'paciente', m.id,
    'Paciente ' || j.nome || ' juntado com ' || m.nome, jsonb_build_object('juntado', j.id));
end;
$$;
revoke execute on function public.juntar_pacientes(uuid, uuid) from public, anon;
grant execute on function public.juntar_pacientes(uuid, uuid) to authenticated, service_role;

-- 6. Excluir cadastro: só sem planejamento.
create or replace function public.excluir_paciente(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := cliente_do_usuario();
  v_nome text;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para excluir pacientes.';
  end if;
  if exists (select 1 from planejamentos where paciente_id = p_id) then
    raise exception 'Este paciente tem planejamentos. Apague os planejamentos antes, ou junte com outro paciente.';
  end if;
  delete from pacientes where id = p_id and (v_cliente is null or client_id = v_cliente) returning nome into v_nome;
  if not found then raise exception 'Paciente não encontrado.'; end if;
  perform registrar_movimentacao('excluido', 'paciente', p_id, 'Paciente excluído: ' || v_nome, '{}'::jsonb);
end;
$$;
revoke execute on function public.excluir_paciente(uuid) from public, anon;
grant execute on function public.excluir_paciente(uuid) to authenticated, service_role;

-- 7. Planejamentos que já existem: um cadastro por cliente e nome, com o nome mais recente.
insert into public.pacientes (client_id, nome, created_by, created_at)
select distinct on (pl.client_id, public.normalizar_nome_paciente(pl.paciente))
       pl.client_id, btrim(regexp_replace(pl.paciente, '\s+', ' ', 'g')), pl.created_by, pl.created_at
  from public.planejamentos pl
 where pl.paciente_id is null and coalesce(btrim(pl.paciente), '') <> ''
   and not exists (select 1 from public.pacientes pa
                    where pa.client_id is not distinct from pl.client_id
                      and public.normalizar_nome_paciente(pa.nome) = public.normalizar_nome_paciente(pl.paciente))
 order by pl.client_id, public.normalizar_nome_paciente(pl.paciente), pl.updated_at desc;

update public.planejamentos pl set
  paciente_id = pa.id,
  estado = pl.estado || jsonb_build_object('pacienteId', pa.id::text)
  from public.pacientes pa
 where pl.paciente_id is null and coalesce(btrim(pl.paciente), '') <> ''
   and pa.client_id is not distinct from pl.client_id
   and public.normalizar_nome_paciente(pa.nome) = public.normalizar_nome_paciente(pl.paciente);
