-- ============================================================
-- HARMONIZE OS — Schema consolidado (estado atual)
-- Alvo: Supabase (Postgres + Auth + RLS)
-- Gerado em: 2026-09-25
-- ============================================================
-- O QUE É ESTE ARQUIVO
-- Este arquivo substitui a versão "Fase 1" original: aquela nunca mais
-- foi re-rodada desde 21/09/2026, e toda mudança depois disso virou uma
-- migration incremental própria (pasta migrations/, 21 arquivos entre
-- 21/09 e 25/09). Isso deixou o schema.sql documentando um estado que a
-- base de produção não tem mais há dias.
--
-- Este arquivo é o resultado de mesclar o schema.sql original com as 21
-- migrations, mantendo só a versão FINAL de cada tabela, coluna,
-- constraint, função, trigger, índice, view e policy — ou seja, ele
-- descreve o estado atual da produção, não o histórico de como se
-- chegou até ele (esse histórico continua em migrations/, arquivo por
-- arquivo, cada um com o "porquê" da mudança).
--
-- COMO USAR
-- Serve para dois propósitos, não um só:
--   1. Documentação: é para onde olhar para saber "como é a tabela X
--      hoje", sem precisar somar 21 arquivos de migration na cabeça.
--   2. Setup do zero: também RODA de ponta a ponta num projeto Supabase
--      novo e vazio, criando o sistema já no estado atual (sem precisar
--      rodar os 21 arquivos de migration em sequência depois). Foi
--      escrito e testado localmente (Postgres 16) para isso.
--
-- O QUE FICOU DE FORA DE PROPÓSITO
-- Três migrations do histórico não têm efeito nenhum de schema, só
-- mexem em dado de uma base já existente, então não fazem sentido aqui
-- (rodar num banco novo e vazio não teria o que corrigir):
--   - 2026-09-22-limpeza-dados-teste.sql (apaga dado de teste específico)
--   - 2026-09-24-acerto-parceiros-e-taxas.sql (marca clientes específicos
--     — CLAUDETE, FERNANDA MAIA, LASER DREAM etc. — como parceiro/teste,
--     e desfaz taxas pendentes que não seriam cobradas)
--   - 2026-09-24-rodar-tudo-c3c-c4.sql (arquivo-embrulho que só junta
--     leva-c3c + leva-c4 num só para rodar de uma vez; o conteúdo dele
--     já está mesclado aqui a partir dos dois arquivos originais)
-- Pelo mesmo motivo, o backfill de rentals.pago/pago_em (leva C3a) e o
-- de calendar_events.taxa_status (leva C3c) — que corrigiam dado
-- histórico específico da base de produção no momento de cada migration
-- — também não entram aqui: são ajustes de dado, não de estrutura.
--
-- Como sempre, depois de rodar isto num projeto novo: crie seu usuário
-- em Authentication > Users e rode o UPDATE no fim do arquivo para
-- virar admin.
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

-- Porta de entrada de toda política de RLS do sistema. Versão corrigida
-- (leva H, 25/09/2026): "active" vale para todo mundo, admin incluso —
-- a versão original tinha "is_admin or (active and ...)", o que fazia
-- um admin desativado (active=false) continuar com acesso total.
create or replace function public.has_module_permission(module text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select active and (is_admin or coalesce((permissions ->> module)::boolean, false))
       from profiles where id = auth.uid()),
    false
  );
$function$;

comment on function public.has_module_permission(text) is
  'Porta de entrada de toda política de RLS do sistema: true só se o perfil logado está active E (é admin OU tem o módulo liberado em permissions). active bloqueia mesmo administrador (leva H) — antes desta correção, is_admin ignorava active.';

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

-- Trava is_admin/active/permissions contra autoedição (leva J, item 1 de
-- uma auditoria externa): sem isto, qualquer usuário logado conseguia
-- chamar a API do Supabase direto e fazer
-- update profiles set is_admin = true where id = auth.uid(), porque a
-- RLS só restringe QUAL LINHA pode mudar, não QUAIS COLUNAS. Só quem já
-- tem "configuracoes" consegue mudar esses três campos, de si mesmo ou
-- de outro perfil.
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

