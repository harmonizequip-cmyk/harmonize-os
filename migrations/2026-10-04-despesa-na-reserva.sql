-- Despesa dentro da reserva + amarração automática ao finalizar.
--
-- 1. transactions.calendar_event_id: a despesa pode nascer na reserva.
-- 2. registrar_despesa_reserva: lança a despesa a partir do agendamento.
-- 3. Gatilho: ao finalizar a reserva com os disparos, as despesas dela
--    passam para a locação criada.
-- 4. A view transactions_contabilizaveis usa select *, então precisa ser
--    recriada para enxergar a coluna nova.

-- Despesa lançada dentro da reserva (antes de existir a locação). O
-- lançamento guarda o agendamento a que pertence; quando a reserva é
-- finalizada com os disparos, o gatilho mais abaixo passa a despesa para a
-- locação recém-criada, e ela entra no lucro da locação (rentals_lucro).
alter table public.transactions
  add column if not exists calendar_event_id uuid references public.calendar_events(id) on delete set null;

create index if not exists transactions_calendar_event_id_idx
  on public.transactions(calendar_event_id) where calendar_event_id is not null;

comment on column public.transactions.calendar_event_id is
  'Agendamento (reserva) a que a despesa pertence, quando lançada antes de existir a locação. Ao finalizar a reserva, o gatilho calendar_events_amarra_despesas preenche rental_id com a locação criada.';

create or replace function public.registrar_despesa_reserva(
  p_event_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_payment_method payment_method_type,
  p_date date default public.hoje_local(),
  p_description text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_rental_id uuid;
  v_status event_status_type;
  v_achou boolean;
  v_transaction_id uuid;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para lançar despesas.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor da despesa precisa ser maior que zero.';
  end if;

  select true, client_id, rental_id, status
    into v_achou, v_client_id, v_rental_id, v_status
    from calendar_events where id = p_event_id;
  if v_achou is not true then
    raise exception 'Reserva não encontrada.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Esta reserva está cancelada. Reative-a antes de lançar despesa.';
  end if;

  insert into transactions (
    type, category_id, description, amount, payment_method, date, scope,
    client_id, rental_id, calendar_event_id, notes, created_by
  )
  values (
    'saida', p_category_id, coalesce(nullif(trim(p_description), ''), 'Despesa da reserva'),
    p_amount, p_payment_method, p_date, 'harmonize', v_client_id, v_rental_id, p_event_id, p_notes, auth.uid()
  )
  returning id into v_transaction_id;

  perform public.registrar_movimentacao(
    'criado', 'transactions', v_transaction_id,
    public.descrever_registro('transactions', v_transaction_id),
    jsonb_build_object('acao_detalhada', 'despesa lançada na reserva', 'calendar_event_id', p_event_id)
  );

  return v_transaction_id;
end;
$$;

grant execute on function public.registrar_despesa_reserva to authenticated;

-- Quando a reserva ganha uma locação (finalizar com disparos), as despesas
-- lançadas nela passam a pertencer à locação.
create or replace function public.trg_amarrar_despesas_da_reserva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rental_id is not null and new.rental_id is distinct from old.rental_id then
    update transactions
       set rental_id = new.rental_id
     where calendar_event_id = new.id
       and type = 'saida'
       and rental_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_events_amarra_despesas on public.calendar_events;
create trigger calendar_events_amarra_despesas
  after update of rental_id on public.calendar_events
  for each row execute function public.trg_amarrar_despesas_da_reserva();

create or replace view public.transactions_contabilizaveis
with (security_invoker = true) as
select t.*
from public.transactions t
where t.is_test = false
  and (
    t.client_id is null
    or not exists (
      select 1 from public.clients c
      where c.id = t.client_id and c.excluir_financeiro
    )
  )
  and (
    t.rental_id is null
    or exists (
      select 1
      from public.rentals r
      where r.id = t.rental_id
        and r.status <> 'cancelada'
    )
  );

comment on view public.transactions_contabilizaveis is
  'Lançamentos que contam no caixa: exclui modo teste, lançamentos presos a locação cancelada, e cliente marcado excluir_financeiro (leva G). Financeiro, Dashboard e Relatórios devem ler daqui, nunca de transactions direto. Atenção: usa select *, então ao adicionar coluna em transactions é preciso rodar este create or replace view de novo.';

grant select on public.rentals_contabilizaveis to authenticated;
grant select on public.transactions_contabilizaveis to authenticated;
