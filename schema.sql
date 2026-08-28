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
  notes text,
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
-- Depois de criar seu usuário em Authentication > Users,
-- rode isto trocando o e-mail, para virar admin com acesso total:
-- ============================================================
-- update profiles set is_admin = true,
--   permissions = '{"dashboard":true,"financeiro":true,"clientes":true,
--     "agenda":true,"equipamentos":true,"relatorios":true,
--     "exportacao":true,"configuracoes":true}'::jsonb
-- where email = 'seu-email@exemplo.com';