create trigger trg_profiles_lock_privileged_fields
  before update on public.profiles
  for each row execute function public.profiles_lock_privileged_fields();

comment on function public.profiles_lock_privileged_fields is
  'Trava is_admin/active/permissions contra autoedição (leva J, item 1 da auditoria externa): só quem já tem a permissão "configuracoes" consegue mudar esses três campos, de si mesmo ou de outro perfil.';

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
  stage text not null default 'cliente' check (stage in ('lead','contato','nutricao','qualificado','agendado','cliente')),
  -- Legado: guardava UMA taxa de reserva por cliente. Substituído pela
  -- view clientes_taxas (leva C4), que lê a taxa por agendamento — um
  -- cliente que aluga cinco vezes reserva cinco datas e deve cinco
  -- taxas, e este campo não tinha como representar isso. Ninguém lê
  -- mais esta coluna; ela continua existindo só porque ainda não foi
  -- formalmente removida.
  reservation_fee_status text not null default 'nao_aplica' check (reservation_fee_status in ('nao_aplica', 'pendente', 'pago')),
  data_evento date,
  -- Tags vivem em tabelas próprias (ver "tags" e "client_tags" logo
  -- abaixo de equipments), não mais como array nesta tabela.
  origem text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- Modo teste (ver settings.test_mode / apply_test_mode): registro
  -- marcado assim some de toda tela e relatório, sem apagar nada.
  is_test boolean not null default false,
  -- Parceiro conhecido: reserva data sem pagar a taxa de compromisso.
  -- Agendamentos deste cliente nascem com taxa_status = nao_aplica.
  parceiro boolean not null default false,
  -- true = nunca conta como faturamento (rentals_contabilizaveis /
  -- transactions_contabilizaveis), mesmo sem ser cadastro de teste. Para
  -- uso interno que nunca gera receita de verdade (ex: LASER DREAM JP,
  -- controle de agenda da própria clínica). Diferente de parceiro
  -- (isenta só a taxa, ainda é negócio real) e de is_test (some de toda
  -- tela).
  excluir_financeiro boolean not null default false,
  -- Tratamento (Dr./Dra.) e nome de exibição: usados nas mensagens ao
  -- cliente, separados de "name" porque esse campo às vezes vem com
  -- tudo misturado. Nulo = cadastro incompleto para fins de mensagem.
  treatment text check (treatment is null or treatment in ('Dr.', 'Dra.')),
  display_name text,
  -- Uma vez cliente, sempre cliente: true assim que stage chega a
  -- "cliente" (gatilho marcar_is_client) e nunca mais volta para false
  -- sozinho quando a etapa muda — mover um Cliente de volta para
  -- "Agendamento" numa segunda venda não desfaz a conversão.
  is_client boolean not null default false
);

comment on column public.clients.parceiro is
  'Parceiro conhecido: reserva data sem pagar a taxa de compromisso. Agendamentos deste cliente nascem com taxa_status = nao_aplica.';
comment on column public.clients.excluir_financeiro is
  'true = nunca conta como faturamento (rentals_contabilizaveis / transactions_contabilizaveis), mesmo sem ser cadastro de teste. Para uso interno que nunca gera receita de verdade (ex: LASER DREAM JP, controle de agenda da própria clínica). Diferente de parceiro (isenta só a taxa, ainda é negócio real) e de is_test (some de toda tela).';
comment on column public.clients.treatment is
  'Dr./Dra., usado nas mensagens ao cliente. Nulo = cadastro incompleto para fins de mensagem.';
comment on column public.clients.display_name is
  'Nome curto para comunicação (ex: "Camila Lima"), separado do campo name que pode vir com informação misturada. Nulo = cadastro incompleto para fins de mensagem.';
