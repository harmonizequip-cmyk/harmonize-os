-- ============================================================
-- HARMONIZE OS — Schema inicial (Fase 1)
-- Alvo: Supabase (Postgres + Auth + RLS)
-- ============================================================
-- Como aplicar:
-- 1. Crie um projeto gratuito em supabase.com
-- 2. Abra SQL Editor no painel do Supabase
-- 3. Cole este arquivo inteiro e rode
-- 4. Depois, em Authentication > Users, crie seu primeiro
--    usuário (você) e rode o UPDATE no final marcando-o admin
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
create type entry_type as enum ('entrada', 'saida');
create type scope_type as enum ('harmonize', 'pessoal');
create type payment_method_type as enum ('pix', 'dinheiro', 'debito', 'credito', 'transferencia', 'outros');
create type event_status_type as enum ('pre_reserva', 'confirmada', 'realizada', 'cancelada');
create type calendar_event_type as enum ('hipro_1', 'hipro_2', 'mentoria', 'outros');
create type equipment_code_type as enum ('hipro_1', 'hipro_2');

-- ------------------------------------------------------------
-- PROFILES (estende auth.users do Supabase)
-- permissions guarda um flag booleano por módulo do menu
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  is_admin boolean not null default false,
  active boolean not null default true,
  permissions jsonb not null default '{
    "dashboard": true, "financeiro": true, "clientes": true,
    "agenda": true, "equipamentos": true, "relatorios": true,
    "exportacao": true, "configuracoes": false
  }'::jsonb,
  created_at timestamptz not null default now()
);

-- helper usado nas policies abaixo
create or replace function public.has_module_permission(module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin or (active and coalesce((permissions ->> module)::boolean, false))
     from profiles where id = auth.uid()),
    false
  );
$$;

-- Cria automaticamente a linha em profiles sempre que um usuário
-- novo é criado no Supabase Auth (Authentication > Users ou pela
-- futura tela de Configurações > Usuários). Sem isso, todo usuário
-- novo precisaria de um INSERT manual em profiles antes de conseguir
-- usar o sistema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- CLIENTES
-- ------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  clinic_name text,
  whatsapp text,
  email text,
  city text,
  address text,
  notes text,
  -- Funil de vendas: todo cliente carrega uma etapa. Cadastros feitos
  -- direto em "Clientes" entram como 'cliente' (já convertido); leads
  -- criados no Funil entram como 'lead' e avançam a partir daí.
  stage text not null default 'cliente' check (stage in ('lead','contato','qualificado','agendado','cliente')),
  -- Rastreia se a taxa de reserva (R$250) foi pedida e paga para este
  -- cliente. Independente do seletor por-locação da Nova Locação: aqui é
  -- um status permanente do cliente, não gera lançamento sozinho.
  reservation_fee_status text not null default 'nao_aplica' check (reservation_fee_status in ('nao_aplica', 'pendente', 'pago')),
  data_evento date,
  tags text[] not null default '{}',
  origem text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- EQUIPAMENTOS (seed: HIPRO 1 e HIPRO 2)
-- ------------------------------------------------------------
create table public.equipments (
  id uuid primary key default gen_random_uuid(),
  code equipment_code_type not null unique,
  name text not null,
  status text not null default 'ativo',
  created_at timestamptz not null default now()
);

insert into equipments (code, name) values
  ('hipro_1', 'HIPRO 1'),
  ('hipro_2', 'HIPRO 2');

-- ------------------------------------------------------------
-- CATEGORIAS (padrão + extensíveis em Configurações)
-- ------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type entry_type not null,
  scope scope_type not null default 'harmonize',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

insert into categories (name, type, is_default) values
  ('Locação', 'entrada', true),
  ('Taxa de reserva', 'entrada', true),
  ('Deslocamento', 'entrada', true),
  ('Mentoria', 'entrada', true),
  ('Outros', 'entrada', true),
  ('Combustível', 'saida', true),
  ('Estacionamento', 'saida', true),
  ('Hospedagem', 'saida', true),
  ('Alimentação', 'saida', true),
  ('Insumos', 'saida', true),
  ('Retiradas', 'saida', true),
  ('Outros', 'saida', true);

-- ------------------------------------------------------------
-- LANÇAMENTOS FINANCEIROS (harmonize + pessoal no mesmo lugar,
-- separados por "scope" — pessoal nunca aparece no ambiente harmonize)
-- ------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  type entry_type not null,
  category_id uuid references categories(id),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method payment_method_type not null,
  date date not null,
  notes text,
  scope scope_type not null default 'harmonize',
  client_id uuid references clients(id),
  rental_id uuid,
  mentoring_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- LOCAÇÕES
