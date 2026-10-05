-- ============================================================
-- STATUS: ESCRITA E TESTADA num Postgres local com o schema.sql (sem erro), AINDA NÃO APLICADA (aguarda aval do dono para rodar).
--
-- Data da taxa de reserva = dia em que o dinheiro entrou.
--
-- Antes: definir_taxa_agendamento(..., 'paga') lançava a entrada no caixa na
-- data do EVENTO (futura). A taxa recebida hoje não aparecia em "Entradas" de
-- hoje nem do mês corrente. Regra decidida pelo dono em 05/10/2026: a taxa
-- entra no caixa no dia em que foi paga, que é uma data diferente da do
-- fechamento dos disparos (event_date da locação) e da data da reserva.
--
-- Agora: parâmetro novo p_data (data do recebimento). Sem ele, vale hoje
-- (hoje_local, fuso de Brasília). Chamadas antigas, com 3 argumentos,
-- continuam funcionando e passam a datar em hoje.
--
-- A assinatura muda (4 parâmetros), então a função antiga é removida: manter
-- as duas deixaria a chamada com 3 argumentos ambígua.
-- ============================================================

drop function if exists public.definir_taxa_agendamento(uuid, text, payment_method_type);

create or replace function public.definir_taxa_agendamento(
  p_event_id uuid,
  p_status text,
  p_payment_method payment_method_type default 'pix',
  p_data date default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status_atual text;
  v_transacao_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_data_evento date;
  v_data_pagamento date := coalesce(p_data, public.hoje_local());
  v_categoria uuid;
  v_valor numeric;
  v_rental_id uuid;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar a taxa.';
  end if;

  if p_status not in ('nao_aplica', 'pendente', 'paga', 'perdida') then
    raise exception 'Estado de taxa inválido: %', p_status;
  end if;

  select ev.taxa_status, ev.taxa_transaction_id, ev.client_id, ev.date_start, c.name, ev.rental_id
    into v_status_atual, v_transacao_id, v_client_id, v_data_evento, v_client_name, v_rental_id
    from calendar_events ev
    left join clients c on c.id = ev.client_id
   where ev.id = p_event_id;

  if v_data_evento is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if p_status = 'perdida' and v_status_atual <> 'paga' then
    raise exception 'Só faz sentido marcar como perdida uma taxa que estava paga.';
  end if;

  v_valor := public.valor_taxa_atual();

  if p_status = 'paga' and v_transacao_id is null then
    select id into v_categoria
      from categories
     where type = 'entrada' and name ilike 'Taxa%'
     limit 1;

    insert into transactions (
      type, category_id, description, amount, payment_method, date, scope, client_id, created_by
    )
    values (
      'entrada', v_categoria,
      'Taxa de compromisso - ' || coalesce(v_client_name, 'cliente'),
      v_valor, p_payment_method, v_data_pagamento, 'harmonize', v_client_id, auth.uid()
    )
    returning id into v_transacao_id;

  elsif p_status in ('nao_aplica', 'pendente') and v_transacao_id is not null then
    update calendar_events set taxa_transaction_id = null where id = p_event_id;
    delete from transactions where id = v_transacao_id;
    v_transacao_id := null;
  end if;

  update calendar_events
     set taxa_status = p_status,
         taxa_valor = case when p_status in ('paga', 'perdida', 'pendente') then v_valor else null end,
         taxa_transaction_id = v_transacao_id
   where id = p_event_id;

  if v_rental_id is not null then
    perform public.recalcular_pagamento_locacao(v_rental_id);
  end if;

  perform public.registrar_movimentacao(
    case p_status
      when 'paga'     then 'taxa_paga'
      when 'perdida'  then 'taxa_perdida'
      when 'pendente' then 'taxa_pendente'
      else 'taxa_isenta'
    end,
    'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('taxa_status', p_status, 'taxa_valor', v_valor, 'data_recebimento', v_data_pagamento)
  );
end;
$$;

revoke execute on function public.definir_taxa_agendamento(uuid, text, payment_method_type, date) from public, anon;
grant execute on function public.definir_taxa_agendamento(uuid, text, payment_method_type, date) to authenticated, service_role;

-- ------------------------------------------------------------
-- DADO EXISTENTE (rodar só depois de mostrar a prévia ao dono):
-- 1 taxa paga, lançada no caixa em 16/10 (data do evento), marcada como paga
-- em 05/10. Correção proposta: levar o lançamento para 05/10.
--
--   update transactions t
--      set date = date '2026-10-05'
--     from calendar_events ev
--    where ev.taxa_transaction_id = t.id
--      and ev.id = 'bfb70995-8305-4f47-8c81-d4a0464fe28b';
-- ------------------------------------------------------------