comment on column public.clients.is_client is
  'Uma vez cliente, sempre cliente: true assim que stage chega a "cliente" e nunca mais volta para false sozinho quando a etapa muda. Só uma ação dedicada de "reverter para lead" (se existir) pode desligar isso, atualizando esta coluna sem mexer em stage.';

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
-- SETTINGS: linha única de configuração do sistema. id boolean + check
-- garante que só existe uma linha.
-- ------------------------------------------------------------
create table public.settings (
  id boolean primary key default true check (id),
  flat_package_limit integer not null default 20000,
  flat_package_value numeric(10,2) not null default 2500.00,
  tier2_limit integer not null default 80000,
  tier2_rate numeric(6,4) not null default 0.10,
  tier3_rate numeric(6,4) not null default 0.07,
  reservation_fee numeric(10,2) not null default 250.00,
  inactive_days_threshold integer not null default 60,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  -- Modo teste: chave geral, ligada/desligada em Configurações. Enquanto
  -- ligada, tudo que for criado nasce marcado como teste (ver
  -- apply_test_mode), inclusive o que nasce em cascata.
  test_mode boolean not null default false,
  -- Preço de mentoria: cobrança por PACIENTE MODELO, modelo totalmente
  -- diferente do HIPRO Day (que é por disparo). Confirmado 25/09/2026:
  -- R$1.500/paciente quando o pagamento é parcelado no crédito (até
  -- 10x), ou R$1.200/paciente em qualquer outra forma de pagamento.
  mentoria_valor_avista numeric(10,2) not null default 1200.00,
  mentoria_valor_parcelado numeric(10,2) not null default 1500.00
);

comment on column public.settings.mentoria_valor_avista is
  'Valor cobrado por paciente modelo numa mentoria, em qualquer forma de pagamento exceto crédito parcelado (ver mentoria_valor_parcelado).';
comment on column public.settings.mentoria_valor_parcelado is
  'Valor cobrado por paciente modelo numa mentoria quando o pagamento é no crédito, parcelado em até 10x.';

insert into settings (id) values (true);

-- ------------------------------------------------------------
-- TAGS: tabela própria com cor. is_automatic fica reservado para tags
-- aplicadas automaticamente por gatilho (follow-up, reagendamento).
-- ------------------------------------------------------------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#3DBFB8',
  is_automatic boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.client_tags (
  client_id uuid not null references clients(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, tag_id)
);

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
  created_at timestamptz not null default now(),
  is_test boolean not null default false
);

-- ------------------------------------------------------------
-- LOCAÇÕES
-- ------------------------------------------------------------
create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  equipment_id uuid not null references equipments(id),
  event_date date not null,
  -- Quantidade positiva: disparos numa locação HIPRO normal, ou
  -- pacientes modelo numa mentoria (ver calendar_events.is_mentoria e
  -- finalize_rental_reservation) — os dois cabem no mesmo "> 0".
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
  created_at timestamptz not null default now(),
  is_test boolean not null default false,
  -- Se o dinheiro da locação entrou. Independente de status: locação
  -- pode estar realizada e não paga, e nesse caso é receita a receber
  -- (ver view locacoes_a_receber).
  pago boolean not null default false,
  pago_em date,
  -- Leva O: deslocamento e custo por disparo negociado são preenchidos
  -- pela calculadora (leva seguinte); aqui só guardam o valor já
  -- calculado. pago/pago_em, a partir desta leva, deixam de ser setados
  -- manualmente por qualquer função — são CALCULADOS por
  -- recalcular_pagamento_locacao() a partir da soma de rental_payments
  -- (ver mais abaixo), nunca escritos direto em UPDATE fora dela.
  km_ida numeric(8,2),
  valor_deslocamento numeric(10,2) not null default 0,
  custo_disparo_manual numeric(6,4)
);

comment on column public.rentals.pago is
  'Se o dinheiro da locação entrou. Independente de status: locação pode estar realizada e não paga, e nesse caso é receita a receber. Calculado por recalcular_pagamento_locacao() a partir de rental_payments, nunca setado direto por fora dela.';
comment on column public.rentals.km_ida is
  'Distância de ida (em km) até o cliente, digitada uma vez só; a volta é assumida igual. Usada para o relatório de km rodados e para calcular valor_deslocamento (R$ 50 a cada 50 km de ida e volta, arredondando pela regra de 25 km).';
