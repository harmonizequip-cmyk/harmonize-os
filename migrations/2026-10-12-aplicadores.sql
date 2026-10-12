-- ============================================================
-- STATUS: ainda NÃO aplicada. Rodar no Supabase (projeto vidnlzbxaxjlmzncqhxw) com o aval do dono.
--
-- Desgaste por aplicador.
--   A contagem de disparos do HIPRO é por aplicador, não por aparelho, e
--   os aplicadores trocam de aparelho (4 aplicadores, 2 montados e 2 de
--   reserva).
--   1. aplicadores: cada aplicador com nome, número de série, limite de
--      disparos (vida útil, opcional) e a última leitura do contador
--      (contador_base em contador_base_em).
--   2. aplicador_montagens: histórico de onde cada aplicador esteve montado
--      (de / até; "até" nulo = montado agora). Um aplicador por HIPRO.
--   3. View aplicadores_uso: disparos estimados = última leitura + disparos
--      das locações do HIPRO em que ele estava montado, depois da leitura.
--      Mentoria não entra (o número lá é de pacientes). A leitura nova do
--      contador corrige qualquer diferença.
--   4. Funções salvar_aplicador, montar_aplicador e
--      registrar_leitura_aplicador (módulo "equipamentos"), cada uma
--      registrando em movimentacoes.
-- ============================================================

create table if not exists public.aplicadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero_serie text,
  limite_disparos integer check (limite_disparos is null or limite_disparos > 0),
  contador_base integer not null default 0 check (contador_base >= 0),
  contador_base_em date not null default public.hoje_local(),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.aplicadores is
  'Aplicadores do HIPRO (a contagem de disparos é por aplicador). contador_base é a última leitura do contador, feita em contador_base_em. Escrito só por salvar_aplicador, montar_aplicador e registrar_leitura_aplicador.';

create table if not exists public.aplicador_montagens (
  id uuid primary key default gen_random_uuid(),
  aplicador_id uuid not null references public.aplicadores(id) on delete cascade,
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  desde date not null,
  ate date,
  created_at timestamptz not null default now(),
  check (ate is null or ate >= desde)
);

comment on table public.aplicador_montagens is
  'Onde cada aplicador esteve montado. Intervalo [desde, ate): a locação do dia da troca conta para o aplicador que entrou. ate nulo = montado agora.';

create unique index if not exists aplicador_montagens_aplicador_aberta_idx
  on public.aplicador_montagens (aplicador_id) where ate is null;
create unique index if not exists aplicador_montagens_equipamento_aberta_idx
  on public.aplicador_montagens (equipment_id) where ate is null;

alter table public.aplicadores enable row level security;
alter table public.aplicador_montagens enable row level security;
drop policy if exists "aplicadores_select" on public.aplicadores;
create policy "aplicadores_select" on public.aplicadores
  for select using (has_module_permission('equipamentos') or has_module_permission('agenda'));
drop policy if exists "aplicador_montagens_select" on public.aplicador_montagens;
create policy "aplicador_montagens_select" on public.aplicador_montagens
  for select using (has_module_permission('equipamentos') or has_module_permission('agenda'));

create or replace view public.aplicadores_uso
with (security_invoker = true) as
select
  a.id,
  a.nome,
  a.numero_serie,
  a.limite_disparos,
  a.contador_base,
  a.contador_base_em,
  a.ativo,
  m.equipment_id,
  m.desde as montado_desde,
  a.contador_base + coalesce((
    select sum(r.shots)
      from public.aplicador_montagens h
      join public.rentals_contabilizaveis r
        on r.equipment_id = h.equipment_id
       and r.event_date >= h.desde
       and (h.ate is null or r.event_date < h.ate)
     where h.aplicador_id = a.id
       and r.event_date > a.contador_base_em
       and not exists (
         select 1 from public.calendar_events ce
          where ce.rental_id = r.id and ce.is_mentoria
       )
  ), 0)::bigint as disparos
from public.aplicadores a
left join public.aplicador_montagens m on m.aplicador_id = a.id and m.ate is null;

comment on view public.aplicadores_uso is
  'Disparos estimados de cada aplicador: última leitura do contador + disparos das locações (fora mentoria) do HIPRO em que estava montado, depois da leitura.';

