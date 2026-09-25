-- ============================================================
-- LEVA J: correções da auditoria externa ao schema.sql
--
-- CONTEXTO
-- O usuário recebeu uma revisão de segurança/lógica de outra IA, feita
-- em cima de schema.sql (o schema inicial da Fase 1, nunca mais
-- re-rodado desde 21/09 — a partir daí toda mudança passou a ser uma
-- migration incremental, como esta). Cada item foi conferido contra o
-- estado atual (schema.sql + todas as migrations já aplicadas) antes
-- de decidir o que ainda procede. Esta leva cobre só os itens que são
-- 100% seguros de aplicar sem checar dado de produção primeiro —
-- guarda de validação nova, correção de função com bug confirmado,
-- índice novo. Não mexe em nada que possa haver dado existente em
-- conflito (isso fica para depois de uma consulta de conferência).
--
-- ITENS COBERTOS AQUI: 1 (crítico), 7, 8, 11, e os índices das
-- melhorias. Os demais (2 e 3 já eram corrigidos; 4, 5, 9, 10, 12 e as
-- outras melhorias) estão explicados na resposta ao usuário, não
-- nesta migration.
-- ============================================================

-- ------------------------------------------------------------
-- 1) CRÍTICO: profiles_self_update deixava qualquer usuário logado
-- virar admin sozinho
--
-- A policy só restringe QUAL LINHA pode ser alterada (a própria, ou
-- quem já tem "configuracoes"). Não existe policy nem trigger que
-- restrinja QUAIS COLUNAS podem mudar — então um usuário comum,
-- chamando a API do Supabase direto (fora da tela do app, que não tem
-- botão pra isso, mas a API aceita), conseguia fazer
-- update profiles set is_admin = true where id = auth.uid() e a RLS
-- deixava passar. Este gatilho fecha isso: quem não tem
-- "configuracoes" não consegue mudar is_admin, active nem permissions
-- de ninguém, nem da própria linha — esses três campos voltam
-- sozinhos ao valor antigo se alguém tentar.
-- ------------------------------------------------------------
create or replace function public.profiles_lock_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('configuracoes') then
    new.is_admin := old.is_admin;
    new.active := old.active;
    new.permissions := old.permissions;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_lock_privileged_fields on public.profiles;
create trigger trg_profiles_lock_privileged_fields
  before update on public.profiles
  for each row execute function public.profiles_lock_privileged_fields();

comment on function public.profiles_lock_privileged_fields is
  'Trava is_admin/active/permissions contra autoedição (leva J, item 1 da auditoria externa): só quem já tem a permissão "configuracoes" consegue mudar esses três campos, de si mesmo ou de outro perfil.';

-- ------------------------------------------------------------
-- 7) update_rental com id inexistente não avisava ninguém
--
-- Sem esta guarda, chamar update_rental com um id que não existe (ou
-- já foi apagado) rodava até o fim sem erro nenhum: os updates afetam
-- zero linhas, e o registro de histórico no fim até chegava a gravar
-- uma linha de "reagendado" fantasma, com datas nulas, para uma
-- locação que não existe. Agora falha alto, na hora, como
-- finalize_rental_reservation já fazia.
-- ------------------------------------------------------------
create or replace function public.update_rental(
  p_rental_id uuid,
  p_equipment_id uuid,
  p_event_date date,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_status event_status_type,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_client_id uuid;
  v_old_date date;
  v_old_status event_status_type;
  v_old_value numeric;
  v_descricao text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para editar locações';
  end if;

  select transaction_id, client_id, event_date, status, calculated_value
    into v_transaction_id, v_client_id, v_old_date, v_old_status, v_old_value
    from rentals where id = p_rental_id;

  if v_client_id is null then
    raise exception 'Locação não encontrada (id %).', p_rental_id;
  end if;

  update rentals
  set equipment_id = p_equipment_id,
      event_date = p_event_date,
      shots = p_shots,
      calculated_value = p_calculated_value,
      payment_method = p_payment_method,
      status = p_status,
      notes = p_notes,
      rescheduled = rescheduled or (v_old_date is not null and v_old_date <> p_event_date)
  where id = p_rental_id;

  if v_transaction_id is not null then
    update transactions
    set amount = p_calculated_value,
        date = p_event_date,
        payment_method = p_payment_method
    where id = v_transaction_id;
  end if;

  -- Atualiza o evento de agenda vinculado; se a nova data/equipamento
  -- conflitar com outra reserva, a constraint recusa e desfaz tudo.
  update calendar_events
  set equipment_id = p_equipment_id,
      date_start = p_event_date,
      date_end = p_event_date,
      value = p_calculated_value,
      status = p_status
  where rental_id = p_rental_id;

  -- Histórico. Só depois dos updates, para a descrição já refletir o
  -- estado novo, e só se alguma coisa que importa tiver mudado.
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

grant execute on function public.update_rental to authenticated;

-- ------------------------------------------------------------
-- 8) register_contact_attempt deixava etiqueta "Follow-up N" grudada
--
-- A limpeza da etiqueta antiga só rodava no caminho "não respondeu,
-- ainda dentro do limite" — os outros dois desfechos (respondeu, ou
-- estourou o limite e foi para Nutrição) davam "return" antes de
-- chegar nessa linha, e o cliente ficava com a etiqueta antiga para
-- sempre, mesmo já tendo saído daquela sequência de follow-up. Agora a
-- limpeza roda sempre, logo depois de marcar a tarefa concluída, antes
-- de qualquer desfecho.
-- ------------------------------------------------------------
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
    current_date + 2
  );