comment on column public.rentals.valor_deslocamento is
  'Valor de deslocamento já calculado e cobrado do cliente nesta locação, como ajuda de custo ligada a ela. Ver km_ida para a distância que originou o valor.';
comment on column public.rentals.custo_disparo_manual is
  'Preço por disparo negociado manualmente nesta locação (ex: 0.07), usado no lugar da tabela em faixas quando o atendimento pede um valor fora do padrão. Nulo = locação cobrada pela tabela normal.';

alter table transactions
  add constraint transactions_rental_fk foreign key (rental_id) references rentals(id);

-- RENTAL_PAYMENTS (leva O) é criada mais abaixo, depois de apply_test_mode
-- existir (o trigger de modo teste da tabela depende dela).

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
  is_test boolean not null default false,
  -- Taxa de compromisso deste agendamento (R$250, valor configurável em
  -- settings.reservation_fee). paga vira crédito na locação; perdida é
  -- quando o cliente cancelou após pagar, e o valor fica como receita.
  taxa_status text not null default 'nao_aplica',
  taxa_valor numeric(12,2),
  taxa_transaction_id uuid references public.transactions(id),
  -- true = esta reserva de equipamento (hipro_1/hipro_2) é para
  -- mentoria, não para locação de cliente. Não muda event_type nem a
  -- proteção contra duplo-agendamento; na "Reservar HIPRO Day" só é um
  -- marcador (sem transação ainda), mas finalize_rental_reservation usa
  -- este campo para categorizar e calcular a cobrança por paciente
  -- modelo ao finalizar.
  is_mentoria boolean not null default false,
  -- Quando "Pedir confirmação no WhatsApp" foi clicado para ESTA
  -- reserva. Nunca é setado por "Confirmar reserva", e nunca muda
  -- calendar_events.confirmed.
  confirmation_message_sent_at timestamptz,
  check (date_end >= date_start)
);

alter table public.calendar_events add constraint calendar_events_taxa_status_check
  check (taxa_status in ('nao_aplica', 'pendente', 'paga', 'perdida'));

alter table public.calendar_events add constraint calendar_events_time_order_check
  check (time_start is null or time_end is null or time_end >= time_start);

comment on column public.calendar_events.taxa_status is
  'Taxa de compromisso deste agendamento. paga vira crédito na locação; perdida é quando o cliente cancelou após pagar, e o valor fica como receita.';
comment on column public.calendar_events.is_mentoria is
  'true = esta reserva de equipamento (hipro_1/hipro_2) é para mentoria, não para locação de cliente. Não muda event_type nem a proteção contra duplo-agendamento; na "Reservar HIPRO Day" só é um marcador (sem transação ainda), mas finalize_rental_reservation usa este campo para categorizar e calcular a cobrança por paciente modelo ao finalizar.';
comment on column public.calendar_events.confirmation_message_sent_at is
  'Quando "Pedir confirmação no WhatsApp" foi clicado para ESTA reserva. Nunca é setado por "Confirmar reserva", e nunca muda calendar_events.confirmed.';

-- Impede fisicamente dois eventos sobrepostos no mesmo equipamento
-- (HIPRO 1 ou HIPRO 2), exceto eventos cancelados. is_test entra na
-- chave de exclusão para um evento de teste não bloquear uma reserva
-- real no mesmo dia (dois eventos de teste continuam conflitando entre
-- si).
alter table calendar_events
  add constraint no_equipment_double_booking
  exclude using gist (
    equipment_id with =,
    is_test with =,
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
  created_at timestamptz not null default now(),
  is_test boolean not null default false
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

-- ------------------------------------------------------------
-- TAREFAS: uma por cliente, criada automaticamente ao entrar em
-- "Tentativa de contato" e a cada tentativa sem resposta. Também aceita
-- tarefas manuais (type = 'manual'), criadas pela pessoa pelo botão "+"
-- ou pela ficha do cliente — por isso client_id é opcional (tarefa
-- solta, sem cliente vinculado).
-- ------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  type text not null default 'contato_inicial' check (type in ('contato_inicial', 'followup', 'manual')),
  follow_up_number integer,
  title text not null,
  due_date date not null default current_date,
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  is_test boolean not null default false
);

