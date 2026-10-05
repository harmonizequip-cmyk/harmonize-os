-- ============================================================
-- STATUS: ESCRITA E TESTADA num Postgres local com o schema.sql, AINDA NÃO
-- APLICADA (aguarda o dono rodar).
--
-- Locação de vários dias = uma reserva só, com data final, uma taxa só.
--
-- O banco já aceitava período (calendar_events.date_end, a restrição
-- no_equipment_double_booking vale para o período inteiro, e create_rental
-- grava a data final). Faltavam três pontos:
--   1. finalize_rental_reservation não levava a data final da reserva para a
--      locação (rentals.event_date_end ficava vazio).
--   2. reagendar_agendamento colapsava o período em um dia só e conferia
--      conflito apenas no primeiro dia. Agora preserva a duração (ou aceita
--      uma data final nova) e confere conflito no período inteiro.
--   3. disponibilidade_publica (calendário público) só marcava o primeiro dia.
--
-- Correção junto: reagendar_agendamento movia a data de TODOS os lançamentos
-- da locação, inclusive pagamentos e despesas, desencontrando o caixa da data
-- real do pagamento. Agora só acompanha o lançamento de deslocamento, que é o
-- único preso à data do evento.
-- ============================================================

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
set search_path to 'public'
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
  v_desloc_tx uuid;
  v_cat_desloc uuid;
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
  -- igual a create_rental).
  insert into rentals (client_id, equipment_id, event_date, event_date_end, shots, calculated_value, payment_method, notes, created_by, km_ida, valor_deslocamento)
  values (
    v_client_id, v_equipment_id, v_event_date,
    case when v_event_date_end > v_event_date then v_event_date_end else null end,
    p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by, v_km_ida, coalesce(v_valor_deslocamento, 0)
  )
  returning id into v_rental_id;

  if coalesce(v_valor_deslocamento, 0) > 0 then
    select id into v_cat_desloc from categories
     where type = 'entrada' and is_default = true and name ilike 'Deslocamento%' limit 1;

    insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
    values (
      'entrada', v_cat_desloc,
      'Ajuda de custo (deslocamento) - ' || coalesce(v_client_name, ''),
      v_valor_deslocamento, p_payment_method, v_event_date, 'harmonize', v_client_id, v_rental_id, v_created_by
    )
    returning id into v_desloc_tx;

    update rentals set deslocamento_transaction_id = v_desloc_tx where id = v_rental_id;
  end if;

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

-- Assinatura nova (3 parâmetros): a antiga é removida para a chamada com 2
-- argumentos não ficar ambígua. p_nova_data_fim nulo = preserva a duração.
drop function if exists public.reagendar_agendamento(uuid, date);

