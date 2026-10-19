-- Deslocamento cobrado à parte entra no caixa só quando a cliente paga
-- (decisão do dono, 19/10/2026).
--
-- Antes: o deslocamento lançado na reserva (ou na edição da locação, sem a
-- caixinha "já está no valor") virava uma entrada no Financeiro na hora da
-- finalização, pago ou não, ficava fora do saldo a receber e fora do lucro.
-- Agora: ele faz parte do que a cliente deve (saldo, Pendências, Receber
-- pagamento) e do lucro líquido da locação; o dinheiro entra no caixa pelo
-- pagamento da locação, como o resto.
--
-- Valor devido da locação = calculated_value + deslocamento cobrado à parte
-- (valor_deslocamento quando deslocamento_incluso_no_valor = false).

-- ------------------------------------------------------------
-- 1. "Pago" calculado pelo valor devido
-- ------------------------------------------------------------
create or replace function public.recalcular_pagamento_locacao(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric;
  v_credito numeric;
  v_pago_total numeric;
  v_saldo numeric;
  v_ultima_data date;
begin
  select calculated_value + case when deslocamento_incluso_no_valor then 0 else coalesce(valor_deslocamento, 0) end
    into v_valor
    from rentals where id = p_rental_id;
  if v_valor is null then
    return; -- locação já não existe mais (apagada em cascata); nada a fazer.
  end if;

  select coalesce(sum(ev.taxa_valor), 0) into v_credito
    from calendar_events ev
   where ev.rental_id = p_rental_id and ev.taxa_status = 'paga';

  select coalesce(sum(valor), 0), max(data) into v_pago_total, v_ultima_data
    from rental_payments where rental_id = p_rental_id;

  v_saldo := round(v_valor - v_credito - v_pago_total, 2);

  update rentals
     set pago = (v_saldo <= 0),
         pago_em = case when v_saldo <= 0 then v_ultima_data else null end
   where id = p_rental_id;
end;
$$;

-- ------------------------------------------------------------
-- 2. Saldo a receber inclui o deslocamento cobrado à parte
--    (coluna nova valor_devido no fim, para não quebrar quem lê a view)
-- ------------------------------------------------------------
create or replace view public.rentals_situacao_pagamento
with (security_invoker = true) as
select
  r.id as rental_id,
  r.calculated_value,
  coalesce((
    select sum(ev.taxa_valor) from calendar_events ev
     where ev.rental_id = r.id and ev.taxa_status = 'paga'
  ), 0) as credito_taxa,
  coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0) as total_pago,
  greatest(
    r.calculated_value
      + case when r.deslocamento_incluso_no_valor then 0 else coalesce(r.valor_deslocamento, 0) end
      - coalesce((select sum(ev.taxa_valor) from calendar_events ev where ev.rental_id = r.id and ev.taxa_status = 'paga'), 0)
      - coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0),
    0
  ) as saldo,
  case
    when coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0) = 0 then 'aberto'
    when r.pago then 'pago'
    else 'parcial'
  end as situacao,
  r.calculated_value
    + case when r.deslocamento_incluso_no_valor then 0 else coalesce(r.valor_deslocamento, 0) end as valor_devido
from rentals r;

grant select on public.rentals_situacao_pagamento to authenticated;

-- ------------------------------------------------------------
-- 3. Lucro líquido conta o deslocamento cobrado à parte
--    (coluna nova valor_total no fim)
-- ------------------------------------------------------------
create or replace view public.rentals_lucro
with (security_invoker = true) as
select
  r.id as rental_id,
  r.client_id,
  c.name as cliente,
  r.event_date,
  r.calculated_value,
  r.valor_deslocamento,
  coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0) as total_pago,
  coalesce((select sum(t.amount) from transactions t
             where t.rental_id = r.id and t.type = 'saida' and not t.is_test
               and (t.scope = 'harmonize' or t.conta_no_lucro)), 0) as total_despesas,
  r.calculated_value
    + case when r.deslocamento_incluso_no_valor then 0 else coalesce(r.valor_deslocamento, 0) end
    - coalesce((select sum(t.amount) from transactions t
             where t.rental_id = r.id and t.type = 'saida' and not t.is_test
               and (t.scope = 'harmonize' or t.conta_no_lucro)), 0) as lucro_liquido,
  r.calculated_value
    + case when r.deslocamento_incluso_no_valor then 0 else coalesce(r.valor_deslocamento, 0) end as valor_total
