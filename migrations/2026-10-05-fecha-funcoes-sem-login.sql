-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 05/10/2026, pelo dono, e conferida por consulta de leitura.
--
-- Fecha as funções do banco que qualquer pessoa sem login podia executar.
--
-- Achado (auditoria 05/10/2026): as 70 funções do schema public estavam com
-- EXECUTE liberado para anon (a chave pública do app) e para PUBLIC. As
-- tabelas e views estão protegidas por RLS (as views são security_invoker),
-- mas as funções security definer rodam como dono do banco e ignoram RLS.
-- As seguintes não checavam quem chamava:
--   excluir_locacao_cascata, excluir_mentoria_cascata: apagavam sem nenhuma checagem;
--   agendamentos_do_cliente: devolvia a agenda de qualquer cliente;
--   count_test_data, descrever_registro: vazavam contagens e descrições;
--   aplicar_previsoes_manutencao_vencidas, recalcular_pagamento_locacao: alteravam dados;
--   registrar_movimentacao: permitia forjar linha de histórico.
--
-- O que muda:
--   1. As duas exclusões em cascata passam a exigir administrador ativo.
--   2. agendamentos_do_cliente só devolve linhas a quem tem o módulo "clientes".
--   3. count_test_data exige administrador.
--   4. aplicar_previsoes_manutencao_vencidas só age para quem tem "equipamentos".
--   5. EXECUTE sai de PUBLIC e anon em todas as funções do app e fica para
--      authenticated e service_role. Exceção: disponibilidade_publica continua
--      aberta para anon (é o calendário público de datas livres).
--   6. registrar_movimentacao, descrever_registro e recalcular_pagamento_locacao
--      deixam de ser chamáveis por quem está logado: só as outras funções do
--      banco (que rodam como dono) as usam.
--   7. Funções novas deixam de nascer abertas para anon.
--
-- Funções de extensão (btree_gist) não são tocadas.
--
-- Reverter (se algo do app parar): grant execute on function <nome> to anon;
-- ============================================================

create or replace function public.excluir_locacao_cascata(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_taxas uuid[];
begin
  perform public.require_admin();

  update rentals set transaction_id = null where id = p_rental_id;

  select array_agg(taxa_transaction_id) into v_taxas
    from calendar_events
   where rental_id = p_rental_id and taxa_transaction_id is not null;

  update calendar_events set taxa_transaction_id = null where rental_id = p_rental_id;

  update mentoring_events set calendar_event_id = null
   where calendar_event_id in (select id from calendar_events where rental_id = p_rental_id);
  update mentoring_events set transaction_id = null
   where transaction_id in (select id from transactions where rental_id = p_rental_id);

  delete from calendar_events where rental_id = p_rental_id;
  delete from transactions    where rental_id = p_rental_id;
  if v_taxas is not null then
    delete from transactions where id = any(v_taxas);
  end if;
  delete from rentals where id = p_rental_id;
end;
$$;

create or replace function public.excluir_mentoria_cascata(p_mentoria_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_evento_id uuid;
  v_transacao_id uuid;
begin
  perform public.require_admin();

  select calendar_event_id, transaction_id into v_evento_id, v_transacao_id
    from mentoring_events where id = p_mentoria_id;

  -- Quebra os dois ciclos da mentoria antes de apagar qualquer coisa.
  update mentoring_events set calendar_event_id = null, transaction_id = null
   where id = p_mentoria_id;
  update calendar_events set mentoring_id = null where mentoring_id = p_mentoria_id;
  update transactions    set mentoring_id = null where mentoring_id = p_mentoria_id;

  delete from calendar_events where id = v_evento_id;
  delete from transactions    where id = v_transacao_id;
  delete from mentoring_events where id = p_mentoria_id;
end;
$$;

-- Recriada do zero: se a versão antiga (sem "reagendado") ainda existir, o tipo de retorno muda.
drop function if exists public.agendamentos_do_cliente(uuid);

create or replace function public.agendamentos_do_cliente(p_client_id uuid)
returns table(
  event_id uuid, rental_id uuid, equipamento text, data date, status text,
  confirmado boolean, valor numeric, disparos integer, situacao text,
  taxa_status text, taxa_valor numeric, pago boolean, pago_em date,
  cancellation_reason text, no_show boolean, reagendado boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    ev.id,
    ev.rental_id,
    coalesce(eq.name, ev.title),
    ev.date_start,
    ev.status::text,
    ev.confirmed,
    coalesce(r.calculated_value, ev.value),
    r.shots,
    case
      when ev.status = 'cancelada'  then 'cancelado'
      when ev.status = 'realizada'  then 'realizado'
      when ev.confirmed             then 'confirmado'
      else 'agendado'
    end,
    ev.taxa_status,
    ev.taxa_valor,
    coalesce(r.pago, false),
    r.pago_em,
    ev.cancellation_reason,
    ev.no_show,
    coalesce(ev.rescheduled, false) or coalesce(r.rescheduled, false)
  from calendar_events ev
  left join equipments eq on eq.id = ev.equipment_id
  left join rentals r on r.id = ev.rental_id
  where public.has_module_permission('clientes')
    and ev.client_id = p_client_id
  order by ev.date_start desc;
$$;

create or replace function public.count_test_data()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'clients',          (select count(*) from public.clients          where is_test),
    'transactions',     (select count(*) from public.transactions     where is_test),
    'rentals',          (select count(*) from public.rentals          where is_test),
    'calendar_events',  (select count(*) from public.calendar_events  where is_test),
    'mentoring_events', (select count(*) from public.mentoring_events where is_test),
    'tasks',            (select count(*) from public.tasks            where is_test),
    'rental_payments',  (select count(*) from public.rental_payments  where is_test)
  );
end;
$$;

create or replace function public.aplicar_previsoes_manutencao_vencidas()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_equip record;
begin
  if not public.has_module_permission('equipamentos') then
    return;
  end if;

  for v_equip in
    select id, name from equipments
     where status = 'manutencao'
       and status_previsto_fim is not null
       and status_previsto_fim <= current_date
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
end;
$$;

-- EXECUTE: fecha para quem não está logado, em todas as funções do app.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', r.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', r.assinatura);
  end loop;
end $$;

-- Calendário público de datas livres (só data, equipamento e situação).
grant execute on function public.disponibilidade_publica(date, date) to anon;

-- Só outras funções do banco usam estas; quem está logado não precisa chamar.
revoke execute on function public.registrar_movimentacao(text, text, uuid, text, jsonb) from authenticated;
revoke execute on function public.descrever_registro(text, uuid) from authenticated;
revoke execute on function public.recalcular_pagamento_locacao(uuid) from authenticated;

-- Funções criadas daqui para frente não nascem abertas para anon.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