create or replace function public.reagendar_agendamento(
  p_event_id uuid,
  p_nova_data date,
  p_nova_data_fim date default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_data_antiga date;
  v_fim_antigo date;
  v_nova_fim date;
  v_equipment_id uuid;
  v_rental_id uuid;
  v_status event_status_type;
  v_ocupante text;
  v_ocupante_de date;
  v_ocupante_ate date;
  v_mudou_inicio boolean;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para reagendar.';
  end if;

  select date_start, date_end, equipment_id, rental_id, status
    into v_data_antiga, v_fim_antigo, v_equipment_id, v_rental_id, v_status
    from calendar_events where id = p_event_id;

  if v_data_antiga is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento está cancelado e não pode ser reagendado.';
  end if;

  -- Sem data final informada, o período se mantém com a mesma duração.
  v_nova_fim := coalesce(p_nova_data_fim, p_nova_data + (v_fim_antigo - v_data_antiga));
  if v_nova_fim < p_nova_data then
    raise exception 'A data final do período não pode ser antes da data inicial.';
  end if;
  if p_nova_data = v_data_antiga and v_nova_fim = v_fim_antigo then
    raise exception 'A data nova é igual à atual.';
  end if;
  v_mudou_inicio := p_nova_data <> v_data_antiga;

  if v_equipment_id is not null then
    select coalesce(c.name, ev.title), ev.date_start, ev.date_end
      into v_ocupante, v_ocupante_de, v_ocupante_ate
      from calendar_events ev
      left join clients c on c.id = ev.client_id
     where ev.equipment_id = v_equipment_id
       and ev.status <> 'cancelada'
       and ev.id <> p_event_id
       and daterange(ev.date_start, ev.date_end, '[]') && daterange(p_nova_data, v_nova_fim, '[]')
     limit 1;

    if v_ocupante is not null then
      raise exception 'O equipamento já está reservado de % a % para %.',
        to_char(v_ocupante_de, 'DD/MM/YYYY'), to_char(v_ocupante_ate, 'DD/MM/YYYY'), v_ocupante;
    end if;
  end if;

  -- A locação é atualizada ANTES do evento: o gatilho que copia a data do
  -- evento para a locação rodaria com a data final antiga e a restrição
  -- (data final >= data inicial) barraria o reagendamento de um período.
  -- A marca de reagendado só vale quando o início mudou (mudar só a data
  -- final é ajustar o período, não reagendar).
  if v_rental_id is not null then
    update rentals
       set event_date = p_nova_data,
           event_date_end = case when v_nova_fim > p_nova_data then v_nova_fim else null end,
           rescheduled = rescheduled or v_mudou_inicio,
           rescheduled_at = case when v_mudou_inicio then now() else rescheduled_at end
     where id = v_rental_id;

    -- Só o lançamento de deslocamento acompanha a data do evento. Pagamentos
    -- guardam o dia em que o dinheiro entrou e despesas têm a própria data:
    -- reagendar não mexe nelas.
    if v_mudou_inicio then
      update transactions
         set date = p_nova_data
       where id = (select deslocamento_transaction_id from rentals where id = v_rental_id);
    end if;
  end if;

  update calendar_events
     set date_start = p_nova_data,
         date_end   = v_nova_fim,
         rescheduled = rescheduled or v_mudou_inicio,
         rescheduled_at = case when v_mudou_inicio then now() else rescheduled_at end
   where id = p_event_id;

  perform public.registrar_movimentacao(
    case when v_mudou_inicio then 'reagendado' else 'editado' end,
    'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object(
      'acao_detalhada', case when v_mudou_inicio then 'reagendado' else 'período alterado' end,
      'data_antiga', to_char(v_data_antiga, 'DD/MM/YYYY'),
      'data_nova',   to_char(p_nova_data, 'DD/MM/YYYY'),
      'fim_antigo',  to_char(v_fim_antigo, 'DD/MM/YYYY'),
      'fim_novo',    to_char(v_nova_fim, 'DD/MM/YYYY')
    )
  );

exception
  when exclusion_violation then
    raise exception 'O equipamento já está reservado no período de % a %.',
      to_char(p_nova_data, 'DD/MM/YYYY'), to_char(v_nova_fim, 'DD/MM/YYYY');
end;
$$;

revoke execute on function public.reagendar_agendamento(uuid, date, date) from public, anon;
grant execute on function public.reagendar_agendamento(uuid, date, date) to authenticated, service_role;

-- Calendário público: marca todos os dias do período, não só o primeiro.
create or replace function public.disponibilidade_publica(p_inicio date, p_fim date)
returns table(data date, equipamento text, situacao text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select d::date,
         e.code::text,
         case when ce.taxa_status = 'pendente' then 'pre_reserva'
              else 'agendado' end
    from calendar_events ce
    join equipments e on e.id = ce.equipment_id
    cross join lateral generate_series(ce.date_start::timestamp, ce.date_end::timestamp, interval '1 day') d
   where d::date between p_inicio and p_fim
     and ce.status <> 'cancelada'
   order by d::date, e.code;
$$;
