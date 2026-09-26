-- ============================================================
-- LEVA Q: segurança residual (leva H não cobriu require_admin),
-- fuso horário nas datas "de hoje" e limpeza de coluna morta
--
-- CONTEXTO
-- Diagnóstico pedido pelo usuário a partir de uma auditoria externa
-- do schema.sql, cruzada ponto a ponto com o código real do projeto
-- antes de qualquer implementação. Esta migration cobre só os dois
-- primeiros itens da prioridade combinada (E1 e E8); o resto (fonte
-- única da reserva, motivo de cancelamento, manutenção, contador de
-- disparos) fica para levas futuras.
--
-- 1) require_admin() não herdou a correção da leva H
-- has_module_permission já bloqueia admin desativado (leva H), mas
-- require_admin() ainda checava só is_admin, sem active. É usada por
-- set_record_test_flag, set_client_test_flag_cascade, purge_test_data,
-- preview_exclusao e delete_record_forever — um admin desativado ainda
-- conseguia rodar todas essas.
--
-- 2) current_date é UTC no servidor; várias funções tratam como "hoje"
-- O negócio opera no horário do Brasil (UTC-3 o ano todo, sem horário
-- de verão desde 2019). Depois das 21h locais, current_date no
-- servidor já é amanhã. Cria hoje_local() e troca current_date por ela
-- em todo lugar onde o valor representa "a data de hoje para quem está
-- usando o sistema" — não em toda comparação com uma data qualquer.
-- Espelha lib/period.ts (hojeLocal) do frontend.
--
-- 3) purge_test_data não zerava calendar_events.taxa_transaction_id
-- Se um evento real tivesse taxa vinculada a uma transação de teste,
-- apagar as transações de teste quebraria por chave estrangeira.
--
-- 4) set_record_test_flag não aceitava rental_payments
-- A tela de dados de teste chama esta função (não a de cascata por
-- cliente) para converter uma locação isolada. rental_payments ficava
-- de fora da lista branca: os pagamentos da locação continuavam com a
-- marcação de teste antiga depois da conversão.
--
-- 5) clients.reservation_fee_status: coluna morta, remoção
-- Já substituída pela view clientes_taxas (leva C4). O próprio
-- comentário da coluna já dizia "ninguém lê mais esta coluna".
-- Conferido: nenhum arquivo do app a referencia.
-- ============================================================

-- ------------------------------------------------------------
-- 1. require_admin respeita active, igual has_module_permission
-- ------------------------------------------------------------
create or replace function public.require_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin and active
  ) then
    raise exception 'Apenas administradores ativos podem executar esta ação.';
  end if;
end;
$$;

comment on function public.require_admin() is
  'Porta de entrada das ações de administrador (limpeza de dados de teste, exclusão definitiva). active bloqueia mesmo administrador, igual a has_module_permission (leva H) — antes da leva Q, is_admin bastava mesmo com a conta desativada.';

-- ------------------------------------------------------------
-- 2. "hoje" no fuso do negócio, não em UTC
-- ------------------------------------------------------------
create or replace function public.hoje_local()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

comment on function public.hoje_local() is
  'Data de "hoje" no fuso do negócio (America/Sao_Paulo, UTC-3 o ano todo desde o fim do horário de verão em 2019). O Supabase roda em UTC: current_date sozinho já vira amanhã a partir das 21h locais. Espelha lib/period.ts (hojeLocal) do frontend — usar aqui em vez de current_date sempre que o valor representa a data de hoje para quem está usando o sistema (leva Q).';

alter table public.tasks alter column due_date set default public.hoje_local();
alter table public.rental_payments alter column data set default public.hoje_local();

-- current_date -> hoje_local() nas funções que tratam "hoje" (default
-- de parâmetro ou comparação "antes/depois de hoje"). Corpo idêntico ao
-- de schema.sql, só essa troca.

