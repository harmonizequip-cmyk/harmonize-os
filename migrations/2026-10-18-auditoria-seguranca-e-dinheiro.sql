-- Auditoria geral (18/10/2026): fecha brechas de acesso e corrige regras de dinheiro.
-- Nada aqui apaga ou altera dado existente: só políticas de acesso, funções e duas views.
--
-- Por que: o cadastro do Supabase Auth é aberto (o acesso de visualização e o portal da
-- cliente criam login pelo navegador), então qualquer pessoa consegue uma conta logada sem
-- permissão nenhuma. Toda política ou função que só olhava auth.uid() ficava aberta para ela.

-- ------------------------------------------------------------
-- 1. Lançamentos pessoais: a política antiga "transactions_rw_pessoal" (só created_by =
--    auth.uid()) deixava qualquer conta nova gravar lançamentos no Pessoal do dono, que
--    entravam no saldo e nos relatórios dele. As políticas certas (com a permissão
--    "pessoal") já existem; a antiga sai.
-- ------------------------------------------------------------
drop policy if exists "transactions_rw_pessoal" on public.transactions;

-- ------------------------------------------------------------
-- 2. Sem exclusão direta (a "leva E" de 24/09 nunca entrou no banco): as políticas "for all"
--    deixavam apagar cliente, locação, agenda, tarefa e lançamento direto pela API, sem
--    passar pelo delete_record_forever (só administrador, com registro em movimentações).
--    Nenhuma tela apaga essas tabelas direto (conferido no código), e as funções que apagam
--    são security definer, então nada muda no uso.
-- ------------------------------------------------------------
drop policy if exists "clients_rw" on public.clients;
drop policy if exists "clients_select" on public.clients;
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_update" on public.clients;
create policy "clients_select" on public.clients for select using (has_module_permission('clientes'));
create policy "clients_insert" on public.clients for insert with check (has_module_permission('clientes'));
create policy "clients_update" on public.clients for update
  using (has_module_permission('clientes')) with check (has_module_permission('clientes'));

drop policy if exists "rentals_rw" on public.rentals;
drop policy if exists "rentals_select" on public.rentals;
drop policy if exists "rentals_insert" on public.rentals;
drop policy if exists "rentals_update" on public.rentals;
create policy "rentals_select" on public.rentals for select using (has_module_permission('agenda'));
create policy "rentals_insert" on public.rentals for insert with check (has_module_permission('agenda'));
create policy "rentals_update" on public.rentals for update
  using (has_module_permission('agenda')) with check (has_module_permission('agenda'));

drop policy if exists "calendar_rw" on public.calendar_events;
drop policy if exists "calendar_select" on public.calendar_events;
drop policy if exists "calendar_insert" on public.calendar_events;
drop policy if exists "calendar_update" on public.calendar_events;
create policy "calendar_select" on public.calendar_events for select using (has_module_permission('agenda'));
create policy "calendar_insert" on public.calendar_events for insert with check (has_module_permission('agenda'));
create policy "calendar_update" on public.calendar_events for update
  using (has_module_permission('agenda')) with check (has_module_permission('agenda'));

drop policy if exists "mentoring_rw" on public.mentoring_events;
drop policy if exists "mentoring_select" on public.mentoring_events;
drop policy if exists "mentoring_insert" on public.mentoring_events;
drop policy if exists "mentoring_update" on public.mentoring_events;
create policy "mentoring_select" on public.mentoring_events for select using (has_module_permission('agenda'));
create policy "mentoring_insert" on public.mentoring_events for insert with check (has_module_permission('agenda'));
create policy "mentoring_update" on public.mentoring_events for update
  using (has_module_permission('agenda')) with check (has_module_permission('agenda'));

drop policy if exists "tasks_rw" on public.tasks;
drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_select" on public.tasks for select using (has_module_permission('clientes'));
create policy "tasks_insert" on public.tasks for insert with check (has_module_permission('clientes'));
create policy "tasks_update" on public.tasks for update
  using (has_module_permission('clientes')) with check (has_module_permission('clientes'));