create index tasks_client_id_idx on tasks(client_id);
create index tasks_status_due_date_idx on tasks(status, due_date);

-- ------------------------------------------------------------
-- MOVIMENTAÇÕES: histórico de quem fez o quê e quando. usuario_nome e
-- descricao são guardados já escritos, de propósito — um histórico que
-- depende de join com o registro apagado fica ilegível justamente nas
-- linhas que mais importam, que são as de exclusão. Sem chave
-- estrangeira em entidade_id de propósito: na linha de exclusão este id
-- aponta para algo que não existe mais.
-- ------------------------------------------------------------
create table public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  ocorrido_em timestamptz not null default now(),
  usuario_id uuid references public.profiles(id) on delete set null,
  usuario_nome text not null,
  acao text not null check (acao in (
    'criado', 'editado', 'confirmado', 'desconfirmado',
    'reagendado', 'cancelado', 'excluido',
    'realizado', 'realizacao_desfeita',
    'pago', 'pagamento_desfeito',
    'taxa_paga', 'taxa_perdida', 'taxa_isenta', 'taxa_pendente',
    'pedido_confirmacao_enviado'
  )),
  entidade text not null,
  entidade_id uuid,
  descricao text not null,
  detalhes jsonb not null default '{}'::jsonb
);

create index movimentacoes_ocorrido_em_idx
  on public.movimentacoes (ocorrido_em desc);
create index movimentacoes_entidade_idx
  on public.movimentacoes (entidade, entidade_id);

comment on table public.movimentacoes is
  'Histórico de movimentações: quem fez o quê e quando. Só as funções security definer escrevem aqui; não há policy de insert/update/delete de propósito, para o histórico não poder ser reescrito.';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table clients enable row level security;
alter table equipments enable row level security;
alter table settings enable row level security;
alter table tags enable row level security;
alter table client_tags enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table rentals enable row level security;
alter table calendar_events enable row level security;
alter table mentoring_events enable row level security;
alter table expense_limits enable row level security;
alter table tasks enable row level security;
alter table movimentacoes enable row level security;

-- profiles: cada um vê o próprio; admin vê todos
create policy "profiles_self_select" on profiles for select using (id = auth.uid() or has_module_permission('configuracoes'));
create policy "profiles_self_update" on profiles for update using (id = auth.uid() or has_module_permission('configuracoes'));

-- clientes: select/insert/update por permissão de módulo; SEM policy de
-- delete (leva E) — exclusão só pelo caminho de delete_record_forever
-- (security definer, exige admin), nunca direto pela API.
create policy "clients_select" on clients for select using (has_module_permission('clientes'));
create policy "clients_insert" on clients for insert with check (has_module_permission('clientes'));
create policy "clients_update" on clients for update
  using (has_module_permission('clientes'))
  with check (has_module_permission('clientes'));

-- settings: leitura ampla (preço é usado em qualquer locação), escrita só em configurações
create policy "settings_select" on settings for select using (auth.uid() is not null);
create policy "settings_update" on settings for update using (has_module_permission('configuracoes'));

-- tags: leitura ampla; criar é ação do dia a dia (clientes ou agenda/funil),
-- renomear/mudar cor/apagar afeta todo mundo que já usa a tag, fica em
-- configurações. Exclusão direta continua liberada por design (fora da
-- trava da leva E: catálogo/associação, não entra no histórico de
-- movimentações, e a tela de tags/etiquetas já apaga direto).
create policy "tags_select" on tags for select using (auth.uid() is not null);
create policy "tags_insert" on tags for insert
  with check (has_module_permission('clientes') or has_module_permission('agenda') or has_module_permission('configuracoes'));
create policy "tags_update" on tags for update using (has_module_permission('configuracoes'));
create policy "tags_delete" on tags for delete using (has_module_permission('configuracoes'));

create policy "client_tags_rw" on client_tags for all
  using (has_module_permission('clientes'))
  with check (has_module_permission('clientes'));