create or replace function public.marcar_realizada(
  p_rental_id uuid,
  p_realizada boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status event_status_type;
  v_data date;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar locações.';
  end if;

  select status, event_date into v_status, v_data from rentals where id = p_rental_id;

  if v_status is null then
    raise exception 'Locação não encontrada.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Esta locação está cancelada.';
  end if;

  if p_realizada and v_data > public.hoje_local() then
    raise exception 'Esta locação é do dia %. Não dá para marcar como realizada antes de acontecer.',
      to_char(v_data, 'DD/MM/YYYY');
  end if;

  update rentals
     set status = case when p_realizada then 'realizada' else 'confirmada' end::event_status_type
   where id = p_rental_id;

  update calendar_events
     set status = case when p_realizada then 'realizada' else 'confirmada' end::event_status_type
   where rental_id = p_rental_id;

  perform public.registrar_movimentacao(
    case when p_realizada then 'realizado' else 'realizacao_desfeita' end,
    'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object('status_novo', case when p_realizada then 'realizada' else 'confirmada' end)
  );
end;
$$;

create or replace function public.create_rental(
  p_client_id uuid,
  p_equipment_id uuid,
  p_event_date date,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_notes text default null,
  p_pago boolean default true,
  p_pix_conta text default null
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
  v_equipment_code equipment_code_type;
  v_client_name text;
  v_created_by uuid := auth.uid();
  v_parceiro boolean;
  v_taxa_status text;
  v_taxa_valor numeric;
  v_pix_conta text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para criar locações';
  end if;

  select code into v_equipment_code from equipments where id = p_equipment_id;
  select name, parceiro into v_client_name, v_parceiro from clients where id = p_client_id;
  select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Loca%' limit 1;

  if v_category_id is null then
    raise exception 'Categoria "Locação" não encontrada (foi renomeada ou removida?). Ajuste o cadastro de categorias antes de criar a locação.';
  end if;

  insert into rentals (client_id, equipment_id, event_date, shots, calculated_value, payment_method, notes, created_by)
  values (p_client_id, p_equipment_id, p_event_date, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by)
  returning id into v_rental_id;

  if p_pago then
    v_pix_conta := case when p_payment_method = 'pix' then coalesce(p_pix_conta, 'harmonize') else null end;

    insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
    values ('entrada', v_category_id, 'Locação HIPRO - ' || coalesce(v_client_name, ''), p_calculated_value, p_payment_method, p_event_date, 'harmonize', p_client_id, v_rental_id, v_created_by)
    returning id into v_transaction_id;

    insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, created_by)
    values (v_rental_id, p_payment_method, p_calculated_value, p_event_date, v_pix_conta, v_transaction_id, v_created_by);

    update rentals set transaction_id = v_transaction_id where id = v_rental_id;
    -- pago / pago_em: preenchidos automaticamente pelo trigger de rental_payments.
  end if;

  -- Taxa de compromisso inicial: pendente só quando há data futura a
  -- garantir e o cliente não é parceiro. definir_taxa_agendamento muda o
  -- estado depois.
  if coalesce(v_parceiro, false) or p_event_date <= public.hoje_local() then
    v_taxa_status := 'nao_aplica';
    v_taxa_valor  := null;
  else
    v_taxa_status := 'pendente';
    v_taxa_valor  := public.valor_taxa_atual();
  end if;

  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, value, rental_id, created_by, taxa_status, taxa_valor)
  values (v_equipment_code::text::calendar_event_type, 'Locação - ' || coalesce(v_client_name, ''), p_client_id, p_equipment_id, p_event_date, p_event_date, 'confirmada', p_calculated_value, v_rental_id, v_created_by,
          v_taxa_status, v_taxa_valor);

  update clients set stage = 'cliente' where id = p_client_id and stage <> 'cliente';

  return v_rental_id;
end;
$$;