-- Cria (p_id nulo) ou altera um aplicador. Desativar tira da montagem.
create or replace function public.salvar_aplicador(
  p_id uuid,
  p_nome text,
  p_numero_serie text default null,
  p_limite_disparos integer default null,
  p_ativo boolean default true,
  p_contador_inicial integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nome text := nullif(trim(p_nome), '');
begin
  if not has_module_permission('equipamentos') then
    raise exception 'Sem permissão para mexer nos aplicadores.';
  end if;
  if v_nome is null then
    raise exception 'Dê um nome ao aplicador.';
  end if;
  if p_limite_disparos is not null and p_limite_disparos <= 0 then
    raise exception 'O limite de disparos precisa ser maior que zero.';
  end if;
  if p_contador_inicial is not null and p_contador_inicial < 0 then
    raise exception 'O contador não pode ser negativo.';
  end if;

  if p_id is null then
    insert into aplicadores (nome, numero_serie, limite_disparos, contador_base, contador_base_em, ativo)
    values (v_nome, nullif(trim(p_numero_serie), ''), p_limite_disparos, coalesce(p_contador_inicial, 0), public.hoje_local(), coalesce(p_ativo, true))
    returning id into v_id;
    perform public.registrar_movimentacao(
      'criado', 'aplicadores', v_id, 'Aplicador ' || v_nome,
      jsonb_build_object('contador', coalesce(p_contador_inicial, 0), 'limite', p_limite_disparos)
    );
  else
    update aplicadores
       set nome = v_nome,
           numero_serie = nullif(trim(p_numero_serie), ''),
           limite_disparos = p_limite_disparos,
           ativo = coalesce(p_ativo, true)
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Aplicador não encontrado.';
    end if;
    if not coalesce(p_ativo, true) then
      update aplicador_montagens set ate = greatest(desde, public.hoje_local())
       where aplicador_id = v_id and ate is null;
    end if;
    perform public.registrar_movimentacao(
      'editado', 'aplicadores', v_id, 'Aplicador ' || v_nome,
      jsonb_build_object('limite', p_limite_disparos, 'ativo', coalesce(p_ativo, true))
    );
  end if;
  return v_id;
end;
$$;

-- Monta o aplicador num HIPRO a partir de p_desde (o que estava lá vai
-- para a reserva). p_equipment_id nulo = tirar e guardar na reserva.
create or replace function public.montar_aplicador(
  p_aplicador_id uuid,
  p_equipment_id uuid,
  p_desde date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde date := coalesce(p_desde, public.hoje_local());
  v_ap record;
  v_eq_nome text;
  v_ultima date;
begin
  if not has_module_permission('equipamentos') then
    raise exception 'Sem permissão para mexer nos aplicadores.';
  end if;
  select id, nome, ativo into v_ap from aplicadores where id = p_aplicador_id;
  if v_ap.id is null then
    raise exception 'Aplicador não encontrado.';
  end if;
  if p_equipment_id is not null and not v_ap.ativo then
    raise exception 'Esse aplicador está desativado.';
  end if;
  if v_desde > public.hoje_local() then
    raise exception 'A troca não pode ser numa data futura.';
  end if;

  -- A data não pode voltar antes de uma montagem já registrada dos dois lados.
  select max(desde) into v_ultima from aplicador_montagens
   where aplicador_id = p_aplicador_id
      or (p_equipment_id is not null and equipment_id = p_equipment_id and ate is null);
  if v_ultima is not null and v_desde < v_ultima then
    raise exception 'Já existe uma troca registrada em %. Use uma data igual ou depois dela.', to_char(v_ultima, 'DD/MM/YYYY');
  end if;

  update aplicador_montagens set ate = v_desde
   where aplicador_id = p_aplicador_id and ate is null;

  if p_equipment_id is not null then
    select name into v_eq_nome from equipments where id = p_equipment_id;
    if v_eq_nome is null then
      raise exception 'Equipamento não encontrado.';
    end if;
    update aplicador_montagens set ate = v_desde
     where equipment_id = p_equipment_id and ate is null;
    -- Montagem que abriu e fechou no mesmo dia não conta nada: some.
    delete from aplicador_montagens where ate = desde;
    insert into aplicador_montagens (aplicador_id, equipment_id, desde)
    values (p_aplicador_id, p_equipment_id, v_desde);
  else
    delete from aplicador_montagens where ate = desde;
  end if;

  perform public.registrar_movimentacao(
    'editado', 'aplicadores', p_aplicador_id, 'Aplicador ' || v_ap.nome,
    jsonb_build_object('acao_detalhada',
      case when p_equipment_id is null then 'Guardado na reserva'
           else 'Montado no ' || v_eq_nome end || ' a partir de ' || to_char(v_desde, 'DD/MM/YYYY'))
  );
end;
$$;

-- Leitura do contador do aplicador: passa a ser a nova base.
create or replace function public.registrar_leitura_aplicador(
  p_aplicador_id uuid,
  p_contador integer,
  p_data date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data date := coalesce(p_data, public.hoje_local());
  v_nome text;
begin
  if not has_module_permission('equipamentos') then
    raise exception 'Sem permissão para mexer nos aplicadores.';
  end if;
  if p_contador is null or p_contador < 0 then
    raise exception 'Informe o número do contador.';
  end if;
  if v_data > public.hoje_local() then
    raise exception 'A leitura não pode ser numa data futura.';
  end if;

  update aplicadores set contador_base = p_contador, contador_base_em = v_data
   where id = p_aplicador_id
   returning nome into v_nome;
  if v_nome is null then
    raise exception 'Aplicador não encontrado.';
  end if;

  perform public.registrar_movimentacao(
    'editado', 'aplicadores', p_aplicador_id, 'Aplicador ' || v_nome,
    jsonb_build_object('acao_detalhada', 'Contador lido: ' || p_contador || ' em ' || to_char(v_data, 'DD/MM/YYYY'))
  );
end;
$$;

revoke execute on function public.salvar_aplicador(uuid, text, text, integer, boolean, integer) from public, anon;
revoke execute on function public.montar_aplicador(uuid, uuid, date) from public, anon;
revoke execute on function public.registrar_leitura_aplicador(uuid, integer, date) from public, anon;
grant execute on function public.salvar_aplicador(uuid, text, text, integer, boolean, integer) to authenticated, service_role;
grant execute on function public.montar_aplicador(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.registrar_leitura_aplicador(uuid, integer, date) to authenticated, service_role;

revoke all on public.aplicadores, public.aplicador_montagens, public.aplicadores_uso from anon;
grant select on public.aplicadores, public.aplicador_montagens, public.aplicadores_uso to authenticated, service_role;