drop policy if exists "transactions_rw_harmonize" on public.transactions;
drop policy if exists "transactions_select_harmonize" on public.transactions;
drop policy if exists "transactions_insert_harmonize" on public.transactions;
drop policy if exists "transactions_update_harmonize" on public.transactions;
create policy "transactions_select_harmonize" on public.transactions for select
  using (scope = 'harmonize' and has_module_permission('financeiro'));
create policy "transactions_insert_harmonize" on public.transactions for insert
  with check (scope = 'harmonize' and has_module_permission('financeiro'));
create policy "transactions_update_harmonize" on public.transactions for update
  using (scope = 'harmonize' and has_module_permission('financeiro'))
  with check (scope = 'harmonize' and has_module_permission('financeiro'));

-- ------------------------------------------------------------
-- 3. Avisos no celular: qualquer conta logada podia se inscrever e receber os resumos do
--    dono (nomes de clientes, dívidas, links de cobrança). Agora só quem usa o app.
--    Apagar a própria inscrição continua liberado.
-- ------------------------------------------------------------
drop policy if exists "push_inscricoes_insert" on public.push_inscricoes;
drop policy if exists "push_inscricoes_update" on public.push_inscricoes;
create policy "push_inscricoes_insert" on public.push_inscricoes for insert
  with check (user_id = auth.uid() and has_module_permission('dashboard'));
create policy "push_inscricoes_update" on public.push_inscricoes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and has_module_permission('dashboard'));

-- Assistente e Cérebro: gravar só para quem usa o app (antes, qualquer conta gravava as próprias linhas).
drop policy if exists "assistente_memoria_insert" on public.assistente_memoria;
create policy "assistente_memoria_insert" on public.assistente_memoria for insert
  with check (user_id = auth.uid() and has_module_permission('dashboard'));
drop policy if exists "assistente_conversas_insert" on public.assistente_conversas;
create policy "assistente_conversas_insert" on public.assistente_conversas for insert
  with check (user_id = auth.uid() and has_module_permission('dashboard'));
drop policy if exists "assistente_uso_insert" on public.assistente_uso;
create policy "assistente_uso_insert" on public.assistente_uso for insert
  with check (user_id = auth.uid() and has_module_permission('dashboard'));
drop policy if exists "insights_insert" on public.insights;
create policy "insights_insert" on public.insights for insert
  with check (user_id = auth.uid() and has_module_permission('dashboard'));

-- ------------------------------------------------------------
-- 4. Geração de tarefas: security definer que apaga e cria tarefas, antes liberada para
--    qualquer conta logada. Agora exige a permissão "clientes" (mesma das tarefas).
-- ------------------------------------------------------------
create or replace function public.gerar_tarefas_agenda()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s settings%rowtype;
  v_hoje date := public.hoje_local();
  v_total integer := 0;
  v_n integer;