-- equipamentos: leitura ampla, escrita restrita a configurações
create policy "equipments_select" on equipments for select using (auth.uid() is not null);
create policy "equipments_write" on equipments for insert with check (has_module_permission('configuracoes'));
create policy "equipments_update" on equipments for update using (has_module_permission('configuracoes'));

-- categorias: leitura ampla (usada em formulários), escrita em configurações
create policy "categories_select" on categories for select using (auth.uid() is not null);
create policy "categories_write" on categories for insert with check (has_module_permission('configuracoes'));
create policy "categories_update" on categories for update using (has_module_permission('configuracoes'));

-- transações: harmonize exige permissão de financeiro; pessoal só o
-- dono vê. Sem policy de delete (leva E).
create policy "transactions_select_harmonize" on transactions for select
  using (scope = 'harmonize' and has_module_permission('financeiro'));
create policy "transactions_insert_harmonize" on transactions for insert
  with check (scope = 'harmonize' and has_module_permission('financeiro'));
create policy "transactions_update_harmonize" on transactions for update
  using (scope = 'harmonize' and has_module_permission('financeiro'))
  with check (scope = 'harmonize' and has_module_permission('financeiro'));

create policy "transactions_select_pessoal" on transactions for select
  using (scope = 'pessoal' and created_by = auth.uid());
create policy "transactions_insert_pessoal" on transactions for insert
  with check (scope = 'pessoal' and created_by = auth.uid());
create policy "transactions_update_pessoal" on transactions for update
  using (scope = 'pessoal' and created_by = auth.uid())
  with check (scope = 'pessoal' and created_by = auth.uid());

-- locações: fluxo de agenda. Sem policy de delete (leva E).
create policy "rentals_select" on rentals for select using (has_module_permission('agenda'));
create policy "rentals_insert" on rentals for insert with check (has_module_permission('agenda'));
create policy "rentals_update" on rentals for update
  using (has_module_permission('agenda'))
  with check (has_module_permission('agenda'));

-- agenda. Sem policy de delete (leva E).
create policy "calendar_select" on calendar_events for select using (has_module_permission('agenda'));
create policy "calendar_insert" on calendar_events for insert with check (has_module_permission('agenda'));
create policy "calendar_update" on calendar_events for update
  using (has_module_permission('agenda'))
  with check (has_module_permission('agenda'));

-- mentorias. Sem policy de delete (leva E).
create policy "mentoring_select" on mentoring_events for select using (has_module_permission('agenda'));
create policy "mentoring_insert" on mentoring_events for insert with check (has_module_permission('agenda'));
create policy "mentoring_update" on mentoring_events for update
  using (has_module_permission('agenda'))
  with check (has_module_permission('agenda'));

-- limites: harmonize por financeiro, pessoal por dono (via join implícito na app)
create policy "limits_rw_harmonize" on expense_limits for all
  using (scope = 'harmonize' and has_module_permission('financeiro'))
  with check (scope = 'harmonize' and has_module_permission('financeiro'));
create policy "limits_rw_pessoal" on expense_limits for all
  using (scope = 'pessoal')
  with check (scope = 'pessoal');

-- tarefas. Sem policy de delete (leva E).
create policy "tasks_select" on tasks for select using (has_module_permission('clientes'));
create policy "tasks_insert" on tasks for insert with check (has_module_permission('clientes'));
create policy "tasks_update" on tasks for update
  using (has_module_permission('clientes'))
  with check (has_module_permission('clientes'));

-- movimentações: leitura por módulo (leva I) — cada entidade só é
-- visível para quem tem o módulo correspondente liberado (ou é admin).
-- Sem policy de insert/update/delete: só as funções security definer
-- escrevem aqui.
create policy movimentacoes_leitura on public.movimentacoes
  for select to authenticated
  using (
    case entidade
      when 'calendar_events'  then has_module_permission('agenda')
      when 'rentals'          then has_module_permission('agenda')
      when 'mentoring_events' then has_module_permission('agenda')
      when 'clients'          then has_module_permission('clientes')
      when 'tasks'            then has_module_permission('clientes')
      when 'transactions'     then has_module_permission('financeiro')
      else has_module_permission('configuracoes')
    end
  );