from rentals r
left join clients c on c.id = r.client_id
where r.status <> 'cancelada' and r.is_test = false
  and not coalesce(c.excluir_financeiro, false);

grant select on public.rentals_lucro to authenticated;

-- ------------------------------------------------------------
-- 4. Definir deslocamento da locação: não cria mais lançamento no Financeiro;
--    só grava o valor e recalcula o "pago". Recusa deixar o devido abaixo do
--    que já foi recebido.
-- ------------------------------------------------------------
create or replace function public.definir_deslocamento_locacao(
  p_rental_id uuid,
  p_km_ida numeric,
  p_valor_deslocamento numeric,
  p_incluso_no_valor boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric := round(coalesce(p_valor_deslocamento, 0), 2);
  v_incluso boolean;
  v_calculado numeric;
  v_tx_id uuid;
  v_recebido numeric;
  v_devido numeric;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar locações.';
  end if;
  if p_valor_deslocamento is not null and p_valor_deslocamento < 0 then
    raise exception 'O valor de deslocamento não pode ser negativo.';
  end if;

  select deslocamento_incluso_no_valor, calculated_value, deslocamento_transaction_id
    into v_incluso, v_calculado, v_tx_id
    from rentals where id = p_rental_id;

  if not found then
    raise exception 'Locação não encontrada.';
  end if;

  if p_incluso_no_valor is not null then
    v_incluso := p_incluso_no_valor;
  end if;

  v_devido := v_calculado + case when v_incluso then 0 else v_valor end;
  select coalesce((select sum(valor) from rental_payments where rental_id = p_rental_id), 0)
       + coalesce((select sum(taxa_valor) from calendar_events where rental_id = p_rental_id and taxa_status = 'paga'), 0)
    into v_recebido;
  if round(v_devido, 2) < round(v_recebido, 2) then
    raise exception 'Com esse deslocamento a locação fica em R$ %, abaixo do que já foi recebido (R$ %). Remova ou corrija o pagamento antes.',
      to_char(v_devido, 'FM999G990D00'), to_char(v_recebido, 'FM999G990D00');
  end if;

  -- Lançamento antigo de ajuda de custo (de antes desta regra): sai, porque o
  -- deslocamento agora entra pelo pagamento da locação.
  if v_tx_id is not null then
    update rentals set deslocamento_transaction_id = null where id = p_rental_id;
    if not exists (select 1 from rental_payments where transaction_id = v_tx_id) then
      delete from transactions where id = v_tx_id;
    end if;
  end if;

  update rentals
     set km_ida = p_km_ida,
         valor_deslocamento = v_valor,
         deslocamento_incluso_no_valor = v_incluso
   where id = p_rental_id;

  perform public.recalcular_pagamento_locacao(p_rental_id);

  perform public.registrar_movimentacao(
    'editado', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object(
      'acao_detalhada', 'deslocamento definido',
      'km_ida', p_km_ida,
      'valor_deslocamento', v_valor,
      'incluso_no_valor', v_incluso
    )
  );
end;
$$;

revoke execute on function public.definir_deslocamento_locacao(uuid, numeric, numeric, boolean) from public, anon;
grant execute on function public.definir_deslocamento_locacao(uuid, numeric, numeric, boolean) to authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Finalizar reserva: o deslocamento da reserva vai para a locação como
--    valor a receber, sem lançamento próprio no Financeiro.
-- ------------------------------------------------------------
create or replace function public.finalize_rental_reservation(
  p_calendar_event_id uuid,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_notes text default null,
  p_pix_conta text default null,
  p_pago boolean default true
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
  v_event_date_end date;
  v_client_name text;
  v_is_mentoria boolean;
  v_km_ida numeric;
  v_valor_deslocamento numeric;
  v_created_by uuid := auth.uid();
  v_pix_conta text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para finalizar locações';
  end if;

  select client_id, equipment_id, date_start, date_end, is_mentoria, km_ida, valor_deslocamento
    into v_client_id, v_equipment_id, v_event_date, v_event_date_end, v_is_mentoria, v_km_ida, v_valor_deslocamento
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

  -- A data final da reserva vai para a locação (nula quando é de um dia só,
  -- igual a create_rental). O deslocamento da reserva fica cobrado à parte
  -- (deslocamento_incluso_no_valor = false): soma no saldo a receber.
  insert into rentals (client_id, equipment_id, event_date, event_date_end, shots, calculated_value, payment_method, notes, created_by, km_ida, valor_deslocamento)
  values (
    v_client_id, v_equipment_id, v_event_date,
    case when v_event_date_end > v_event_date then v_event_date_end else null end,
    p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by, v_km_ida, coalesce(v_valor_deslocamento, 0)
  )
  returning id into v_rental_id;

  if p_pago then
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
    values (
      'entrada',
      v_category_id,
      (case when coalesce(v_is_mentoria, false) then 'Mentoria HIPRO - ' else 'Locação HIPRO - ' end) || coalesce(v_client_name, ''),
      p_calculated_value, p_payment_method, v_event_date, 'harmonize', v_client_id, v_rental_id, v_created_by
    )
    returning id into v_transaction_id;

    v_pix_conta := case when p_payment_method = 'pix' then coalesce(p_pix_conta, 'harmonize') else null end;

    insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, created_by)
    values (v_rental_id, p_payment_method, p_calculated_value, v_event_date, v_pix_conta, v_transaction_id, v_created_by);

    update rentals set transaction_id = v_transaction_id where id = v_rental_id;
  end if;

  perform public.recalcular_pagamento_locacao(v_rental_id);

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

revoke execute on function public.finalize_rental_reservation(uuid, integer, numeric, payment_method_type, text, text, boolean) from public, anon;
grant execute on function public.finalize_rental_reservation(uuid, integer, numeric, payment_method_type, text, text, boolean) to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. Editar locação: a trava "valor abaixo do recebido" passa a considerar o
--    deslocamento cobrado à parte.
-- ------------------------------------------------------------
create or replace function public.update_rental(
  p_rental_id uuid,
  p_equipment_id uuid,
  p_event_date date,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_status event_status_type,
  p_notes text default null,
  p_event_date_end date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_old_date date;
  v_old_status event_status_type;
  v_old_value numeric;
  v_desloc_extra numeric;
  v_descricao text;
  v_equipment_code equipment_code_type;
  v_date_end date;
  v_recebido numeric;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para editar locações';
  end if;

  if p_event_date_end is not null and p_event_date_end < p_event_date then
    raise exception 'A data final do período não pode ser antes da data inicial.';
  end if;
  v_date_end := coalesce(p_event_date_end, p_event_date);

  select client_id, event_date, status, calculated_value,
         case when deslocamento_incluso_no_valor then 0 else coalesce(valor_deslocamento, 0) end
    into v_client_id, v_old_date, v_old_status, v_old_value, v_desloc_extra
    from rentals where id = p_rental_id;

  if v_client_id is null then
    raise exception 'Locação não encontrada (id %).', p_rental_id;
  end if;

  if p_status = 'cancelada' and v_old_status is distinct from 'cancelada' then
    raise exception 'Para cancelar uma locação, use o botão "Cancelar locação" (motivo e não comparecimento ficam registrados). Não é possível cancelar por aqui.';
  end if;

  -- Valor novo (mais o deslocamento cobrado à parte) abaixo do que já entrou
  -- deixaria saldo negativo. Só vale quando o valor muda.
  if p_calculated_value is distinct from v_old_value then
    select coalesce((select sum(valor) from rental_payments where rental_id = p_rental_id), 0)
         + coalesce((select sum(taxa_valor) from calendar_events where rental_id = p_rental_id and taxa_status = 'paga'), 0)
      into v_recebido;
    if round(p_calculated_value + v_desloc_extra, 2) < round(v_recebido, 2) then
      raise exception 'O valor novo (R$ %) fica abaixo do que já foi recebido (R$ %). Remova ou corrija o pagamento antes.',
        to_char(p_calculated_value + v_desloc_extra, 'FM999G990D00'), to_char(v_recebido, 'FM999G990D00');
    end if;
  end if;

  select code into v_equipment_code from equipments where id = p_equipment_id;
  if v_equipment_code is null then
    raise exception 'Equipamento não encontrado (id %).', p_equipment_id;
  end if;

  update rentals
  set equipment_id = p_equipment_id,
      event_date = p_event_date,
      event_date_end = p_event_date_end,
      shots = p_shots,
      calculated_value = p_calculated_value,
      payment_method = p_payment_method,
      status = p_status,
      notes = p_notes,
      rescheduled = rescheduled or (v_old_date is not null and v_old_date <> p_event_date)
  where id = p_rental_id;

  update calendar_events
  set event_type = v_equipment_code::text::calendar_event_type,
      equipment_id = p_equipment_id,
      date_start = p_event_date,
      date_end = v_date_end,
      value = p_calculated_value,
      status = p_status
  where rental_id = p_rental_id;

  perform public.recalcular_pagamento_locacao(p_rental_id);

  v_descricao := public.descrever_registro('rentals', p_rental_id);

  if v_old_date is distinct from p_event_date then
    perform public.registrar_movimentacao(
      'reagendado', 'rentals', p_rental_id, v_descricao,
      jsonb_build_object(
        'data_antiga', to_char(v_old_date, 'DD/MM/YYYY'),
        'data_nova',   to_char(p_event_date, 'DD/MM/YYYY')
      )
    );
  elsif v_old_status is distinct from p_status then
    perform public.registrar_movimentacao(
      case p_status
        when 'cancelada' then 'cancelado'
        when 'confirmada' then 'confirmado'
        else 'editado'
      end,
      'rentals', p_rental_id, v_descricao,
      jsonb_build_object(
        'status_antigo', v_old_status::text,
        'status_novo',   p_status::text
      )
    );
  elsif v_old_value is distinct from p_calculated_value then
    perform public.registrar_movimentacao(
      'editado', 'rentals', p_rental_id, v_descricao,
      jsonb_build_object(
        'valor_antigo', round(coalesce(v_old_value, 0), 2),
        'valor_novo',   round(coalesce(p_calculated_value, 0), 2)
      )
    );
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 7. Dados: a ajuda de custo que já virou entrada no Financeiro (locação já
--    paga) passa a ser um pagamento da locação. O dinheiro no caixa não muda:
--    é o mesmo lançamento, só ligado ao pagamento.
-- ------------------------------------------------------------
insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, notes, created_by)
select r.id, t.payment_method, t.amount, t.date,
       case when t.payment_method = 'pix' then 'harmonize' else null end,
       t.id, 'Deslocamento', t.created_by
  from rentals r
  join transactions t on t.id = r.deslocamento_transaction_id
 where not r.deslocamento_incluso_no_valor
   and not exists (select 1 from rental_payments rp where rp.transaction_id = t.id);

update rentals set deslocamento_transaction_id = null
 where deslocamento_transaction_id is not null;

select public.recalcular_pagamento_locacao(r.id)
  from rentals r
 where r.valor_deslocamento > 0;