begin
  if auth.uid() is null or not has_module_permission('clientes') then
    return 0;
  end if;

  select * into s from settings where id;
  if not found or coalesce(s.test_mode, false) then
    return 0;
  end if;

  -- 1) Confirmar presença: X dias antes de agendamento não confirmado.
  if s.tarefa_confirmacao_ativa then
    delete from tasks t
     using calendar_events ev
     where t.event_id = ev.id and t.type = 'confirmacao' and t.status = 'pendente'
       and (ev.confirmed or ev.status = 'cancelada' or ev.date_start < v_hoje
            or ev.date_start - s.dias_antes_confirmacao > v_hoje);

    insert into tasks (client_id, type, title, due_date, event_id)
    select ev.client_id, 'confirmacao',
           'Confirmar presença de ' || to_char(ev.date_start, 'DD/MM'),
           greatest(ev.date_start - s.dias_antes_confirmacao, v_hoje), ev.id
      from calendar_events ev
      join clients c on c.id = ev.client_id
     where ev.equipment_id is not null
       and ev.status <> 'cancelada'
       and not ev.confirmed
       and not ev.is_test and not c.is_test
       and ev.date_start >= v_hoje
       and ev.date_start - s.dias_antes_confirmacao <= v_hoje
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  -- 2) Pós-locação: X dias depois da locação (janela de 14 dias para trás,
  --    para a primeira execução não despejar o histórico antigo).
  if s.tarefa_pos_locacao_ativa then
    delete from tasks t
     using calendar_events ev
     where t.event_id = ev.id and t.type = 'pos_locacao' and t.status = 'pendente'
       and (ev.status = 'cancelada' or ev.no_show);

    insert into tasks (client_id, type, title, due_date, event_id)
    select ev.client_id, 'pos_locacao',
           'Pós-locação de ' || to_char(ev.date_start, 'DD/MM'),
           ev.date_start + s.dias_pos_locacao, ev.id
      from calendar_events ev
      join clients c on c.id = ev.client_id
     where ev.rental_id is not null
       and not ev.is_mentoria
       and ev.status <> 'cancelada'
       and not ev.no_show
       and not ev.is_test and not c.is_test
       and ev.date_start + s.dias_pos_locacao <= v_hoje
       and ev.date_start >= v_hoje - 14
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  -- 3) Cobrar taxa de reserva: pendente há X dias desde que a reserva foi criada.
  if s.tarefa_taxa_ativa then
    delete from tasks t
     using calendar_events ev
     where t.event_id = ev.id and t.type = 'cobranca_taxa' and t.status = 'pendente'
       and (ev.taxa_status <> 'pendente' or ev.status = 'cancelada' or ev.date_start < v_hoje);

    insert into tasks (client_id, type, title, due_date, event_id)
    select ev.client_id, 'cobranca_taxa',
           'Cobrar taxa de reserva (' || to_char(ev.date_start, 'DD/MM') || ')',
           (ev.created_at at time zone 'America/Sao_Paulo')::date + s.dias_cobranca_taxa, ev.id
      from calendar_events ev
      join clients c on c.id = ev.client_id
     where ev.taxa_status = 'pendente'
       and ev.status <> 'cancelada'
       and not ev.is_test and not c.is_test
       and ev.date_start >= v_hoje
       and (ev.created_at at time zone 'America/Sao_Paulo')::date + s.dias_cobranca_taxa <= v_hoje
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;

create or replace function public.gerar_tarefas_recontato()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo boolean;
  v_intervalo integer;
  v_teste boolean;
  v_hoje date := public.hoje_local();
  v_criadas integer := 0;
begin
  if auth.uid() is null or not has_module_permission('clientes') then
    return 0;
  end if;

  select recontato_automatico, recontato_intervalo_dias, test_mode
    into v_ativo, v_intervalo, v_teste
    from settings where id;

  if not coalesce(v_ativo, false) or coalesce(v_teste, false) then
    return 0;
  end if;

  delete from tasks t
   where t.type = 'recontato' and t.status = 'pendente'
     and exists (
       select 1 from calendar_events ev
        where ev.client_id = t.client_id
          and ev.status <> 'cancelada'
          and ev.equipment_id is not null
          and not ev.is_mentoria
          and ev.date_start >= v_hoje
     );

  insert into tasks (client_id, type, title, due_date)
  select c.id, 'recontato', 'Recontato com o cliente',
         greatest(
           coalesce((select max(r.event_date) from rentals r
                      where r.client_id = c.id and r.status <> 'cancelada' and r.event_date <= v_hoje),
                    date '0001-01-01'),
           coalesce((select max((t.completed_at at time zone 'America/Sao_Paulo')::date) from tasks t
                      where t.client_id = c.id and t.type = 'recontato' and t.status = 'concluida'),
                    date '0001-01-01'),
           (c.created_at at time zone 'America/Sao_Paulo')::date
         ) + v_intervalo
    from clients c
   where c.is_client
     and not c.is_test
     and not exists (
       select 1 from calendar_events ev
        where ev.client_id = c.id
          and ev.status <> 'cancelada'
          and ev.equipment_id is not null
          and not ev.is_mentoria
          and ev.date_start >= v_hoje
     )
     and not exists (
       select 1 from tasks t where t.client_id = c.id and t.type = 'recontato' and t.status = 'pendente'
     )
  on conflict do nothing;

  get diagnostics v_criadas = row_count;
  return v_criadas;
end;
$$;

