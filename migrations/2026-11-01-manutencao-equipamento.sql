-- Manutenção do HIPRO com lembretes (pedido do dono, 01/11/2026; e-book do
-- HIPRO, capítulo 26 "Manutenção e cuidados operacionais").
--
-- Cada linha é um cuidado de rotina feito num HIPRO. Por enquanto só a troca
-- de água do circuito (a cada 15 dias, com água destilada, deionizada,
-- desmineralizada ou para autoclave). O check de tipo é uma lista: tipo novo
-- (ex.: limpeza do filtro) entra trocando o check e as telas.
--
-- Escrita só por registrar_manutencao_equipamento e
-- excluir_manutencao_equipamento (desfazer engano). Idempotente.

create table if not exists public.manutencoes_equipamento (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipments(id) on delete cascade,
  tipo text not null,
  feita_em date not null default public.hoje_local(),
  observacao text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.manutencoes_equipamento drop constraint if exists manutencoes_equipamento_tipo_check;
alter table public.manutencoes_equipamento
  add constraint manutencoes_equipamento_tipo_check check (tipo in ('troca_agua'));

create index if not exists manutencoes_equipamento_equip_idx
  on public.manutencoes_equipamento (equipment_id, tipo, feita_em desc);

comment on table public.manutencoes_equipamento is
  'Cuidados de rotina feitos em cada HIPRO (hoje só troca_agua, a cada 15 dias). Escrita só por registrar_manutencao_equipamento e excluir_manutencao_equipamento.';

alter table public.manutencoes_equipamento enable row level security;
drop policy if exists "manutencoes_equipamento_select" on public.manutencoes_equipamento;
create policy "manutencoes_equipamento_select" on public.manutencoes_equipamento
  for select using (
    has_module_permission('equipamentos') or has_module_permission('agenda') or has_module_permission('dashboard')
  );

revoke all on public.manutencoes_equipamento from anon;
grant select on public.manutencoes_equipamento to authenticated, service_role;

drop trigger if exists trg_somente_leitura on public.manutencoes_equipamento;
create trigger trg_somente_leitura before insert or update or delete on public.manutencoes_equipamento
  for each statement execute function public.bloquear_somente_leitura();

-- Rótulo do tipo, para mensagens.
create or replace function public.rotulo_manutencao_equipamento(p_tipo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_tipo when 'troca_agua' then 'Troca de água' else p_tipo end;
$$;
revoke execute on function public.rotulo_manutencao_equipamento(text) from public, anon;
grant execute on function public.rotulo_manutencao_equipamento(text) to authenticated, service_role;

create or replace function public.registrar_manutencao_equipamento(
  p_equipment_id uuid,
  p_tipo text,
  p_data date default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_data date := coalesce(p_data, public.hoje_local());
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_id uuid;
begin
  if not has_module_permission('equipamentos') then
    raise exception 'Sem permissão para mexer nos equipamentos.';
  end if;
  if p_tipo is null or p_tipo not in ('troca_agua') then
    raise exception 'Tipo de manutenção desconhecido.';
  end if;
  if v_data > public.hoje_local() then
    raise exception 'A manutenção não pode ser numa data futura.';
  end if;
  if v_data < public.hoje_local() - 365 then
    raise exception 'Data muito antiga. Confira o dia.';
  end if;
  if v_obs is not null and length(v_obs) > 500 then
    raise exception 'Observação muito longa (máximo 500 caracteres).';
  end if;

  select name into v_nome from equipments where id = p_equipment_id;
  if v_nome is null then
    raise exception 'Equipamento não encontrado.';
  end if;

  insert into manutencoes_equipamento (equipment_id, tipo, feita_em, observacao)
  values (p_equipment_id, p_tipo, v_data, v_obs)
  returning id into v_id;

  perform public.registrar_movimentacao(
    'editado', 'equipments', p_equipment_id, 'Equipamento ' || v_nome,
    jsonb_build_object(
      'acao_detalhada', rotulo_manutencao_equipamento(p_tipo) || ' feita em ' || to_char(v_data, 'DD/MM/YYYY'),
      'manutencao_id', v_id,
      'observacao', v_obs
    )
  );
  return v_id;
end;
$$;
revoke execute on function public.registrar_manutencao_equipamento(uuid, text, date, text) from public, anon;
grant execute on function public.registrar_manutencao_equipamento(uuid, text, date, text) to authenticated, service_role;

create or replace function public.excluir_manutencao_equipamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m record;
  v_nome text;
begin
  if not has_module_permission('equipamentos') then
    raise exception 'Sem permissão para mexer nos equipamentos.';
  end if;
  select * into v_m from manutencoes_equipamento where id = p_id;
  if v_m.id is null then
    raise exception 'Registro não encontrado.';
  end if;
  select name into v_nome from equipments where id = v_m.equipment_id;

  delete from manutencoes_equipamento where id = p_id;

  perform public.registrar_movimentacao(
    'excluido', 'equipments', v_m.equipment_id, 'Equipamento ' || coalesce(v_nome, ''),
    jsonb_build_object(
      'acao_detalhada', rotulo_manutencao_equipamento(v_m.tipo) || ' de ' || to_char(v_m.feita_em, 'DD/MM/YYYY') || ' desfeita'
    )
  );
end;
$$;
revoke execute on function public.excluir_manutencao_equipamento(uuid) from public, anon;
grant execute on function public.excluir_manutencao_equipamento(uuid) to authenticated, service_role;