-- ------------------------------------------------------------
create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  equipment_id uuid not null references equipments(id),
  event_date date not null,
  -- Modelo de preço novo (pacote fixo até 20k + faixas progressivas)
  -- não tem taxa de reserva separada nem mínimo confirmado ainda.
  -- Se um mínimo for confirmado, adicione: check (shots >= N) aqui.
  shots integer not null check (shots > 0),
  calculated_value numeric(12,2) not null,
  payment_method payment_method_type not null,
  status event_status_type not null default 'confirmada',
  -- Marcado automaticamente pela função update_rental quando a data
  -- muda em relação ao valor gravado anteriormente. Não é editado
  -- manualmente, fica registrado como fato histórico.
  rescheduled boolean not null default false,
  transaction_id uuid references transactions(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table transactions
  add constraint transactions_rental_fk foreign key (rental_id) references rentals(id);

-- ------------------------------------------------------------
-- AGENDA (HIPRO 1, HIPRO 2, Mentoria, Outros — mesma tabela)
-- ------------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_type calendar_event_type not null,
  title text not null,
  client_id uuid references clients(id),
  equipment_id uuid references equipments(id),
  date_start date not null,
  date_end date not null,
  time_start time,
  time_end time,
  status event_status_type not null default 'pre_reserva',
  -- Confirmação com o cliente próximo à data, distinta do status geral
  -- da reserva. Começa como false; a Agenda destaca automaticamente
  -- quem está a menos de 7 dias e ainda não foi confirmado.
  confirmed boolean not null default false,
  value numeric(12,2),
  notes text,
  rental_id uuid references rentals(id),
  mentoring_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (date_end >= date_start)
);

-- Regra da seção 15: impede fisicamente dois eventos sobrepostos
-- no mesmo equipamento (HIPRO 1 ou HIPRO 2), exceto eventos cancelados.
alter table calendar_events
  add constraint no_equipment_double_booking
  exclude using gist (
    equipment_id with =,
    daterange(date_start, date_end, '[]') with &&
  )
  where (status <> 'cancelada' and equipment_id is not null);