create or replace function public.marcar_locacao_paga(
  p_rental_id uuid,
  p_payment_method payment_method_type default null,
  p_data date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago boolean;
  v_valor numeric;
  v_client_id uuid;
  v_client_name text;
  v_event_date date;
  v_forma payment_method_type;
  v_status event_status_type;
  v_categoria uuid;
  v_credito numeric := 0;
  v_valor_lancamento numeric;
  v_transacao_id uuid;
  v_pix_conta text;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para registrar pagamentos.';
  end if;

  select r.pago, r.calculated_value, r.client_id, r.event_date, r.payment_method, r.status, c.name
    into v_pago, v_valor, v_client_id, v_event_date, v_forma, v_status, v_client_name
    from rentals r
    left join clients c on c.id = r.client_id
   where r.id = p_rental_id;

  if v_valor is null then
    raise exception 'Locação não encontrada.';
  end if;
  if v_pago then
    raise exception 'Esta locação já está marcada como paga.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Esta locação está cancelada. Reative o agendamento antes de registrar o pagamento, para o caixa não receber dinheiro de algo cancelado.';
  end if;

  select coalesce(sum(ev.taxa_valor), 0) into v_credito
    from calendar_events ev
   where ev.rental_id = p_rental_id and ev.taxa_status = 'paga';

  v_valor_lancamento := greatest(v_valor - v_credito, 0);
  v_forma := coalesce(p_payment_method, v_forma);
  v_pix_conta := case when v_forma = 'pix' then 'harmonize' else null end;

  select id into v_categoria
    from categories
   where type = 'entrada' and is_default = true and name ilike 'Loca%'
   limit 1;

  insert into transactions (
    type, category_id, description, amount, payment_method, date, scope,
    client_id, rental_id, created_by
  )
  values (
    'entrada', v_categoria,
    'Locação HIPRO - ' || coalesce(v_client_name, ''),
    v_valor_lancamento, v_forma, coalesce(p_data, public.hoje_local()), 'harmonize',
    v_client_id, p_rental_id, auth.uid()
  )
  returning id into v_transacao_id;

  insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, created_by)
  values (p_rental_id, v_forma, v_valor_lancamento, coalesce(p_data, public.hoje_local()), v_pix_conta, v_transacao_id, auth.uid());

  update rentals
     set payment_method = v_forma,
         transaction_id = v_transacao_id
   where id = p_rental_id;
  -- pago / pago_em: recalculados sozinhos pelo trigger de rental_payments.

  perform public.registrar_movimentacao(
    'pago', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object(
      'valor_locacao',  round(v_valor, 2),
      'credito_taxa',   round(v_credito, 2),
      'valor_recebido', round(v_valor_lancamento, 2),
      'forma',          v_forma::text
    )
  );
end;
$$;

create or replace function public.registrar_pagamento_locacao(
  p_rental_id uuid,
  p_forma payment_method_type,
  p_valor numeric,
  p_data date default public.hoje_local(),
  p_pix_conta text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_client_name text;
  v_status event_status_type;
  v_categoria uuid;
  v_transacao_id uuid;
  v_payment_id uuid;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para registrar pagamentos.';
  end if;
  if p_valor <= 0 then
    raise exception 'O valor do pagamento precisa ser maior que zero.';
  end if;
  if p_forma = 'pix' and p_pix_conta is null then
    raise exception 'Informe em qual conta o PIX caiu.';
  end if;

  select r.client_id, r.status, c.name into v_client_id, v_status, v_client_name
    from rentals r
    left join clients c on c.id = r.client_id
   where r.id = p_rental_id;

  if v_client_id is null then
    raise exception 'Locação não encontrada.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Esta locação está cancelada. Reative o agendamento antes de registrar o pagamento.';
  end if;

  select id into v_categoria
    from categories
   where type = 'entrada' and is_default = true and name ilike 'Loca%'
   limit 1;

  insert into transactions (
    type, category_id, description, amount, payment_method, date, scope,
    client_id, rental_id, notes, created_by
  )
  values (
    'entrada', v_categoria,
    'Locação HIPRO - ' || coalesce(v_client_name, ''),
    p_valor, p_forma, p_data, 'harmonize', v_client_id, p_rental_id, p_notes, auth.uid()
  )
  returning id into v_transacao_id;

  insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, notes, created_by)
  values (p_rental_id, p_forma, p_valor, p_data, p_pix_conta, v_transacao_id, p_notes, auth.uid())
  returning id into v_payment_id;

  perform public.registrar_movimentacao(
    'pago', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object('valor_pago', round(p_valor, 2), 'forma', p_forma::text, 'pix_conta', p_pix_conta)
  );

  return v_payment_id;