end;
$$;

grant execute on function public.register_contact_attempt to authenticated;

-- ------------------------------------------------------------
-- 11) Categoria "Locação" buscada por nome: falha muda de silenciosa
-- para alta
--
-- create_rental e finalize_rental_reservation acham a categoria da
-- transação por name ilike 'Loca%'. Se essa categoria for renomeada em
-- Configurações, a busca não encontra nada, v_category_id vira null, e
-- como transactions.category_id aceita null, a locação seguia sendo
-- criada normalmente só que com o lançamento financeiro sem categoria
-- — sem erro, sem aviso, só um buraco na categorização. Agora, se a
-- categoria não for encontrada, a função para e avisa, em vez de
-- deixar passar.
-- ------------------------------------------------------------
create or replace function public.create_rental(
  p_client_id uuid,
  p_equipment_id uuid,
  p_event_date date,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_notes text default null,
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
  v_equipment_code equipment_code_type;
  v_client_name text;
  v_created_by uuid := auth.uid();
  v_parceiro boolean;
  v_taxa_status text;
  v_taxa_valor numeric;
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

  insert into rentals (client_id, equipment_id, event_date, shots, calculated_value, payment_method, notes, created_by, pago, pago_em)
  values (p_client_id, p_equipment_id, p_event_date, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by,
          coalesce(p_pago, false), case when p_pago then current_date else null end)
  returning id into v_rental_id;

  if p_pago then
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
    values ('entrada', v_category_id, 'Locação HIPRO - ' || coalesce(v_client_name, ''), p_calculated_value, p_payment_method, p_event_date, 'harmonize', p_client_id, v_rental_id, v_created_by)
    returning id into v_transaction_id;

    update rentals set transaction_id = v_transaction_id where id = v_rental_id;
  end if;

  if coalesce(v_parceiro, false) or p_event_date <= current_date then
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

grant execute on function public.create_rental to authenticated;

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
  v_created_by uuid := auth.uid();
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para finalizar locações';
  end if;

  select client_id, equipment_id, date_start into v_client_id, v_equipment_id, v_event_date
  from calendar_events
  where id = p_calendar_event_id and rental_id is null and status = 'pre_reserva';

  if v_client_id is null then
    raise exception 'Reserva não encontrada, já finalizada, ou sem cliente vinculado.';
  end if;
  if v_equipment_id is null then
    raise exception 'Esta reserva não está vinculada a um equipamento HIPRO.';
  end if;

  select name into v_client_name from clients where id = v_client_id;
  select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Loca%' limit 1;

  if v_category_id is null then
    raise exception 'Categoria "Locação" não encontrada (foi renomeada ou removida?). Ajuste o cadastro de categorias antes de finalizar a reserva.';
  end if;

  insert into rentals (client_id, equipment_id, event_date, shots, calculated_value, payment_method, notes, created_by)
  values (v_client_id, v_equipment_id, v_event_date, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by)
  returning id into v_rental_id;

  insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
  values ('entrada', v_category_id, 'Locação HIPRO - ' || coalesce(v_client_name, ''), p_calculated_value, p_payment_method, v_event_date, 'harmonize', v_client_id, v_rental_id, v_created_by)
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

-- ------------------------------------------------------------
-- Melhorias de índice (sem risco: só acelera consulta, não muda dado
-- nem trava nada). Os três primeiros são os que a auditoria apontou;
-- os de client_id nas outras tabelas grandes seguem o mesmo raciocínio
-- (nenhuma dessas colunas tinha índice próprio até aqui, só a FK).
-- ------------------------------------------------------------
create index if not exists calendar_events_date_start_idx on public.calendar_events(date_start);
create index if not exists transactions_date_scope_idx on public.transactions(date, scope);
create index if not exists transactions_client_id_idx on public.transactions(client_id);
create index if not exists rentals_client_id_idx on public.rentals(client_id);
create index if not exists calendar_events_client_id_idx on public.calendar_events(client_id);