-- ------------------------------------------------------------
-- 5. Acesso ao Planejador: um formulário preenchido com o e-mail de outra cliente fazia o
--    "Liberar acesso" mudar o login dela para esta ficha (ela perdia os planejamentos).
--    Agora recusa login que já é de outra cliente.
-- ------------------------------------------------------------
create or replace function public.liberar_acesso_planejador(p_email text, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
  v_nome text;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Só o administrador libera acessos.';
  end if;
  select coalesce(nullif(btrim(display_name), ''), name) into v_nome from clients where id = p_client_id;
  if v_nome is null then
    raise exception 'Cliente não encontrada.';
  end if;
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    raise exception 'Não achei um login com o e-mail %. Crie o login primeiro.', v_email;
  end if;
  if v_id = auth.uid() then
    raise exception 'Esse é o seu próprio login.';
  end if;
  if exists (select 1 from profiles where id = v_id and cliente_id is null and active) then
    raise exception 'Esse login já tem acesso ao sistema da Harmonize. Use outro e-mail para a cliente.';
  end if;
  if exists (select 1 from profiles where id = v_id and cliente_id is not null and cliente_id <> p_client_id) then
    raise exception 'Esse e-mail já é o login de outra cliente. Confira o e-mail com ela antes de liberar.';
  end if;

  insert into profiles (id, name, email, is_admin, active, somente_leitura, permissions, cliente_id)
  values (v_id, v_nome, v_email, false, true, false, '{}'::jsonb, p_client_id)
  on conflict (id) do update
    set name = excluded.name, email = excluded.email, is_admin = false, active = true,
        somente_leitura = false, permissions = '{}'::jsonb, cliente_id = excluded.cliente_id;

  -- Primeiros 60 dias contados da liberação (depois, cada agendamento prorroga 45).
  update clients set portal_liberado_ate = greatest(coalesce(portal_liberado_ate, hoje_local()), hoje_local() + 60) where id = p_client_id;

  perform registrar_movimentacao('editado', 'cliente', p_client_id, 'Acesso ao Planejador liberado (' || v_email || ')',
    jsonb_build_object('usuario_id', v_id));
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. Consulta do assistente: só quem usa a Harmonize (login de cliente do portal fora) e
--    mais funções que executam texto montado bloqueadas. A trava de verdade continua sendo
--    a RLS (security invoker) e a transação só leitura.
-- ------------------------------------------------------------
create or replace function public.assistente_consultar(p_sql text, p_limite integer default 200)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_sql text := btrim(regexp_replace(coalesce(p_sql, ''), ';\s*$', ''));
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 5000);
  v_res jsonb;
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and active and not somente_leitura and cliente_id is null
  ) then
    raise exception 'Sem acesso ao assistente.';
  end if;
  if v_sql !~* '^(select|with)\s' then
    raise exception 'Só consultas SELECT.';
  end if;
  if position(';' in v_sql) > 0 then
    raise exception 'Uma consulta por vez, sem ";".';
  end if;
  if v_sql ~* '(\mvault\M|\mauth\M|\mpg_|\mset_config\M|\mdblink|\mlo_|\mcurrent_setting\M|push_inscricoes|webauthn|alertas_segredos|formulario_segredo|\mcopy\M|\mquery_to_|\mtable_to_|\mxpath\M|\mdatabase_to_|\mschema_to_)' then
    raise exception 'Essa consulta usa algo que o assistente não pode ler.';
  end if;

  perform set_config('transaction_read_only', 'on', true);

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) q limit %s) t',
    v_sql, v_limite + 1
  ) into v_res;
  return v_res;
end;
$$;

-- ------------------------------------------------------------
-- 7. Saldo de crédito da cliente só para quem mexe na agenda; os auxiliares do portal só
--    são chamados por outras funções (security definer), então saem do authenticated.
-- ------------------------------------------------------------
create or replace function public.saldo_credito_cliente(p_client_id uuid, p_tipo text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(c.quantidade), 0)
    from creditos_cliente c
    left join rentals r on r.id = c.rental_id
   where has_module_permission('agenda')
     and c.client_id = p_client_id and c.tipo = p_tipo
     and credito_conta(c.quantidade, c.origem, r.pago, r.status::text) = 'disponivel';
$$;

revoke execute on function public.portal_ultimo_atendimento(uuid) from authenticated;
revoke execute on function public.portal_valido_ate(uuid) from authenticated;

