-- ============================================================
-- LEVA N: finalize_rental_reservation cobra mentoria de verdade
--
-- CONTEXTO
-- A leva K adicionou calendar_events.is_mentoria só como destaque
-- visual, partindo do entendimento (errado, corrigido depois) de que
-- mentoria nunca gerava faturamento. Na prática existe cobrança por
-- paciente modelo (ver leva M para os valores em settings). Esta leva
-- ensina finalize_rental_reservation a olhar is_mentoria e, quando
-- verdadeiro, categorizar a transação como "Mentoria" em vez de
-- "Locação" — o resto do fluxo (rentals, transactions, calendar_events)
-- continua idêntico, porque a diferença real está só na categoria e na
-- descrição do lançamento.
--
-- Deliberadamente NÃO lê is_mentoria de um parâmetro novo: lê direto de
-- calendar_events, a mesma linha que a função já busca por
-- p_calendar_event_id. Assim o comportamento fica amarrado ao que foi
-- de fato marcado na reserva (ReservarHiproModal), sem depender do
-- front-end mandar a flag certa de novo na hora de finalizar.
--
-- p_shots continua sendo a quantidade que o front manda: para uma
-- locação normal, é a quantidade de disparos; para mentoria, o
-- FinalizarReservaModal passa a quantidade de pacientes modelo (a
-- coluna rentals.shots exige > 0, o que já vale para as duas coisas).
-- p_calculated_value idem: já vem calculado pelo front (disparos x
-- tabela de preço, ou pacientes modelo x valor unitário conforme forma
-- de pagamento).
-- ============================================================

create or replace function public.finalize_rental_reservation(
  p_calendar_event_id uuid,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_transaction_id uuid;
  v_category_id uuid;
  v_client_id uuid;
  v_equipment_id uuid;
  v_event_date date;
  v_client_name text;
  v_is_mentoria boolean;
  v_created_by uuid := auth.uid();
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para finalizar locações';
  end if;

  select client_id, equipment_id, date_start, is_mentoria
    into v_client_id, v_equipment_id, v_event_date, v_is_mentoria
  from calendar_events
  where id = p_calendar_event_id and rental_id is null and status = 'pre_reserva';

  if v_client_id is null then
    raise exception 'Reserva não encontrada, já finalizada, ou sem cliente vinculado.';
  end if;
  if v_equipment_id is null then
    raise exception 'Esta reserva não está vinculada a um equipamento HIPRO.';
  end if;

  select name into v_client_name from clients where id = v_client_id;

  if coalesce(v_is_mentoria, false) then
    select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Mentoria%' limit 1;
    if v_category_id is null then
      raise exception 'Categoria "Mentoria" não encontrada (foi renomeada ou removida?). Ajuste o cadastro de categorias antes de finalizar a mentoria.';
    end if;
  else
    select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Loca%' limit 1;
    if v_category_id is null then
      raise exception 'Categoria "Locação" não encontrada (foi renomeada ou removida?). Ajuste o cadastro de categorias antes de finalizar a reserva.';
    end if;
  end if;

  insert into rentals (client_id, equipment_id, event_date, shots, calculated_value, payment_method, notes, created_by)
  values (v_client_id, v_equipment_id, v_event_date, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by)
  returning id into v_rental_id;

  insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
  values (
    'entrada',
    v_category_id,
    (case when coalesce(v_is_mentoria, false) then 'Mentoria HIPRO - ' else 'Locação HIPRO - ' end) || coalesce(v_client_name, ''),
    p_calculated_value, p_payment_method, v_event_date, 'harmonize', v_client_id, v_rental_id, v_created_by
  )
  returning id into v_transaction_id;

  update rentals set transaction_id = v_transaction_id where id = v_rental_id;

  update calendar_events
  set status = 'confirmada',
      value = p_calculated_value,
      rental_id = v_rental_id,
      notes = coalesce(p_notes, notes)
  where id = p_calendar_event_id;

  update clients set stage = 'cliente' where id = v_client_id and stage <> 'cliente';

  return v_rental_id;
end;
$$;

grant execute on function public.finalize_rental_reservation to authenticated;