comment on policy movimentacoes_leitura on public.movimentacoes is
  'Leitura por módulo (leva I): cada entidade só é visível para quem tem o módulo correspondente liberado (ou é admin, que passa em qualquer módulo).';

grant select on public.movimentacoes to authenticated;

-- ============================================================
-- MODO TESTE: infraestrutura de suporte
-- ============================================================

-- Guarda de admin, reaproveitada por várias funções abaixo.
create or replace function public.require_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin
  ) then
    raise exception 'Apenas administradores podem executar esta ação.';
  end if;
end;
$$;

-- Herança automática da chave geral (settings.test_mode): se quem
-- inseriu não disse nada sobre is_test, o registro herda o estado da
-- chave geral. Se alguém pediu is_test = true explicitamente, respeita.
-- Faz o modo teste pegar também nos registros criados em cascata pelas
-- funções create_rental, update_rental e finalize_rental_reservation,
-- sem precisar mexer em nenhuma delas.
create or replace function public.apply_test_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_test is not true then
    new.is_test := coalesce((select s.test_mode from public.settings s limit 1), false);
  end if;
  return new;
end;
$$;

create trigger clients_apply_test_mode
  before insert on public.clients
  for each row execute function public.apply_test_mode();
create trigger transactions_apply_test_mode
  before insert on public.transactions
  for each row execute function public.apply_test_mode();
create trigger rentals_apply_test_mode
  before insert on public.rentals
  for each row execute function public.apply_test_mode();
create trigger calendar_events_apply_test_mode
  before insert on public.calendar_events
  for each row execute function public.apply_test_mode();
create trigger mentoring_events_apply_test_mode
  before insert on public.mentoring_events
  for each row execute function public.apply_test_mode();
create trigger tasks_apply_test_mode
  before insert on public.tasks
  for each row execute function public.apply_test_mode();

create index clients_is_test_idx          on public.clients(id)          where is_test;
create index transactions_is_test_idx     on public.transactions(id)     where is_test;
create index rentals_is_test_idx          on public.rentals(id)          where is_test;
create index calendar_events_is_test_idx  on public.calendar_events(id)  where is_test;
create index mentoring_events_is_test_idx on public.mentoring_events(id) where is_test;
create index tasks_is_test_idx            on public.tasks(id)            where is_test;

-- ------------------------------------------------------------
-- RENTAL_PAYMENTS (leva O): um pagamento por linha. Uma locação pode ter
-- várias (parcelas, formas diferentes, ou pagamento parcial em aberto).
-- rentals.pago/pago_em são recalculados automaticamente a partir daqui
-- (ver recalcular_pagamento_locacao e o trigger rental_payments_recalcula,
-- na seção de pagamentos múltiplos/parciais) — nunca setados manualmente
-- por fora. Criada só aqui, depois de apply_test_mode existir, porque o
-- trigger de modo teste da tabela depende dela.
-- ------------------------------------------------------------
create table public.rental_payments (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  forma payment_method_type not null,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  -- Só preenchido quando forma = 'pix': em qual conta o dinheiro caiu.
  -- Lista fechada de propósito (são as três contas reais do negócio);
  -- se um dia entrar uma quarta conta, é uma migration de uma linha.
  pix_conta text,
  transaction_id uuid references public.transactions(id) on delete cascade,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  is_test boolean not null default false,
  check (pix_conta is null or pix_conta in ('eder', 'harmonize', 'laser_dream')),
  check ((forma = 'pix' and pix_conta is not null) or (forma <> 'pix' and pix_conta is null))
);

comment on table public.rental_payments is
  'Pagamentos de uma locação, um por linha (permite dividir entre PIX e dinheiro, ou registrar parcial). rentals.pago/pago_em são recalculados automaticamente sempre que uma linha daqui muda (ver trigger rental_payments_recalcula), somando estes valores e descontando o crédito de taxa de reserva já paga.';