-- ------------------------------------------------------------
-- 8. Dinheiro: cancelar locação com pagamento parcial fazia o valor recebido sumir do caixa
--    (transactions_contabilizaveis tira lançamento de locação cancelada). Agora pede para
--    remover os pagamentos antes, como já era com a locação toda paga.
-- ------------------------------------------------------------
create or replace function public.cancelar_agendamento(p_event_id uuid, p_motivo text default null, p_no_show boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_status event_status_type;
  v_taxa text;
  v_descricao text;
  v_pago boolean;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para cancelar agendamentos.';
  end if;

  select rental_id, status, taxa_status into v_rental_id, v_status, v_taxa
    from calendar_events where id = p_event_id;

  if v_status is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento já está cancelado.';
  end if;

  if v_rental_id is not null then
    select pago into v_pago from rentals where id = v_rental_id;
    if v_pago then
      raise exception 'Esta locação já foi paga. Desfaça o pagamento antes de cancelar, para o caixa não ficar com receita de algo cancelado.';
    end if;
    if exists (select 1 from rental_payments where rental_id = v_rental_id) then
      raise exception 'Esta locação tem pagamento registrado. Remova os pagamentos antes de cancelar, senão o dinheiro recebido some do caixa.';
    end if;
  end if;

  v_descricao := public.descrever_registro('calendar_events', p_event_id);

  update calendar_events
     set status = 'cancelada',
         cancellation_reason = nullif(trim(p_motivo), ''),
         no_show = coalesce(p_no_show, false)
   where id = p_event_id;
  -- rentals.status/cancellation_reason/no_show são sincronizados sozinhos
  -- pelo trigger trg_sync_rental_from_calendar_event (leva R + S).

  if v_taxa = 'paga' then
    update calendar_events set taxa_status = 'perdida' where id = p_event_id;
    perform public.registrar_movimentacao(
      'taxa_perdida', 'calendar_events', p_event_id, v_descricao,
      jsonb_build_object('motivo', 'agendamento cancelado após a taxa ter sido paga')
    );
  end if;

  -- Leva O: taxa perdida deixa de contar como crédito, então o saldo da
  -- locação (se houver) precisa ser recalculado.
  if v_rental_id is not null then
    perform public.recalcular_pagamento_locacao(v_rental_id);
  end if;

  perform public.registrar_movimentacao(
    'cancelado', 'calendar_events', p_event_id, v_descricao,
    jsonb_build_object(
      'motivo', coalesce(nullif(trim(p_motivo), ''), 'não informado'),
      'no_show', coalesce(p_no_show, false),
      'taxa', coalesce(v_taxa, 'nao_aplica'),
      'status_anterior', v_status
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- 9. Editar locação: mudar o valor não recalculava o "pago" (subir o valor de uma locação
--    paga deixava a dívida escondida de Pendências e do Receber). Agora recalcula, recusa
--    valor novo abaixo do que já foi recebido e deixa de mexer no lançamento antigo
--    rentals.transaction_id (não usado: nenhuma locação tem).
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

  select client_id, event_date, status, calculated_value
    into v_client_id, v_old_date, v_old_status, v_old_value
    from rentals where id = p_rental_id;

  if v_client_id is null then
    raise exception 'Locação não encontrada (id %).', p_rental_id;
  end if;

  -- Leva S: cancelar por aqui pulava as regras de negócio (bloquear se
  -- já foi paga, taxa paga virar perdida, motivo/no-show). Uma locação
  -- que já estava cancelada continua podendo ser salva normalmente
  -- (outros campos), só a TRANSIÇÃO para cancelada é que é bloqueada.
  if p_status = 'cancelada' and v_old_status is distinct from 'cancelada' then
    raise exception 'Para cancelar uma locação, use o botão "Cancelar locação" (motivo e não comparecimento ficam registrados). Não é possível cancelar por aqui.';
  end if;

  -- Valor novo abaixo do que já entrou (pagamentos + taxa de reserva paga) deixaria a
  -- locação com saldo negativo. Só vale quando o valor muda.
  if p_calculated_value is distinct from v_old_value then
    select coalesce((select sum(valor) from rental_payments where rental_id = p_rental_id), 0)
         + coalesce((select sum(taxa_valor) from calendar_events where rental_id = p_rental_id and taxa_status = 'paga'), 0)
      into v_recebido;
    if round(p_calculated_value, 2) < round(v_recebido, 2) then
      raise exception 'O valor novo (R$ %) fica abaixo do que já foi recebido (R$ %). Remova ou corrija o pagamento antes.',
        to_char(p_calculated_value, 'FM999G990D00'), to_char(v_recebido, 'FM999G990D00');
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

  -- O "pago" é calculado pelo saldo: valor novo pode abrir ou fechar a dívida.
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
-- 10. Taxa de reserva: a função aceitava qualquer mudança, então "Isentar" numa tela
--     desatualizada apagava o lançamento de uma taxa já recebida, e marcar "paga" de novo
--     trocava o valor. Agora só as passagens que fazem sentido:
--     paga <- pendente/nao_aplica; pendente <- nao_aplica/paga (desfazer o recebimento);
--     nao_aplica <- pendente; perdida <- paga.
-- ------------------------------------------------------------
create or replace function public.definir_taxa_agendamento(
  p_event_id uuid,
  p_status text,
  p_payment_method payment_method_type default 'pix',
  p_data date default null
)
returns void
language plpgsql
security definer
set search_path = public
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
  if p_status = 'paga' and v_status_atual = 'paga' then
    raise exception 'Esta taxa já está recebida.';
  end if;
  if p_status = 'paga' and v_status_atual = 'perdida' then
    raise exception 'Esta taxa ficou com a Harmonize no cancelamento; não dá para receber de novo.';
  end if;
  if p_status = 'nao_aplica' and v_status_atual in ('paga', 'perdida') then
    raise exception 'A taxa já foi recebida. Desfaça o recebimento antes de isentar.';
  end if;
  if p_status = 'pendente' and v_status_atual = 'perdida' then
    raise exception 'Esta taxa ficou com a Harmonize no cancelamento.';
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

-- ------------------------------------------------------------
-- 11. Lucro: a view contava cliente marcado "fora do financeiro" e despesa de teste. Mesma
--     regra das outras somas (rentals_contabilizaveis e transações sem teste).
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
  r.calculated_value - coalesce((select sum(t.amount) from transactions t
             where t.rental_id = r.id and t.type = 'saida' and not t.is_test
               and (t.scope = 'harmonize' or t.conta_no_lucro)), 0) as lucro_liquido
from rentals r
left join clients c on c.id = r.client_id
where r.status <> 'cancelada' and r.is_test = false
  and not coalesce(c.excluir_financeiro, false);

-- View antiga que filtrava status 'realizada' (quase nunca gravado) e nenhuma tela usa.
drop view if exists public.locacoes_a_receber;

revoke execute on function public.gerar_tarefas_agenda() from public, anon;
grant execute on function public.gerar_tarefas_agenda() to authenticated, service_role;
revoke execute on function public.gerar_tarefas_recontato() from public, anon;
grant execute on function public.gerar_tarefas_recontato() to authenticated, service_role;
revoke execute on function public.liberar_acesso_planejador(text, uuid) from public, anon;
grant execute on function public.liberar_acesso_planejador(text, uuid) to authenticated, service_role;
revoke execute on function public.assistente_consultar(text, integer) from public, anon;
grant execute on function public.assistente_consultar(text, integer) to authenticated, service_role;
revoke execute on function public.saldo_credito_cliente(uuid, text) from public, anon;
grant execute on function public.saldo_credito_cliente(uuid, text) to authenticated, service_role;
revoke execute on function public.cancelar_agendamento(uuid, text, boolean) from public, anon;
grant execute on function public.cancelar_agendamento(uuid, text, boolean) to authenticated, service_role;
revoke execute on function public.update_rental(uuid, uuid, date, integer, numeric, payment_method_type, event_status_type, text, date) from public, anon;
grant execute on function public.update_rental(uuid, uuid, date, integer, numeric, payment_method_type, event_status_type, text, date) to authenticated, service_role;
revoke execute on function public.definir_taxa_agendamento(uuid, text, payment_method_type, date) from public, anon;
grant execute on function public.definir_taxa_agendamento(uuid, text, payment_method_type, date) to authenticated, service_role;