-- ------------------------------------------------------------
-- MENTORIAS
-- ------------------------------------------------------------
create table public.mentoring_events (
  id uuid primary key default gen_random_uuid(),
  calendar_event_id uuid references calendar_events(id),
  mentee_name text not null,
  date date not null,
  time_start time,
  value numeric(12,2),
  payment_method payment_method_type,
  notes text,
  transaction_id uuid references transactions(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table calendar_events
  add constraint calendar_mentoring_fk foreign key (mentoring_id) references mentoring_events(id);
alter table transactions
  add constraint transactions_mentoring_fk foreign key (mentoring_id) references mentoring_events(id);

-- ------------------------------------------------------------
-- LIMITES DE GASTO
-- ------------------------------------------------------------
create table public.expense_limits (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  scope scope_type not null default 'harmonize',
  month_limit numeric(12,2) not null check (month_limit > 0),
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table clients enable row level security;
alter table equipments enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table rentals enable row level security;
alter table calendar_events enable row level security;
alter table mentoring_events enable row level security;
alter table expense_limits enable row level security;

-- profiles: cada um vê o próprio; admin vê todos
create policy "profiles_self_select" on profiles for select using (id = auth.uid() or has_module_permission('configuracoes'));
create policy "profiles_self_update" on profiles for update using (id = auth.uid() or has_module_permission('configuracoes'));

-- clientes
create policy "clients_rw" on clients for all using (has_module_permission('clientes')) with check (has_module_permission('clientes'));

-- equipamentos: leitura ampla, escrita restrita a configurações
create policy "equipments_select" on equipments for select using (auth.uid() is not null);
create policy "equipments_write" on equipments for insert with check (has_module_permission('configuracoes'));
create policy "equipments_update" on equipments for update using (has_module_permission('configuracoes'));

-- categorias: leitura ampla (usada em formulários), escrita em configurações
create policy "categories_select" on categories for select using (auth.uid() is not null);
create policy "categories_write" on categories for insert with check (has_module_permission('configuracoes'));
create policy "categories_update" on categories for update using (has_module_permission('configuracoes'));

-- transações: harmonize exige permissão de financeiro; pessoal só o dono vê
create policy "transactions_rw_harmonize" on transactions for all
  using (scope = 'harmonize' and has_module_permission('financeiro'))
  with check (scope = 'harmonize' and has_module_permission('financeiro'));
create policy "transactions_rw_pessoal" on transactions for all
  using (scope = 'pessoal' and created_by = auth.uid())
  with check (scope = 'pessoal' and created_by = auth.uid());

-- locações: fluxo de agenda
create policy "rentals_rw" on rentals for all using (has_module_permission('agenda')) with check (has_module_permission('agenda'));

-- agenda
create policy "calendar_rw" on calendar_events for all using (has_module_permission('agenda')) with check (has_module_permission('agenda'));

-- mentorias
create policy "mentoring_rw" on mentoring_events for all using (has_module_permission('agenda')) with check (has_module_permission('agenda'));

-- limites: harmonize por financeiro, pessoal por dono (via join implícito na app)
create policy "limits_rw_harmonize" on expense_limits for all
  using (scope = 'harmonize' and has_module_permission('financeiro'))
  with check (scope = 'harmonize' and has_module_permission('financeiro'));
create policy "limits_rw_pessoal" on expense_limits for all
  using (scope = 'pessoal')
  with check (scope = 'pessoal');

-- ============================================================
-- FUNÇÃO: create_rental
-- Cria a locação, a entrada financeira e o evento de agenda em uma
-- única operação atômica. Se o equipamento já estiver reservado no
-- período (constraint no_equipment_double_booking), a função inteira
-- é revertida e o erro sobe para quem chamou — nada fica gravado
-- pela metade.
-- ============================================================
create or replace function public.create_rental(
  p_client_id uuid,
  p_equipment_id uuid,
  p_event_date date,
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
  v_equipment_code equipment_code_type;
  v_client_name text;
  v_created_by uuid := auth.uid();
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para criar locações';
  end if;

  select code into v_equipment_code from equipments where id = p_equipment_id;
  select name into v_client_name from clients where id = p_client_id;
  select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Loca%' limit 1;

  insert into rentals (client_id, equipment_id, event_date, shots, calculated_value, payment_method, notes, created_by)
  values (p_client_id, p_equipment_id, p_event_date, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by)
  returning id into v_rental_id;

  insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
  values ('entrada', v_category_id, 'Locação HIPRO - ' || coalesce(v_client_name, ''), p_calculated_value, p_payment_method, p_event_date, 'harmonize', p_client_id, v_rental_id, v_created_by)
  returning id into v_transaction_id;

  update rentals set transaction_id = v_transaction_id where id = v_rental_id;

  -- Esta gravação é a que aciona a constraint no_equipment_double_booking.
  -- Se houver conflito, o Postgres recusa aqui e toda a função é desfeita.
  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, value, rental_id, created_by)
  values (v_equipment_code::text::calendar_event_type, 'Locação - ' || coalesce(v_client_name, ''), p_client_id, p_equipment_id, p_event_date, p_event_date, 'confirmada', p_calculated_value, v_rental_id, v_created_by);

  -- Primeira locação promove o cliente automaticamente para a etapa final do funil.
  update clients set stage = 'cliente' where id = p_client_id and stage <> 'cliente';

  return v_rental_id;
end;
$$;

grant execute on function public.create_rental to authenticated;

-- ============================================================
-- FUNÇÃO: update_rental
-- Edita uma locação já existente e mantém a transação financeira e o
-- evento de agenda vinculados em sincronia. Sujeita à mesma constraint
-- de conflito de agenda (no_equipment_double_booking).
-- ============================================================
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
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para editar locações';
  end if;

  select transaction_id, client_id, event_date into v_transaction_id, v_client_id, v_old_date
  from rentals where id = p_rental_id;

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
end;
$$;

grant execute on function public.update_rental to authenticated;

-- ============================================================
-- FUNÇÃO: finalize_rental_reservation
-- Converte uma pré-reserva de HIPRO (evento de agenda criado sem
-- disparos, status 'pre_reserva', sem rental_id) em uma locação de
-- verdade: cria a locação e a transação financeira, e ATUALIZA o
-- calendar_events já existente em vez de inserir um novo (evita
-- disparar a constraint no_equipment_double_booking contra a própria
-- pré-reserva). Usada quando o cliente já fez o procedimento e a
-- contagem de disparos finalmente existe.
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

-- ============================================================
-- Depois de criar seu usuário em Authentication > Users,
-- rode isto trocando o e-mail, para virar admin com acesso total:
-- ============================================================
-- update profiles set is_admin = true,
--   permissions = '{"dashboard":true,"financeiro":true,"clientes":true,
--     "agenda":true,"equipamentos":true,"relatorios":true,
--     "exportacao":true,"configuracoes":true}'::jsonb
-- where email = 'seu-email@exemplo.com';