comment on column public.rental_payments.pix_conta is
  'eder = Eder Campos de Almeida, harmonize = Harmonize Bella Prime LTDA, laser_dream = Laser Dream Campina Grande LTDA. Obrigatório quando forma = pix, e só faz sentido nesse caso.';
comment on column public.rental_payments.transaction_id is
  'Lançamento no caixa gerado por este pagamento. on delete cascade: se o lançamento for apagado por qualquer caminho (inclusive a cascata de exclusão da locação), este registro de pagamento some junto, para nunca sobrar pagamento órfão sem lançamento.';

create index rental_payments_rental_id_idx on public.rental_payments(rental_id);

alter table public.rental_payments enable row level security;

create policy "rental_payments_select" on rental_payments for select using (has_module_permission('financeiro'));
create policy "rental_payments_insert" on rental_payments for insert with check (has_module_permission('financeiro'));
create policy "rental_payments_update" on rental_payments for update
  using (has_module_permission('financeiro'))
  with check (has_module_permission('financeiro'));
-- Sem policy de delete (mesmo padrão das demais tabelas financeiras):
-- remover um pagamento é só pelo caminho de remover_pagamento_locacao
-- (security definer).

create trigger rental_payments_apply_test_mode
  before insert on public.rental_payments
  for each row execute function public.apply_test_mode();

-- Converter um registro: teste <-> real. Lista branca de tabelas evita
-- que o nome vindo da tela vire porta de injeção de SQL no format().
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

  if p_table not in ('clients','transactions','rentals','calendar_events','mentoring_events','tasks') then
    raise exception 'Tabela não permitida: %', p_table;
  end if;

  execute format('update public.%I set is_test = $1 where id = $2', p_table)
    using p_is_test, p_id;
end;
$$;

-- Converter um cliente e tudo que está pendurado nele.
create or replace function public.set_client_test_flag_cascade(
  p_client_id uuid,
  p_is_test boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transactions int;
  v_rentals int;
  v_events int;
  v_tasks int;
  v_mentoring int;
  v_rental_payments int;
begin
  perform public.require_admin();

  update public.clients set is_test = p_is_test where id = p_client_id;

  with u as (update public.transactions set is_test = p_is_test where client_id = p_client_id returning 1)
    select count(*) into v_transactions from u;
  with u as (update public.rentals set is_test = p_is_test where client_id = p_client_id returning 1)
    select count(*) into v_rentals from u;
  with u as (update public.calendar_events set is_test = p_is_test where client_id = p_client_id returning 1)
    select count(*) into v_events from u;
  with u as (update public.tasks set is_test = p_is_test where client_id = p_client_id returning 1)
    select count(*) into v_tasks from u;
  -- rental_payments não tem client_id direto: chega pela locação do cliente.
  with u as (
    update public.rental_payments set is_test = p_is_test
    where rental_id in (select id from public.rentals where client_id = p_client_id)
    returning 1
  )
    select count(*) into v_rental_payments from u;

  -- Mentorias não têm client_id: chegam pelo evento de agenda do cliente.
  with u as (
    update public.mentoring_events m set is_test = p_is_test
    where exists (
      select 1 from public.calendar_events e
      where e.id = m.calendar_event_id and e.client_id = p_client_id
    )
    returning 1
  )
  select count(*) into v_mentoring from u;

  return jsonb_build_object(
    'transactions',     v_transactions,
    'rentals',          v_rentals,
    'calendar_events',  v_events,
    'tasks',            v_tasks,
    'mentoring_events', v_mentoring,
    'rental_payments',  v_rental_payments
  );
end;
$$;create or replace function public.count_test_data()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'clients',          (select count(*) from public.clients          where is_test),
    'transactions',     (select count(*) from public.transactions     where is_test),
    'rentals',          (select count(*) from public.rentals          where is_test),
    'calendar_events',  (select count(*) from public.calendar_events  where is_test),
    'mentoring_events', (select count(*) from public.mentoring_events where is_test),
    'tasks',            (select count(*) from public.tasks            where is_test),
    'rental_payments',  (select count(*) from public.rental_payments  where is_test)
  );
$$;
