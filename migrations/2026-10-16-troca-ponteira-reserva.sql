-- ============================================================
-- TROCA DE PONTEIRA DURANTE O ATENDIMENTO (antes de finalizar)
--
-- STATUS: AGUARDANDO O DONO
--
-- Na reserva, o dono já grava a contagem inicial (calendar_events.contagem_inicial).
-- Quando troca a ponteira no meio do atendimento, grava agora o disparo final
-- da ponteira que saiu (somar ou gerar crédito) e a contagem inicial da nova.
-- As contagens fechadas ficam em reserva_contagens; contagem_inicial passa a
-- ser a da ponteira atual (contagem_aplicador_id). Na finalização tudo vem
-- preenchido e vai para locacao_contagens.
-- ============================================================

alter table public.calendar_events add column if not exists contagem_aplicador_id uuid references public.aplicadores(id) on delete set null;
comment on column public.calendar_events.contagem_aplicador_id is
  'Ponteira em uso na reserva (a da contagem_inicial atual).';

create table if not exists public.reserva_contagens (
  id uuid primary key default gen_random_uuid(),
  calendar_event_id uuid not null references public.calendar_events(id) on delete cascade,
  ordem smallint not null check (ordem between 1 and 10),
  inicial bigint not null check (inicial >= 0),
  final bigint not null,
  gera_credito boolean not null default false,
  aplicador_id uuid references public.aplicadores(id) on delete set null,
  created_at timestamptz not null default now(),
  check (final > inicial),
  unique (calendar_event_id, ordem)
);
alter table public.reserva_contagens enable row level security;
create policy "reserva_contagens_select" on public.reserva_contagens for select
  using (has_module_permission('agenda') or has_module_permission('financeiro'));
grant select on public.reserva_contagens to authenticated;
create trigger trg_somente_leitura before insert or update or delete on public.reserva_contagens for each statement execute function public.bloquear_somente_leitura();
comment on table public.reserva_contagens is
  'Contagens já fechadas de uma reserva (troca de ponteira antes de finalizar). Escrita só por trocar_ponteira_reserva/desfazer_troca_ponteira_reserva.';

create or replace function public.trocar_ponteira_reserva(
  p_event_id uuid,
  p_final_atual bigint,
  p_gera_credito boolean,
  p_inicial_nova bigint,
  p_aplicador_novo uuid default null,
  p_registrar_troca boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev record;
  v_ini bigint;
  v_fim bigint;
  v_ordem int;
  v_montado uuid;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar agendamentos.';
  end if;
  select id, status::text as status, rental_id, equipment_id, contagem_inicial, contagem_aplicador_id, date_start
    into v_ev from calendar_events where id = p_event_id;
  if v_ev.id is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_ev.equipment_id is null then raise exception 'Só reservas de equipamento têm contagem.'; end if;
  if v_ev.status = 'cancelada' then raise exception 'Este agendamento está cancelado.'; end if;
  if v_ev.rental_id is not null then raise exception 'Esta reserva já foi finalizada.'; end if;
  if v_ev.contagem_inicial is null then raise exception 'Grave antes a contagem inicial da ponteira atual.'; end if;
  if p_final_atual is null or p_final_atual < 0 or p_inicial_nova is null or p_inicial_nova < 0 then
    raise exception 'Preencha o disparo final da ponteira atual e a contagem inicial da nova.';
  end if;
  v_ini := least(v_ev.contagem_inicial, p_final_atual);
  v_fim := greatest(v_ev.contagem_inicial, p_final_atual);
  if v_fim = v_ini then raise exception 'O disparo final é igual à contagem inicial.'; end if;
  if p_aplicador_novo is not null and not exists (select 1 from aplicadores where id = p_aplicador_novo and ativo) then
    raise exception 'Ponteira nova não encontrada.';
  end if;

  select coalesce(max(ordem), 0) + 1 into v_ordem from reserva_contagens where calendar_event_id = p_event_id;
  if v_ordem > 9 then raise exception 'Limite de trocas de ponteira atingido.'; end if;
  insert into reserva_contagens (calendar_event_id, ordem, inicial, final, gera_credito, aplicador_id)
  values (p_event_id, v_ordem, v_ini, v_fim, coalesce(p_gera_credito, false), v_ev.contagem_aplicador_id);

  update calendar_events
     set contagem_inicial = p_inicial_nova,
         contagem_inicial_em = now(),
         contagem_aplicador_id = p_aplicador_novo
   where id = p_event_id;

  -- A ponteira nova passa a ficar montada no HIPRO (desgaste por aplicador).
  if p_aplicador_novo is not null and coalesce(p_registrar_troca, true) then
    select aplicador_id into v_montado from aplicador_montagens where equipment_id = v_ev.equipment_id and ate is null;
    if v_montado is distinct from p_aplicador_novo then
      perform montar_aplicador(p_aplicador_novo, v_ev.equipment_id, least(hoje_local(), v_ev.date_start));
    end if;
  end if;

  perform registrar_movimentacao('editado', 'calendar_events', p_event_id, descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('acao_detalhada', 'Troca de ponteira: contagem ' || v_ordem || ' fechada (' || v_ini || ' a ' || v_fim || ')'
                         || case when p_gera_credito then ', vira crédito' else '' end,
                       'inicial_nova', p_inicial_nova));
end;
$$;

-- Desfaz a última troca (gravou errado): a contagem fechada volta a ser a atual.
create or replace function public.desfazer_troca_ponteira_reserva(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ult record;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar agendamentos.';
  end if;
  if exists (select 1 from calendar_events where id = p_event_id and rental_id is not null) then
    raise exception 'Esta reserva já foi finalizada.';
  end if;
  select * into v_ult from reserva_contagens where calendar_event_id = p_event_id order by ordem desc limit 1;
  if v_ult.id is null then raise exception 'Não há troca de ponteira para desfazer.'; end if;
  delete from reserva_contagens where id = v_ult.id;
  update calendar_events
     set contagem_inicial = v_ult.inicial, contagem_inicial_em = now(), contagem_aplicador_id = v_ult.aplicador_id
   where id = p_event_id;
  perform registrar_movimentacao('editado', 'calendar_events', p_event_id, descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('acao_detalhada', 'Troca de ponteira desfeita (contagem ' || v_ult.ordem || ')'));
end;
$$;

revoke execute on function public.trocar_ponteira_reserva(uuid, bigint, boolean, bigint, uuid, boolean) from public, anon;
grant execute on function public.trocar_ponteira_reserva(uuid, bigint, boolean, bigint, uuid, boolean) to authenticated, service_role;
revoke execute on function public.desfazer_troca_ponteira_reserva(uuid) from public, anon;
grant execute on function public.desfazer_troca_ponteira_reserva(uuid) to authenticated, service_role;