end;
$$;

create or replace function public.registrar_despesa_locacao(
  p_rental_id uuid,
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
  v_transaction_id uuid;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para lançar despesas.';
  end if;
  if p_amount <= 0 then
    raise exception 'O valor da despesa precisa ser maior que zero.';
  end if;

  select client_id into v_client_id from rentals where id = p_rental_id;
  if v_client_id is null then
    raise exception 'Locação não encontrada.';
  end if;

  insert into transactions (
    type, category_id, description, amount, payment_method, date, scope,
    client_id, rental_id, notes, created_by
  )
  values (
    'saida', p_category_id, coalesce(nullif(trim(p_description), ''), 'Despesa da locação'),
    p_amount, p_payment_method, p_date, 'harmonize', v_client_id, p_rental_id, p_notes, auth.uid()
  )
  returning id into v_transaction_id;

  perform public.registrar_movimentacao(
    'criado', 'transactions', v_transaction_id,
    public.descrever_registro('transactions', v_transaction_id),
    jsonb_build_object('acao_detalhada', 'despesa ligada à locação', 'rental_id', p_rental_id)
  );

  return v_transaction_id;
end;
$$;

create or replace function public.handle_client_enter_contato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage = 'contato' and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then
    if not exists (
      select 1 from tasks
      where client_id = new.id and status = 'pendente' and type = 'contato_inicial'
    ) then
      insert into tasks (client_id, type, title, due_date)
      values (new.id, 'contato_inicial', 'Fazer o primeiro contato com ' || new.name, public.hoje_local());
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.register_contact_attempt(
  p_task_id uuid,
  p_responded boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_client_name text;
  v_current_followup integer;
  v_next_followup integer;
  v_tag_id uuid;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para atualizar tarefas de contato';
  end if;

  select client_id, follow_up_number into v_client_id, v_current_followup
  from tasks
  where id = p_task_id and status = 'pendente';

  if v_client_id is null then
    raise exception 'Tarefa não encontrada ou já concluída.';
  end if;

  update tasks
  set status = 'concluida', completed_at = now()
  where id = p_task_id;

  delete from client_tags
  where client_id = v_client_id
    and tag_id in (select id from tags where name like 'Follow-up %');

  if p_responded then
    return;
  end if;

  select name into v_client_name from clients where id = v_client_id;
  v_next_followup := coalesce(v_current_followup, 0) + 1;

  if v_next_followup > 5 then
    update clients set stage = 'nutricao' where id = v_client_id;
    return;
  end if;

  select id into v_tag_id from tags where name = 'Follow-up ' || v_next_followup;
  if v_tag_id is not null then
    insert into client_tags (client_id, tag_id) values (v_client_id, v_tag_id)
    on conflict do nothing;
  end if;

  insert into tasks (client_id, type, follow_up_number, title, due_date)
  values (
    v_client_id,
    'followup',
    v_next_followup,
    'Confirmar se ' || coalesce(v_client_name, 'o cliente') || ' respondeu (Follow-up ' || v_next_followup || ')',
    public.hoje_local() + 2
  );
end;
$$;

create or replace function public.definir_taxa_ao_criar_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parceiro boolean;
begin
  if new.taxa_status is distinct from 'nao_aplica' then
    return new;
  end if;

  if new.equipment_id is null then
    return new;
  end if;

  if new.date_start <= public.hoje_local() then
    return new;
  end if;

  select parceiro into v_parceiro from clients where id = new.client_id;
  if coalesce(v_parceiro, false) then
    return new;
  end if;

  new.taxa_status := 'pendente';
  new.taxa_valor := public.valor_taxa_atual();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. purge_test_data também zera calendar_events.taxa_transaction_id
-- ------------------------------------------------------------
create or replace function public.purge_test_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_clients_kept int;
  v_deleted jsonb;
begin
  perform public.require_admin();

  update public.rentals          set transaction_id = null
    where transaction_id in (select id from public.transactions where is_test);
  update public.mentoring_events set transaction_id = null
    where transaction_id in (select id from public.transactions where is_test);
  update public.calendar_events  set taxa_transaction_id = null
    where taxa_transaction_id in (select id from public.transactions where is_test);
  update public.calendar_events  set rental_id = null
    where rental_id in (select id from public.rentals where is_test);
  update public.calendar_events  set mentoring_id = null
    where mentoring_id in (select id from public.mentoring_events where is_test);
  update public.transactions     set rental_id = null
    where rental_id in (select id from public.rentals where is_test);
  update public.transactions     set mentoring_id = null
    where mentoring_id in (select id from public.mentoring_events where is_test);
  update public.mentoring_events set calendar_event_id = null
    where calendar_event_id in (select id from public.calendar_events where is_test);

  with
    d_tasks as (
      delete from public.tasks where is_test returning 1
    ),
    d_transactions as (
      delete from public.transactions where is_test returning 1
    ),
    d_calendar as (
      delete from public.calendar_events where is_test returning 1
    ),
    d_mentoring as (
      delete from public.mentoring_events where is_test returning 1
    ),
    d_rentals as (
      delete from public.rentals where is_test returning 1
    )
  select jsonb_build_object(
    'tasks',            (select count(*) from d_tasks),
    'transactions',     (select count(*) from d_transactions),
    'calendar_events',  (select count(*) from d_calendar),
    'mentoring_events', (select count(*) from d_mentoring),
    'rentals',          (select count(*) from d_rentals)
  ) into v_deleted;

  select count(*) into v_clients_kept
  from public.clients c
  where c.is_test
    and (
      exists (select 1 from public.transactions    t where t.client_id = c.id)
      or exists (select 1 from public.rentals      r where r.client_id = c.id)
      or exists (select 1 from public.calendar_events e where e.client_id = c.id)
    );

  delete from public.client_tags
  where client_id in (
    select c.id from public.clients c
    where c.is_test
      and not exists (select 1 from public.transactions    t where t.client_id = c.id)
      and not exists (select 1 from public.rentals         r where r.client_id = c.id)
      and not exists (select 1 from public.calendar_events e where e.client_id = c.id)
  );

  with d_clients as (
    delete from public.clients c
    where c.is_test
      and not exists (select 1 from public.transactions    t where t.client_id = c.id)
      and not exists (select 1 from public.rentals         r where r.client_id = c.id)
      and not exists (select 1 from public.calendar_events e where e.client_id = c.id)
    returning 1
  )
  select v_deleted || jsonb_build_object(
    'clients',              (select count(*) from d_clients),
    'clientes_preservados', v_clients_kept
  ) into v_result;

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- 4. set_record_test_flag aceita rental_payments
-- ------------------------------------------------------------
create or replace function public.set_record_test_flag(
  p_table text,
  p_id uuid,
  p_is_test boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();

  if p_table not in ('clients','transactions','rentals','calendar_events','mentoring_events','tasks','rental_payments') then
    raise exception 'Tabela não permitida: %', p_table;
  end if;

  execute format('update public.%I set is_test = $1 where id = $2', p_table)
    using p_is_test, p_id;
end;
$$;

-- ------------------------------------------------------------
-- 5. Remove clients.reservation_fee_status (coluna morta desde a leva C4)
-- ------------------------------------------------------------
alter table public.clients drop column if exists reservation_fee_status;
