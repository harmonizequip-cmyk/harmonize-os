-- ============================================================
-- STATUS: PENDENTE (ainda não rodada no Supabase; só roda com o aval do dono).
-- Cliente isento de taxa de reserva, mesmo sem ser parceiro (pedido do dono,
-- 17/10/2026: clientes antigos que nunca pagaram a taxa e funcionava assim).
--   1. clients.isento_taxa (padrão false). Parceiro continua como está.
--   2. Reserva nova de cliente isento nasce sem taxa (definir_taxa_ao_criar_evento
--      e create_rental).
--   3. Marcar a cliente como isenta tira a taxa pendente e as tarefas de
--      cobrança das reservas dela (mesmo gatilho do parceiro); reserva que
--      passa para uma cliente isenta também.
-- Não altera nenhum dado existente: ninguém é marcado automaticamente.
-- Taxa já paga fica como está (é dinheiro que entrou).
-- ============================================================

alter table public.clients
  add column if not exists isento_taxa boolean not null default false;

comment on column public.clients.isento_taxa is
  'true = cliente isenta da taxa de reserva sem ser parceiro (ex.: clientes antigos que nunca pagaram). Reservas dela nascem com taxa_status = nao_aplica. Parceiro continua isentando pela coluna parceiro.';

create or replace function public.definir_taxa_ao_criar_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_isenta boolean;
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

  select (parceiro or isento_taxa) into v_isenta from clients where id = new.client_id;
  if coalesce(v_isenta, false) then
    return new;
  end if;

  new.taxa_status := 'pendente';
  new.taxa_valor := public.valor_taxa_atual();
  return new;
end;
$$;

create or replace function public.isentar_taxa_de_parceiro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.parceiro and not coalesce(old.parceiro, false))
     or (new.isento_taxa and not coalesce(old.isento_taxa, false)) then
    update calendar_events
       set taxa_status = 'nao_aplica'
     where client_id = new.id
       and taxa_status = 'pendente';
    delete from tasks
     where client_id = new.id
       and type = 'cobranca_taxa'
       and status = 'pendente';
  end if;
  return new;
end;
$$;

create or replace function public.isentar_taxa_ao_trocar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.taxa_status = 'pendente'
     and new.client_id is distinct from old.client_id
     and exists (select 1 from clients where id = new.client_id and (parceiro or isento_taxa)) then
    new.taxa_status := 'nao_aplica';
    delete from tasks where event_id = new.id and type = 'cobranca_taxa' and status = 'pendente';
  end if;
  return new;
end;
$$;


revoke execute on function public.definir_taxa_ao_criar_evento() from public, anon;
revoke execute on function public.isentar_taxa_de_parceiro() from public, anon;
revoke execute on function public.isentar_taxa_ao_trocar_cliente() from public, anon;
grant execute on function public.definir_taxa_ao_criar_evento() to authenticated, service_role;
grant execute on function public.isentar_taxa_de_parceiro() to authenticated, service_role;
grant execute on function public.isentar_taxa_ao_trocar_cliente() to authenticated, service_role;

drop trigger if exists clients_isentar_taxa_parceiro on public.clients;
create trigger clients_isentar_taxa_parceiro
  after update of parceiro, isento_taxa on public.clients
  for each row execute function public.isentar_taxa_de_parceiro();

-- A função mudou de assinatura mais de uma vez: apaga TODAS as versões antes
-- de recriar (senão o grant fica ambíguo), como no schema.sql.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_rental'
  loop
    execute format('drop function %s', r.sig);
  end loop;
end $$;

create or replace function public.create_rental(
  p_client_id uuid,
  p_equipment_id uuid,
  p_event_date date,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_notes text default null,
  p_pago boolean default true,
  p_pix_conta text default null,
  p_event_date_end date default null
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
  v_isenta boolean;
  v_taxa_status text;
  v_taxa_valor numeric;
  v_pix_conta text;
  v_date_end date;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para criar locações';
  end if;

  if p_event_date_end is not null and p_event_date_end < p_event_date then
    raise exception 'A data final do período não pode ser antes da data inicial.';
  end if;
  v_date_end := coalesce(p_event_date_end, p_event_date);

  select code into v_equipment_code from equipments where id = p_equipment_id;
  select name, (parceiro or isento_taxa) into v_client_name, v_isenta from clients where id = p_client_id;
  select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Loca%' limit 1;

  if v_category_id is null then
    raise exception 'Categoria "Locação" não encontrada (foi renomeada ou removida?). Ajuste o cadastro de categorias antes de criar a locação.';
  end if;

  insert into rentals (client_id, equipment_id, event_date, event_date_end, shots, calculated_value, payment_method, notes, created_by)
  values (p_client_id, p_equipment_id, p_event_date, p_event_date_end, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by)
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
  if coalesce(v_isenta, false) or p_event_date <= public.hoje_local() then
    v_taxa_status := 'nao_aplica';
    v_taxa_valor  := null;
  else
    v_taxa_status := 'pendente';
    v_taxa_valor  := public.valor_taxa_atual();
  end if;

  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, value, rental_id, created_by, taxa_status, taxa_valor)
  values (v_equipment_code::text::calendar_event_type, 'Locação - ' || coalesce(v_client_name, ''), p_client_id, p_equipment_id, p_event_date, v_date_end, 'confirmada', p_calculated_value, v_rental_id, v_created_by,
          v_taxa_status, v_taxa_valor);

  update clients set stage = 'cliente' where id = p_client_id and stage <> 'cliente';

  return v_rental_id;
end;
$$;

grant execute on function public.create_rental(uuid, uuid, date, integer, numeric, payment_method_type, text, boolean, text, date) to authenticated;
revoke execute on function public.create_rental(uuid, uuid, date, integer, numeric, payment_method_type, text, boolean, text, date) from public, anon;
