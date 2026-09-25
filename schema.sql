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

-- ============================================================
-- HISTÓRICO / AUDITORIA: funções de apoio
-- ============================================================

-- Dinheiro no formato brasileiro. O to_char do Postgres usa os
-- separadores do locale do servidor (americano no Supabase), então a
-- troca abaixo inverte ponto e vírgula com um marcador temporário.
create or replace function public.formatar_reais(p_valor numeric)
returns text
language sql
immutable
as $$
  select 'R$ ' || replace(replace(replace(
           to_char(coalesce(p_valor, 0), 'FM999,999,990.00'),
           ',', '#'), '.', ','), '#', '.');
$$;

-- Escreve no histórico. usuario_nome é resolvido e gravado na hora, não
-- por referência, para o histórico continuar legível mesmo depois que o
-- perfil for removido.
create or replace function public.registrar_movimentacao(
  p_acao text,
  p_entidade text,
  p_entidade_id uuid,
  p_descricao text,
  p_detalhes jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  select name into v_nome from public.profiles where id = auth.uid();

  insert into public.movimentacoes (
    usuario_id, usuario_nome, acao, entidade, entidade_id, descricao, detalhes
  )
  values (
    auth.uid(),
    coalesce(nullif(trim(v_nome), ''), 'Usuário desconhecido'),
    p_acao,
    p_entidade,
    p_entidade_id,
    p_descricao,
    coalesce(p_detalhes, '{}'::jsonb)
  );
end;
$$;

-- Descreve um registro em uma linha legível, usada para o histórico
-- continuar fazendo sentido depois que o registro descrito não existe mais.
create or replace function public.descrever_registro(
  p_table text,
  p_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_texto text;
begin
  if p_table = 'rentals' then
    select 'Locação ' || coalesce(e.name, 'equipamento') ||
           ' de ' || coalesce(c.name, 'cliente') ||
           ' em ' || to_char(r.event_date, 'DD/MM/YYYY') ||
           ', ' || public.formatar_reais(r.calculated_value) ||
           ' (' || r.shots || ' disparos)'
      into v_texto
      from rentals r
      left join clients c on c.id = r.client_id
      left join equipments e on e.id = r.equipment_id
     where r.id = p_id;

  elsif p_table = 'transactions' then
    select 'Lançamento ' || t.type || ' "' || coalesce(t.description, 'sem descrição') || '"' ||
           ', ' || public.formatar_reais(t.amount) ||
           ' em ' || to_char(t.date, 'DD/MM/YYYY')
      into v_texto
      from transactions t
     where t.id = p_id;

  elsif p_table = 'calendar_events' then
    select 'Evento "' || coalesce(ev.title, 'sem título') || '"' ||
           coalesce(' de ' || c.name, '') ||
           ' em ' || to_char(ev.date_start, 'DD/MM/YYYY')
      into v_texto
      from calendar_events ev
      left join clients c on c.id = ev.client_id
     where ev.id = p_id;

  elsif p_table = 'clients' then
    select 'Cliente ' || coalesce(c.name, 'sem nome') ||
           coalesce(' (' || c.clinic_name || ')', '')
      into v_texto
      from clients c
     where c.id = p_id;

  elsif p_table = 'tasks' then
    select 'Tarefa "' || coalesce(tk.title, 'sem título') || '"' ||
           coalesce(' de ' || c.name, '')
      into v_texto
      from tasks tk
      left join clients c on c.id = tk.client_id
     where tk.id = p_id;

  elsif p_table = 'mentoring_events' then
    select 'Mentoria de ' || coalesce(m.mentee_name, 'sem nome') ||
           ' em ' || to_char(m.date, 'DD/MM/YYYY') ||
           ', ' || public.formatar_reais(m.value)
      into v_texto
      from mentoring_events m
     where m.id = p_id;
  end if;

  return coalesce(v_texto, p_table || ' ' || coalesce(p_id::text, '?'));
end;
$$;

-- Prevê o que uma exclusão vai levar junto, incluindo taxa de
-- compromisso (que vive num lançamento sem rental_id, de propósito —
-- ver comentário da própria função na migration leva-c3a).
create or replace function public.preview_exclusao(
  p_table text,
  p_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_mentoria_id uuid;
  v_evento_taxa uuid;
  v_locacoes int := 0;
  v_lancamentos int := 0;
  v_eventos int := 0;
  v_tarefas int := 0;
  v_taxas int := 0;
  v_valor_taxas numeric := 0;
  v_valor_locacoes numeric := 0;
  v_valor_lancamentos numeric := 0;
  v_itens text[] := '{}';
  v_aviso text := null;
  v_alvo text;
begin
  perform public.require_admin();

  v_alvo := public.descrever_registro(p_table, p_id);

  if p_table = 'rentals' then
    v_locacoes := 1;
    select coalesce(calculated_value, 0) into v_valor_locacoes
      from rentals where id = p_id;
    select count(*), coalesce(sum(amount), 0) into v_lancamentos, v_valor_lancamentos
      from transactions where rental_id = p_id;
    select count(*) into v_eventos from calendar_events where rental_id = p_id;
    select count(*), coalesce(sum(t.amount), 0) into v_taxas, v_valor_taxas
      from calendar_events ev
      join transactions t on t.id = ev.taxa_transaction_id
     where ev.rental_id = p_id;

  elsif p_table = 'transactions' then
    select rental_id, mentoring_id into v_rental_id, v_mentoria_id
      from transactions where id = p_id;

    if v_rental_id is not null then
      return public.preview_exclusao('rentals', v_rental_id)
             || jsonb_build_object('aviso',
                'Este lançamento pertence a uma locação. Apagar vai apagar a locação inteira, junto com o evento da agenda.');
    elsif v_mentoria_id is not null then
      return public.preview_exclusao('mentoring_events', v_mentoria_id)
             || jsonb_build_object('aviso',
                'Este lançamento pertence a uma mentoria. Apagar vai apagar a mentoria inteira.');
    end if;

    select id into v_evento_taxa from calendar_events where taxa_transaction_id = p_id limit 1;

    v_lancamentos := 1;
    select coalesce(amount, 0) into v_valor_lancamentos from transactions where id = p_id;

    if v_evento_taxa is not null then
      v_aviso := 'Este lançamento é a taxa de compromisso de um agendamento. Apagar vai deixar a taxa daquele agendamento como pendente de novo.';
    end if;

  elsif p_table = 'calendar_events' then
    select rental_id, mentoring_id into v_rental_id, v_mentoria_id
      from calendar_events where id = p_id;

    if v_rental_id is not null then
      return public.preview_exclusao('rentals', v_rental_id)
             || jsonb_build_object('aviso',
                'Este evento pertence a uma locação. Apagar vai apagar a locação inteira, junto com o lançamento financeiro.');
    elsif v_mentoria_id is not null then
      return public.preview_exclusao('mentoring_events', v_mentoria_id)
             || jsonb_build_object('aviso',
                'Este evento pertence a uma mentoria. Apagar vai apagar a mentoria inteira.');
    end if;

    v_eventos := 1;
    select count(*), coalesce(sum(t.amount), 0) into v_taxas, v_valor_taxas
      from calendar_events ev
      join transactions t on t.id = ev.taxa_transaction_id
     where ev.id = p_id;

  elsif p_table = 'mentoring_events' then
    select count(*), coalesce(sum(amount), 0) into v_lancamentos, v_valor_lancamentos
      from transactions
     where mentoring_id = p_id
        or id = (select transaction_id from mentoring_events where id = p_id);
    select count(*) into v_eventos
      from calendar_events
     where mentoring_id = p_id
        or id = (select calendar_event_id from mentoring_events where id = p_id);

  elsif p_table = 'clients' then
    select count(*), coalesce(sum(calculated_value), 0) into v_locacoes, v_valor_locacoes
      from rentals where client_id = p_id;
    select count(*) into v_eventos from calendar_events where client_id = p_id;
    select count(*) into v_tarefas from tasks where client_id = p_id;
    select count(*), coalesce(sum(amount), 0) into v_lancamentos, v_valor_lancamentos
      from transactions
     where client_id = p_id
        or rental_id in (select id from rentals where client_id = p_id);
    select count(*), coalesce(sum(t.amount), 0) into v_taxas, v_valor_taxas
      from calendar_events ev
      join transactions t on t.id = ev.taxa_transaction_id
     where ev.client_id = p_id
       and coalesce(t.client_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_id
       and t.rental_id is null;

  elsif p_table = 'tasks' then
    v_tarefas := 1;

  else
    raise exception 'Tabela não permitida: %', p_table;
  end if;

  v_lancamentos := v_lancamentos + coalesce(v_taxas, 0);
  v_valor_lancamentos := coalesce(v_valor_lancamentos, 0) + coalesce(v_valor_taxas, 0);

  if v_locacoes > 0 then
    v_itens := v_itens || (v_locacoes || (case when v_locacoes = 1 then ' locação' else ' locações' end));
  end if;
  if v_eventos > 0 then
    v_itens := v_itens || (v_eventos || (case when v_eventos = 1 then ' evento da agenda' else ' eventos da agenda' end));
  end if;
  if v_lancamentos > 0 then
    v_itens := v_itens || (v_lancamentos || (case when v_lancamentos = 1 then ' lançamento financeiro' else ' lançamentos financeiros' end));
  end if;
  if v_taxas > 0 then
    v_itens := v_itens || ('incluindo ' || public.formatar_reais(v_valor_taxas) || ' de taxa de compromisso');
  end if;
  if v_tarefas > 0 then
    v_itens := v_itens || (v_tarefas || (case when v_tarefas = 1 then ' tarefa' else ' tarefas' end));
  end if;

  return jsonb_build_object(
    'tabela', p_table,
    'id', p_id,
    'alvo', v_alvo,
    'locacoes', v_locacoes,
    'eventos', v_eventos,
    'lancamentos', v_lancamentos,
    'tarefas', v_tarefas,
    'taxas', v_taxas,
    'valor_taxas', round(coalesce(v_valor_taxas, 0), 2),
    'valor_locacoes', round(coalesce(v_valor_locacoes, 0), 2),
    'valor_lancamentos', round(coalesce(v_valor_lancamentos, 0), 2),
    'itens', to_jsonb(v_itens),
    'aviso', v_aviso
  );
end;
$$;

grant execute on function public.preview_exclusao to authenticated;
-- Cascata de uma locação: quebra os ciclos de chave estrangeira (com a
-- transação, com a taxa) antes de apagar, na ordem que o banco permite.
create or replace function public.excluir_locacao_cascata(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taxas uuid[];
begin
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

-- Cascata de uma mentoria.
create or replace function public.excluir_mentoria_cascata(p_mentoria_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento_id uuid;
  v_transacao_id uuid;
begin
  select calendar_event_id, transaction_id into v_evento_id, v_transacao_id
    from mentoring_events where id = p_mentoria_id;

  update mentoring_events set calendar_event_id = null, transaction_id = null
   where id = p_mentoria_id;
  update calendar_events set mentoring_id = null where mentoring_id = p_mentoria_id;
  update transactions    set mentoring_id = null where mentoring_id = p_mentoria_id;

  delete from calendar_events where id = v_evento_id;
  delete from transactions    where id = v_transacao_id;
  delete from mentoring_events where id = p_mentoria_id;
end;
$$;

-- A exclusão em si: cascata real, só admin, com registro no histórico.
-- Trata a taxa de compromisso nos três casos em que ela pode aparecer:
-- apagar o lançamento dela sozinho (volta a pendente), apagar o
-- agendamento (o lançamento vai junto), ou apagar o cliente (idem, em
-- lote).
create or replace function public.delete_record_forever(
  p_table text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_descricao text;
  v_detalhes jsonb;
  v_rental_id uuid;
  v_mentoria_id uuid;
  v_evento_taxa uuid;
  v_taxas uuid[];
begin
  perform public.require_admin();

  v_descricao := public.descrever_registro(p_table, p_id);
  v_detalhes  := public.preview_exclusao(p_table, p_id);

  if p_table = 'rentals' then
    perform public.excluir_locacao_cascata(p_id);

  elsif p_table = 'transactions' then
    select rental_id, mentoring_id into v_rental_id, v_mentoria_id
      from transactions where id = p_id;

    if v_rental_id is not null then
      perform public.excluir_locacao_cascata(v_rental_id);
    elsif v_mentoria_id is not null then
      perform public.excluir_mentoria_cascata(v_mentoria_id);
    else
      select id into v_evento_taxa from calendar_events where taxa_transaction_id = p_id limit 1;
      if v_evento_taxa is not null then
        update calendar_events
           set taxa_transaction_id = null,
               taxa_status = 'pendente',
               taxa_valor = coalesce(taxa_valor, public.valor_taxa_atual())
         where id = v_evento_taxa;
      end if;

      update rentals          set transaction_id = null where transaction_id = p_id;
      update mentoring_events set transaction_id = null where transaction_id = p_id;
      delete from transactions where id = p_id;
    end if;

  elsif p_table = 'calendar_events' then
    select rental_id, mentoring_id into v_rental_id, v_mentoria_id
      from calendar_events where id = p_id;

    if v_rental_id is not null then
      perform public.excluir_locacao_cascata(v_rental_id);
    elsif v_mentoria_id is not null then
      perform public.excluir_mentoria_cascata(v_mentoria_id);
    else
      update mentoring_events set calendar_event_id = null where calendar_event_id = p_id;
      select taxa_transaction_id into v_evento_taxa from calendar_events where id = p_id;
      update calendar_events set taxa_transaction_id = null where id = p_id;
      delete from calendar_events where id = p_id;
      if v_evento_taxa is not null then
        delete from transactions where id = v_evento_taxa;
      end if;
    end if;

  elsif p_table = 'mentoring_events' then
    perform public.excluir_mentoria_cascata(p_id);

  elsif p_table = 'tasks' then
    delete from tasks where id = p_id;

  elsif p_table = 'clients' then
    update rentals set transaction_id = null where client_id = p_id;

    update mentoring_events set calendar_event_id = null
     where calendar_event_id in (select id from calendar_events where client_id = p_id);
    update mentoring_events set transaction_id = null
     where transaction_id in (
       select id from transactions
        where client_id = p_id
           or rental_id in (select id from rentals where client_id = p_id)
     );

    select array_agg(taxa_transaction_id) into v_taxas
      from calendar_events
     where client_id = p_id and taxa_transaction_id is not null;

    update calendar_events set taxa_transaction_id = null where client_id = p_id;

    delete from calendar_events where client_id = p_id;
    delete from transactions
     where client_id = p_id
        or rental_id in (select id from rentals where client_id = p_id)
        or id = any(coalesce(v_taxas, '{}'::uuid[]));
    delete from rentals     where client_id = p_id;
    delete from client_tags where client_id = p_id;
    delete from tasks       where client_id = p_id;
    delete from clients     where id = p_id;

  else
    raise exception 'Tabela não permitida: %', p_table;
  end if;

  perform public.registrar_movimentacao(
    'excluido', p_table, p_id, v_descricao, v_detalhes
  );
end;
$$;

-- ============================================================
-- CICLO DE STATUS DO AGENDAMENTO
-- ============================================================
create or replace function public.confirmar_agendamento(
  p_event_id uuid,
  p_confirmado boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status event_status_type;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar agendamentos.';
  end if;

  select status into v_status from calendar_events where id = p_event_id;

  if v_status is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento está cancelado. Reative-o antes de confirmar.';
  end if;

  update calendar_events set confirmed = p_confirmado where id = p_event_id;

  perform public.registrar_movimentacao(
    case when p_confirmado then 'confirmado' else 'desconfirmado' end,
    'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.confirmar_agendamento to authenticated;

-- Reagendar: tira da data antiga e põe na nova. Move a locação vinculada
-- junto (e o lançamento financeiro, se existir), para agenda e
-- financeiro não divergirem. A checagem amigável roda antes da
-- constraint de exclusão (rede de segurança final), para a mensagem
-- dizer de quem é a data em vez do código cru do Postgres.
create or replace function public.reagendar_agendamento(
  p_event_id uuid,
  p_nova_data date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data_antiga date;
  v_equipment_id uuid;
  v_rental_id uuid;
  v_status event_status_type;
  v_ocupante text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para reagendar.';
  end if;

  select date_start, equipment_id, rental_id, status
    into v_data_antiga, v_equipment_id, v_rental_id, v_status
    from calendar_events where id = p_event_id;

  if v_data_antiga is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento está cancelado e não pode ser reagendado.';
  end if;
  if p_nova_data = v_data_antiga then
    raise exception 'A data nova é igual à atual.';
  end if;

  if v_equipment_id is not null then
    select coalesce(c.name, ev.title) into v_ocupante
      from calendar_events ev
      left join clients c on c.id = ev.client_id
     where ev.equipment_id = v_equipment_id
       and ev.status <> 'cancelada'
       and ev.id <> p_event_id
       and daterange(ev.date_start, ev.date_end, '[]') && daterange(p_nova_data, p_nova_data, '[]')
     limit 1;

    if v_ocupante is not null then
      raise exception 'O equipamento já está reservado em % para %.',
        to_char(p_nova_data, 'DD/MM/YYYY'), v_ocupante;
    end if;
  end if;

  update calendar_events
     set date_start = p_nova_data,
         date_end   = p_nova_data
   where id = p_event_id;

  if v_rental_id is not null then
    update rentals
       set event_date = p_nova_data,
           rescheduled = true
     where id = v_rental_id;

    update transactions
       set date = p_nova_data
     where rental_id = v_rental_id;
  end if;

  perform public.registrar_movimentacao(
    'reagendado', 'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object(
      'data_antiga', to_char(v_data_antiga, 'DD/MM/YYYY'),
      'data_nova',   to_char(p_nova_data, 'DD/MM/YYYY')
    )
  );

exception
  when exclusion_violation then
    raise exception 'O equipamento já está reservado em %.', to_char(p_nova_data, 'DD/MM/YYYY');
end;
$$;

grant execute on function public.reagendar_agendamento to authenticated;

-- Marcar como realizado (o procedimento aconteceu) e desfazer. Não diz
-- nada sobre pagamento — ver marcar_locacao_paga/rentals.pago, é essa a
-- separação que permite uma locação ficar "a receber".
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

  if p_realizada and v_data > current_date then
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

grant execute on function public.marcar_realizada to authenticated;

-- Cancelar um agendamento. Recusa se a locação vinculada já foi paga
-- (desfaça o pagamento antes, para o caixa não ficar com receita de
-- algo cancelado). Taxa paga vira perdida: o valor fica com a casa e
-- não gera crédito. Guarda o status de antes do cancelamento dentro do
-- próprio registro de movimentação (status_anterior), para
-- reativar_agendamento saber para onde voltar (leva E parte 2).
create or replace function public.cancelar_agendamento(
  p_event_id uuid,
  p_motivo text default null
)
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
  end if;

  v_descricao := public.descrever_registro('calendar_events', p_event_id);

  update calendar_events set status = 'cancelada' where id = p_event_id;
  if v_rental_id is not null then
    update rentals set status = 'cancelada' where id = v_rental_id;
  end if;

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
      'taxa', coalesce(v_taxa, 'nao_aplica'),
      'status_anterior', v_status
    )
  );
end;
$$;

grant execute on function public.cancelar_agendamento to authenticated;

-- Reativar um agendamento cancelado. Devolve o status de antes do
-- cancelamento (lido da movimentação mais recente, leva E parte 2) em
-- vez de sempre 'confirmada' — um agendamento já realizado que foi
-- cancelado por engano volta a 'realizada', não regride no tempo. Só
-- devolve a taxa perdida para paga se o lançamento dela ainda existir.
create or replace function public.reativar_agendamento(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_equipment_id uuid;
  v_data date;
  v_ocupante text;
  v_taxa text;
  v_taxa_transacao uuid;
  v_status_anterior event_status_type;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para reativar agendamentos.';
  end if;

  select rental_id, equipment_id, date_start, taxa_status, taxa_transaction_id
    into v_rental_id, v_equipment_id, v_data, v_taxa, v_taxa_transacao
    from calendar_events where id = p_event_id and status = 'cancelada';

  if v_data is null then
    raise exception 'Agendamento não encontrado ou não está cancelado.';
  end if;

  if v_equipment_id is not null then
    select coalesce(c.name, ev.title) into v_ocupante
      from calendar_events ev
      left join clients c on c.id = ev.client_id
     where ev.equipment_id = v_equipment_id
       and ev.status <> 'cancelada'
       and ev.id <> p_event_id
       and daterange(ev.date_start, ev.date_end, '[]') && daterange(v_data, v_data, '[]')
     limit 1;

    if v_ocupante is not null then
      raise exception 'Não dá para reativar: o equipamento já foi reservado em % para %. Reagende para outra data.',
        to_char(v_data, 'DD/MM/YYYY'), v_ocupante;
    end if;
  end if;

  select (detalhes->>'status_anterior')::event_status_type
    into v_status_anterior
    from movimentacoes
   where entidade = 'calendar_events' and entidade_id = p_event_id and acao = 'cancelado'
   order by ocorrido_em desc
   limit 1;

  if v_status_anterior is null or v_status_anterior = 'cancelada' then
    v_status_anterior := 'confirmada';
  end if;

  update calendar_events set status = v_status_anterior, confirmed = false where id = p_event_id;
  if v_rental_id is not null then
    update rentals set status = v_status_anterior where id = v_rental_id;
  end if;

  if v_taxa = 'perdida' and v_taxa_transacao is not null then
    update calendar_events set taxa_status = 'paga' where id = p_event_id;
    perform public.registrar_movimentacao(
      'taxa_paga', 'calendar_events', p_event_id,
      public.descrever_registro('calendar_events', p_event_id),
      jsonb_build_object('motivo', 'agendamento reativado; a taxa paga volta a valer como crédito')
    );
  end if;

  -- Leva O: taxa que voltou a valer como crédito muda o saldo da locação.
  if v_rental_id is not null then
    perform public.recalcular_pagamento_locacao(v_rental_id);
  end if;

  perform public.registrar_movimentacao(
    'editado', 'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('acao_detalhada', 'agendamento reativado', 'status_restaurado', v_status_anterior)
  );
end;
$$;

grant execute on function public.reativar_agendamento to authenticated;

-- Agendamentos de um cliente, para a ficha do lead: tudo que a tela
-- precisa para desenhar os botões, numa função só.
create or replace function public.agendamentos_do_cliente(p_client_id uuid)
returns table (
  event_id uuid,
  rental_id uuid,
  equipamento text,
  data date,
  status text,
  confirmado boolean,
  valor numeric,
  disparos integer,
  situacao text,
  taxa_status text,
  taxa_valor numeric,
  pago boolean,
  pago_em date
)
language sql
stable
security definer
set search_path = public
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
    r.pago_em
  from calendar_events ev
  left join equipments eq on eq.id = ev.equipment_id
  left join rentals r on r.id = ev.rental_id
  where ev.client_id = p_client_id
  order by ev.date_start desc;
$$;

grant execute on function public.agendamentos_do_cliente to authenticated;

-- ============================================================
-- TAXA DE COMPROMISSO
-- ============================================================

-- Valor da taxa configurado (settings.reservation_fee, com fallback).
create or replace function public.valor_taxa_atual()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select reservation_fee from settings where id = true), 250.00);
$$;

-- Definir a taxa de um agendamento. Marcar como paga cria o lançamento
-- da taxa. Voltar para pendente ou nao_aplica apaga esse lançamento,
-- porque dinheiro que não entrou não pode ficar no caixa. Perdida
-- mantém o lançamento de propósito: o cliente pagou, cancelou, e o
-- valor é seu.
create or replace function public.definir_taxa_agendamento(
  p_event_id uuid,
  p_status text,
  p_payment_method payment_method_type default 'pix'
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
  v_data date;
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
    into v_status_atual, v_transacao_id, v_client_id, v_data, v_client_name, v_rental_id
    from calendar_events ev
    left join clients c on c.id = ev.client_id
   where ev.id = p_event_id;

  if v_data is null then
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
      v_valor, p_payment_method, v_data, 'harmonize', v_client_id, auth.uid()
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

  -- Leva O: crédito de taxa mudou, o saldo da locação (se houver) precisa
  -- ser recalculado — pago/pago_em nunca são setados direto por fora daqui.
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
    jsonb_build_object('taxa_status', p_status, 'taxa_valor', v_valor)
  );
end;
$$;

grant execute on function public.definir_taxa_agendamento to authenticated;

-- ============================================================
-- PAGAMENTOS MÚLTIPLOS/PARCIAIS (leva O)
--
-- Antes, "pago" era um interruptor que cada função ligava/desligava na
-- mão. Isso quebrava assim que existisse mais de um pagamento por
-- locação (parcelas, formas diferentes), e também não reagia se a taxa
-- de reserva fosse marcada paga DEPOIS da locação já estar quitada.
-- Agora cada pagamento de uma locação é uma linha própria em
-- rental_payments (ver tabela, logo após "rentals"), e rentals.pago/
-- pago_em são só a FOTO do que a soma dessas linhas diz — recalculada
-- por recalcular_pagamento_locacao() sempre que rental_payments muda
-- (trigger) ou que o crédito de taxa muda (definir_taxa_agendamento,
-- cancelar_agendamento, reativar_agendamento, acima). Nunca setados
-- diretamente por fora dela.
-- ============================================================
create or replace function public.recalcular_pagamento_locacao(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric;
  v_credito numeric;
  v_pago_total numeric;
  v_saldo numeric;
  v_ultima_data date;
begin
  select calculated_value into v_valor from rentals where id = p_rental_id;
  if v_valor is null then
    return; -- locação já não existe mais (apagada em cascata); nada a fazer.
  end if;

  select coalesce(sum(ev.taxa_valor), 0) into v_credito
    from calendar_events ev
   where ev.rental_id = p_rental_id and ev.taxa_status = 'paga';

  select coalesce(sum(valor), 0), max(data) into v_pago_total, v_ultima_data
    from rental_payments where rental_id = p_rental_id;

  v_saldo := round(v_valor - v_credito - v_pago_total, 2);

  update rentals
     set pago = (v_saldo <= 0),
         pago_em = case when v_saldo <= 0 then v_ultima_data else null end
   where id = p_rental_id;
end;
$$;

comment on function public.recalcular_pagamento_locacao(uuid) is
  'Recalcula rentals.pago/pago_em a partir da soma de rental_payments menos o crédito de taxa de reserva já paga. Uso interno (trigger de rental_payments e funções que mudam o crédito de taxa) — nunca exposta ao app.';

create or replace function public.trg_recalcular_pagamento_locacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalcular_pagamento_locacao(coalesce(new.rental_id, old.rental_id));
  return coalesce(new, old);
end;
$$;

create trigger rental_payments_recalcula
  after insert or update or delete on public.rental_payments
  for each row execute function public.trg_recalcular_pagamento_locacao();

-- Situação de pagamento (aberto/parcial/pago) e saldo, para a tela ler
-- pronto em vez de recalcular na mão.
create or replace view public.rentals_situacao_pagamento
with (security_invoker = true) as
select
  r.id as rental_id,
  r.calculated_value,
  coalesce((
    select sum(ev.taxa_valor) from calendar_events ev
     where ev.rental_id = r.id and ev.taxa_status = 'paga'
  ), 0) as credito_taxa,
  coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0) as total_pago,
  greatest(
    r.calculated_value
      - coalesce((select sum(ev.taxa_valor) from calendar_events ev where ev.rental_id = r.id and ev.taxa_status = 'paga'), 0)
      - coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0),
    0
  ) as saldo,
  case
    when coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0) = 0 then 'aberto'
    when r.pago then 'pago'
    else 'parcial'
  end as situacao
from rentals r;

comment on view public.rentals_situacao_pagamento is
  'Situação de pagamento de cada locação (aberto/parcial/pago) e o saldo, já descontando o crédito de taxa de reserva paga. security_invoker=true: mantém a RLS de rentals para quem consulta.';

grant select on public.rentals_situacao_pagamento to authenticated;

-- Registrar UM pagamento (parcial ou não). Chamar de novo para dividir
-- entre formas (ex: parte em dinheiro, parte em PIX) ou completar um
-- saldo em aberto — pago/pago_em se ajustam sozinhos pelo trigger acima.
create or replace function public.registrar_pagamento_locacao(
  p_rental_id uuid,
  p_forma payment_method_type,
  p_valor numeric,
  p_data date default current_date,
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

comment on function public.registrar_pagamento_locacao(uuid, payment_method_type, numeric, date, text, text) is
  'Registra UM pagamento de uma locação (parcial ou não). Chamar de novo para dividir entre formas ou completar um saldo em aberto — rentals.pago/pago_em se ajustam sozinhos pelo trigger de rental_payments.';

grant execute on function public.registrar_pagamento_locacao to authenticated;

create or replace function public.remover_pagamento_locacao(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_transaction_id uuid;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para alterar pagamentos.';
  end if;

  select rental_id, transaction_id into v_rental_id, v_transaction_id
    from rental_payments where id = p_payment_id;

  if v_rental_id is null then
    raise exception 'Pagamento não encontrado.';
  end if;

  -- rentals.transaction_id é só um atalho para o lançamento principal
  -- (caminho de tela única, herdado de antes desta leva); se for
  -- justamente este pagamento, zera ANTES de apagar a transação — senão
  -- a FK rentals_transaction_id_fkey barra o delete (ela não tem on
  -- delete cascade, de propósito, para nunca sumir uma transação por
  -- engano só por causa de outro caminho de exclusão).
  update rentals set transaction_id = null
   where id = v_rental_id and transaction_id = v_transaction_id;

  -- Apagar a transação já casca-deleta esta linha de rental_payments
  -- (transaction_id on delete cascade); o delete abaixo cobre o caso
  -- raro de um pagamento sem transaction_id.
  if v_transaction_id is not null then
    delete from transactions where id = v_transaction_id;
  end if;
  delete from rental_payments where id = p_payment_id;

  perform public.registrar_movimentacao(
    'pagamento_desfeito', 'rentals', v_rental_id,
    public.descrever_registro('rentals', v_rental_id),
    jsonb_build_object('pagamento_removido', p_payment_id)
  );
end;
$$;grant execute on function public.remover_pagamento_locacao to authenticated;
-- Corrigir um pagamento já lançado (valor digitado errado, forma
-- trocada, conta PIX errada...), sempre com o antes/depois gravado no
-- histórico. A tela pede a senha (ou biometria) antes de chamar isto
-- (leva da calculadora); aqui só garante a permissão de módulo e a
-- auditoria.
create or replace function public.editar_pagamento_locacao(
  p_payment_id uuid,
  p_forma payment_method_type default null,
  p_valor numeric default null,
  p_data date default null,
  p_pix_conta text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_transaction_id uuid;
  v_old jsonb;
  v_forma payment_method_type;
  v_valor numeric;
  v_data date;
  v_pix_conta text;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para editar pagamentos.';
  end if;

  select rental_id, transaction_id, forma, valor, data, pix_conta
    into v_rental_id, v_transaction_id, v_forma, v_valor, v_data, v_pix_conta
    from rental_payments where id = p_payment_id;

  if v_rental_id is null then
    raise exception 'Pagamento não encontrado.';
  end if;

  v_old := jsonb_build_object('forma', v_forma, 'valor', v_valor, 'data', v_data, 'pix_conta', v_pix_conta);

  v_forma := coalesce(p_forma, v_forma);
  v_valor := coalesce(p_valor, v_valor);
  v_data := coalesce(p_data, v_data);
  v_pix_conta := case when v_forma = 'pix' then coalesce(p_pix_conta, v_pix_conta) else null end;

  if v_valor <= 0 then
    raise exception 'O valor do pagamento precisa ser maior que zero.';
  end if;
  if v_forma = 'pix' and v_pix_conta is null then
    raise exception 'Informe em qual conta o PIX caiu.';
  end if;

  update rental_payments
     set forma = v_forma, valor = v_valor, data = v_data, pix_conta = v_pix_conta
   where id = p_payment_id;

  if v_transaction_id is not null then
    update transactions
       set amount = v_valor, payment_method = v_forma, date = v_data
     where id = v_transaction_id;
  end if;

  perform public.registrar_movimentacao(
    'editado', 'rentals', v_rental_id,
    public.descrever_registro('rentals', v_rental_id),
    jsonb_build_object(
      'acao_detalhada', 'pagamento corrigido',
      'pagamento_id', p_payment_id,
      'antes', v_old,
      'depois', jsonb_build_object('forma', v_forma, 'valor', v_valor, 'data', v_data, 'pix_conta', v_pix_conta)
    )
  );
end;
$$;

grant execute on function public.editar_pagamento_locacao to authenticated;

-- Correção genérica de QUALQUER outro lançamento (despesa, taxa,
-- lançamento avulso do Financeiro...) que não seja um pagamento de
-- locação — esses usam editar_pagamento_locacao acima, para o valor do
-- pagamento e o saldo da locação nunca desencontrarem.
create or replace function public.editar_transacao(
  p_transaction_id uuid,
  p_description text default null,
  p_amount numeric default null,
  p_payment_method payment_method_type default null,
  p_date date default null,
  p_category_id uuid default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope scope_type;
  v_created_by uuid;
  v_old jsonb;
begin
  select scope, created_by into v_scope, v_created_by from transactions where id = p_transaction_id;
  if v_scope is null then
    raise exception 'Lançamento não encontrado.';
  end if;

  if exists (select 1 from rental_payments where transaction_id = p_transaction_id) then
    raise exception 'Este lançamento é um pagamento de locação. Use a correção de pagamento, para o valor e o saldo da locação não desencontrarem.';
  end if;

  if v_scope = 'harmonize' and not has_module_permission('financeiro') then
    raise exception 'Sem permissão para editar lançamentos.';
  end if;
  if v_scope = 'pessoal' and v_created_by is distinct from auth.uid() then
    raise exception 'Sem permissão para editar este lançamento pessoal.';
  end if;
  if p_amount is not null and p_amount <= 0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;

  select to_jsonb(t) into v_old from transactions t where t.id = p_transaction_id;

  update transactions
     set description = coalesce(p_description, description),
         amount = coalesce(p_amount, amount),
         payment_method = coalesce(p_payment_method, payment_method),
         date = coalesce(p_date, date),
         category_id = coalesce(p_category_id, category_id),
         notes = coalesce(p_notes, notes)
   where id = p_transaction_id;

  perform public.registrar_movimentacao(
    'editado', 'transactions', p_transaction_id,
    public.descrever_registro('transactions', p_transaction_id),
    jsonb_build_object('antes', v_old)
  );
end;
$$;

grant execute on function public.editar_transacao to authenticated;

-- Despesa ligada a uma locação (combustível, hospedagem, alimentação,
-- insumos daquele atendimento específico). É só um atalho: grava um
-- lançamento de saída comum, com rental_id preenchido, para
-- rentals_lucro (mais abaixo) conseguir somar.
create or replace function public.registrar_despesa_locacao(
  p_rental_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_payment_method payment_method_type,
  p_date date default current_date,
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

grant execute on function public.registrar_despesa_locacao to authenticated;

-- Deslocamento e custo por disparo negociado: gravam só o que a tela já
-- calculou (arredondamento de km, cálculo do valor por disparo
-- negociado é lógica de tela, entra na leva da calculadora).
create or replace function public.definir_deslocamento_locacao(
  p_rental_id uuid,
  p_km_ida numeric,
  p_valor_deslocamento numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar locações.';
  end if;
  if p_valor_deslocamento is not null and p_valor_deslocamento < 0 then
    raise exception 'O valor de deslocamento não pode ser negativo.';
  end if;

  update rentals
     set km_ida = p_km_ida,
         valor_deslocamento = coalesce(p_valor_deslocamento, 0)
   where id = p_rental_id;

  if not found then
    raise exception 'Locação não encontrada.';
  end if;

  perform public.registrar_movimentacao(
    'editado', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object('acao_detalhada', 'deslocamento definido', 'km_ida', p_km_ida, 'valor_deslocamento', p_valor_deslocamento)
  );
end;
$$;

grant execute on function public.definir_deslocamento_locacao to authenticated;

create or replace function public.definir_custo_disparo_manual_locacao(
  p_rental_id uuid,
  p_custo_disparo_manual numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar locações.';
  end if;
  if p_custo_disparo_manual is not null and p_custo_disparo_manual <= 0 then
    raise exception 'O custo por disparo precisa ser maior que zero.';
  end if;

  update rentals set custo_disparo_manual = p_custo_disparo_manual where id = p_rental_id;

  if not found then
    raise exception 'Locação não encontrada.';
  end if;

  perform public.registrar_movimentacao(
    'editado', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object('acao_detalhada', 'custo por disparo negociado definido', 'custo_disparo_manual', p_custo_disparo_manual)
  );
end;
$$;

grant execute on function public.definir_custo_disparo_manual_locacao to authenticated;

-- Lucro por locação e por cliente: para a leva do Financeiro consumir
-- pronto, sem recalcular na tela.
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
  coalesce((select sum(t.amount) from transactions t where t.rental_id = r.id and t.type = 'saida'), 0) as total_despesas,
  r.calculated_value - coalesce((select sum(t.amount) from transactions t where t.rental_id = r.id and t.type = 'saida'), 0) as lucro_liquido
from rentals r
left join clients c on c.id = r.client_id
where r.status <> 'cancelada' and r.is_test = false;

comment on view public.rentals_lucro is
  'Lucro líquido por locação: valor cobrado menos as despesas (saídas) ligadas a ela via transactions.rental_id. Não desconta a taxa de reserva (já é abatida do valor a receber, não é despesa do atendimento). Ignora locação cancelada e teste.';

grant select on public.rentals_lucro to authenticated;

create or replace view public.clientes_lucro
with (security_invoker = true) as
select
  client_id,
  cliente,
  count(*) as locacoes,
  sum(calculated_value) as faturado,
  sum(total_pago) as recebido,
  sum(total_despesas) as despesas,
  sum(lucro_liquido) as lucro_liquido
from rentals_lucro
where client_id is not null
group by client_id, cliente;

comment on view public.clientes_lucro is
  'Resumo de lucro líquido por cliente, somando as locações não canceladas e não teste de rentals_lucro.';

grant select on public.clientes_lucro to authenticated;

-- ------------------------------------------------------------
-- COMPATIBILIDADE: marcar_locacao_paga / desfazer_pagamento_locacao
-- continuam com a MESMA assinatura e o MESMO comportamento visível
-- (marcam a locação inteira como paga de uma vez, com uma forma só),
-- porque a tela atual ainda chama exatamente isso. Por baixo, agora
-- também escrevem/apagam em rental_payments, para o histórico já
-- nascer no formato novo. Pagamento PIX feito por este caminho entra
-- com pix_conta = 'harmonize' (conta principal do negócio), já que a
-- tela atual não pergunta qual conta — a calculadora nova (próxima
-- leva) pergunta e passa a conta certa via registrar_pagamento_locacao.
-- ------------------------------------------------------------
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
    v_valor_lancamento, v_forma, coalesce(p_data, current_date), 'harmonize',
    v_client_id, p_rental_id, auth.uid()
  )
  returning id into v_transacao_id;

  insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, created_by)
  values (p_rental_id, v_forma, v_valor_lancamento, coalesce(p_data, current_date), v_pix_conta, v_transacao_id, auth.uid());

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

grant execute on function public.marcar_locacao_paga to authenticated;

-- Desfazer o pagamento: apaga o(s) lançamento(s) e volta a locação para
-- não paga. Existe porque marcar pago por engano acontece. Desfaz TODOS
-- os pagamentos desta locação (mesmo comportamento de sempre desta
-- função); para desfazer um pagamento específico dentre vários, usar
-- remover_pagamento_locacao.
create or replace function public.desfazer_pagamento_locacao(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago boolean;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para alterar pagamentos.';
  end if;

  select pago into v_pago from rentals where id = p_rental_id;
  if v_pago is null then
    raise exception 'Locação não encontrada.';
  end if;
  if not v_pago then
    raise exception 'Esta locação não está marcada como paga.';
  end if;

  -- rentals.transaction_id precisa ser zerado ANTES de apagar as
  -- transações: ele referencia uma delas, e a FK rentals_transaction_id_fkey
  -- não tem on delete cascade (de propósito — só rental_payments tem).
  update rentals set transaction_id = null where id = p_rental_id;

  delete from transactions
   where id in (select transaction_id from rental_payments where rental_id = p_rental_id and transaction_id is not null);
  delete from rental_payments where rental_id = p_rental_id;
  -- pago / pago_em voltam sozinhos a false/null: a soma zerou.

  perform public.registrar_movimentacao(
    'pagamento_desfeito', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.desfazer_pagamento_locacao to authenticated;

-- Faz a taxa de compromisso nascer pendente sozinha: evento de
-- equipamento, para data futura, de cliente que não é parceiro, nasce
-- com a taxa pendente no valor configurado — por qualquer caminho que
-- crie o evento (create_rental, "Reservar HIPRO Day", ou uma futura
-- tela), não só pelas funções que já gravam a taxa explicitamente.
-- current_date seria UTC no servidor; a comparação usa o fuso de
-- Brasília para uma reserva feita à noite não nascer sem taxa por
-- engano de fuso.
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

  if new.date_start <= (now() at time zone 'America/Sao_Paulo')::date then
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

create trigger calendar_events_definir_taxa
  before insert on public.calendar_events
  for each row execute function public.definir_taxa_ao_criar_evento();

comment on function public.definir_taxa_ao_criar_evento is
  'Faz a taxa de compromisso nascer pendente em reserva de equipamento para data futura de cliente que não é parceiro, por qualquer caminho que crie o evento.';

-- ============================================================
-- FUNÇÕES PRINCIPAIS: create_rental, update_rental,
-- finalize_rental_reservation
-- ============================================================

-- Cria a locação, a entrada financeira (se p_pago) e o evento de agenda
-- em uma única operação atômica. Se o equipamento já estiver reservado
-- no período (no_equipment_double_booking), a função inteira é revertida.
-- p_pago=false nasce sem lançamento financeiro: o dinheiro só entra
-- quando marcar_locacao_paga/registrar_pagamento_locacao for chamada
-- (locação "a receber"). p_pix_conta (leva O) é opcional e trailing —
-- quem já chama sem ele continua funcionando igual (pix cai na conta
-- 'harmonize' por padrão).
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

-- Edita uma locação já existente e mantém a transação financeira e o
-- evento de agenda vinculados em sincronia. Falha alto se o id não
-- existir (leva J), em vez de rodar até o fim sem afetar nada.
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

  update calendar_events
  set equipment_id = p_equipment_id,
      date_start = p_event_date,
      date_end = p_event_date,
      value = p_calculated_value,
      status = p_status
  where rental_id = p_rental_id;

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

-- Converte uma pré-reserva de HIPRO (evento de agenda criado sem
-- disparos, status 'pre_reserva', sem rental_id) em uma locação de
-- verdade — ou, se is_mentoria estiver marcado na própria reserva
-- (lido direto de calendar_events, não de um parâmetro), numa mentoria:
-- mesmo fluxo, mas categoria "Mentoria" em vez de "Locação" e descrição
-- do lançamento diferente. p_shots é a quantidade de disparos numa
-- locação normal, ou de pacientes modelo numa mentoria; p_calculated_value
-- já vem calculado pelo front nos dois casos. p_pix_conta (leva O) é
-- opcional e trailing, mesmo padrão de create_rental.
--
-- BUG CORRIGIDO NA LEVA O: esta função criava a transação e marcava
-- rentals.transaction_id, mas nunca marcava rentals.pago = true — a
-- locação ficava com o dinheiro já lançado no caixa, mas aparecendo
-- como "não paga" pra sempre (entrava errado em locacoes_a_receber
-- assim que "Marcar como realizada" era clicado). Agora, ao gravar
-- também em rental_payments, pago/pago_em são preenchidos sozinhos pelo
-- trigger, sem precisar de nenhuma ação extra.
-- p_pago (leva P) é opcional e trailing, depois de p_pix_conta: quem já
-- chama sem ele continua funcionando igual (nasce pago no ato, como
-- sempre foi). false nasce sem lançamento financeiro, igual create_rental
-- — o dinheiro só entra quando registrar_pagamento_locacao for chamada,
-- permitindo finalizar uma pré-reserva "a receber" ou com pagamento
-- parcial (zero, um ou vários pagamentos, mesmo caminho usado por
-- create_rental na calculadora unificada).
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
  v_is_mentoria boolean;
  v_created_by uuid := auth.uid();
  v_pix_conta text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para finalizar locações';
  end if;

  select client_id, equipment_id, date_start, is_mentoria
    into v_client_id, v_equipment_id, v_event_date, v_is_mentoria
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

  insert into rentals (client_id, equipment_id, event_date, shots, calculated_value, payment_method, notes, created_by)
  values (v_client_id, v_equipment_id, v_event_date, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by)
  returning id into v_rental_id;

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
    -- pago / pago_em: preenchidos automaticamente pelo trigger de
    -- rental_payments (ver nota da leva O sobre o bug corrigido aqui).
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

grant execute on function public.finalize_rental_reservation to authenticated;

-- ============================================================
-- FUNIL: tarefas de contato, tags automáticas, confirmação e
-- identidade do cliente
-- ============================================================

-- Ao entrar em "Tentativa de contato", cria a tarefa inicial ("já
-- entrou em contato?"), se ainda não existir uma pendente.
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
      values (new.id, 'contato_inicial', 'Fazer o primeiro contato com ' || new.name, current_date);
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_client_enter_contato
  after insert or update of stage on clients
  for each row execute function public.handle_client_enter_contato();

-- Registra a resposta de uma tarefa de contato. A etiqueta de follow-up
-- anterior é sempre limpa (leva J, item 8) antes de decidir o desfecho —
-- antes disso, respondeu ou estourar o limite deixavam a etiqueta antiga
-- grudada, porque o "return" acontecia antes da limpeza. Se não
-- respondeu, troca pela próxima e cria uma nova tarefa em 2 dias; depois
-- do Follow-up 5, move o cliente para "Nutrição" em vez de criar mais uma.
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

-- Reagendar um evento na Agenda aplica a etiqueta "Reagendamento" no
-- cliente (cobre edição direta na Agenda e locações editadas via
-- update_rental, já que as duas gravam em calendar_events).
create or replace function public.handle_calendar_event_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag_id uuid;
begin
  if new.client_id is not null and old.date_start is distinct from new.date_start then
    select id into v_tag_id from tags where name = 'Reagendamento';
    if v_tag_id is not null then
      insert into client_tags (client_id, tag_id) values (new.client_id, v_tag_id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_calendar_event_reschedule
  after update of date_start on calendar_events
  for each row execute function public.handle_calendar_event_reschedule();

-- Ao agendar uma locação HIPRO (evento de agenda com equipamento e
-- cliente vinculados), promove o cliente para a etapa "Agendado"
-- automaticamente. Não regride quem já virou "Cliente".
create or replace function public.handle_locacao_agendada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.equipment_id is not null and new.client_id is not null then
    update clients
    set stage = 'agendado'
    where id = new.client_id
      and stage not in ('agendado', 'cliente');
  end if;
  return new;
end;
$$;

create trigger trg_locacao_agendada
  after insert on calendar_events
  for each row execute function public.handle_locacao_agendada();

-- Converter para Cliente é uma via de mão única a partir daqui: mover
-- no funil não desfaz uma conversão. Fica no banco (não em cada tela
-- que grava clients.stage) porque hoje já são pelo menos três caminhos
-- de código diferentes que gravam essa coluna.
create or replace function public.marcar_is_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage = 'cliente' then
    new.is_client := true;
  elsif tg_op = 'UPDATE' then
    new.is_client := old.is_client;
  end if;
  return new;
end;
$$;

create trigger trg_clients_marcar_is_client
  before insert or update of stage on public.clients
  for each row execute function public.marcar_is_client();

-- Registra que "Pedir confirmação no WhatsApp" foi clicado para esta
-- reserva. Só grava o timestamp e o histórico — nunca toca em
-- calendar_events.confirmed. É a contraparte de confirmar_agendamento,
-- que faz o oposto.
create or replace function public.registrar_pedido_confirmacao(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status event_status_type;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar agendamentos.';
  end if;

  select status into v_status from calendar_events where id = p_event_id;
  if v_status is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento está cancelado.';
  end if;

  update calendar_events set confirmation_message_sent_at = now() where id = p_event_id;

  perform public.registrar_movimentacao(
    'pedido_confirmacao_enviado',
    'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.registrar_pedido_confirmacao to authenticated;

-- ============================================================
-- VIEWS: fonte única de valor contabilizável
--
-- Cinco telas somavam valor cada uma com um conjunto diferente de
-- filtros, e nenhuma excluía locação cancelada (leva A). As views
-- abaixo são a única fonte de valor contabilizável — as telas leem
-- delas em vez de ler as tabelas direto, e cancelar uma locação passa a
-- tirar o valor dela de todos os totais automaticamente, sem apagar
-- linha nenhuma. security_invoker=true mantém o RLS das tabelas de
-- origem valendo para quem consulta a view.
-- ============================================================

create or replace view public.rentals_contabilizaveis
with (security_invoker = true) as
select r.*
from public.rentals r
where r.status <> 'cancelada'
  and r.is_test = false
  and not exists (
    select 1 from public.clients c
    where c.id = r.client_id and c.excluir_financeiro
  );

comment on view public.rentals_contabilizaveis is
  'Locações que contam como faturamento: exclui canceladas, modo teste, e cliente marcado excluir_financeiro (leva G). Toda soma de valor de locação deve ler daqui, nunca de rentals direto. Atenção: usa select *, então ao adicionar coluna em rentals é preciso rodar este create or replace view de novo para a coluna aparecer.';

create or replace view public.transactions_contabilizaveis
with (security_invoker = true) as
select t.*
from public.transactions t
where t.is_test = false
  and (
    t.client_id is null
    or not exists (
      select 1 from public.clients c
      where c.id = t.client_id and c.excluir_financeiro
    )
  )
  and (
    t.rental_id is null
    or exists (
      select 1
      from public.rentals r
      where r.id = t.rental_id
        and r.status <> 'cancelada'
    )
  );

comment on view public.transactions_contabilizaveis is
  'Lançamentos que contam no caixa: exclui modo teste, lançamentos presos a locação cancelada, e cliente marcado excluir_financeiro (leva G). Financeiro, Dashboard e Relatórios devem ler daqui, nunca de transactions direto. Atenção: usa select *, então ao adicionar coluna em transactions é preciso rodar este create or replace view de novo.';

grant select on public.rentals_contabilizaveis to authenticated;
grant select on public.transactions_contabilizaveis to authenticated;

-- Resumo por cliente das taxas de compromisso que estão nos
-- agendamentos (leva C4). Substitui clients.reservation_fee_status, que
-- guardava uma taxa só por cliente quando cada data reservada tem a sua.
create or replace view public.clientes_taxas
with (security_invoker = true) as
select
  c.id as client_id,
  count(*) filter (where ev.taxa_status = 'pendente')            as taxas_pendentes,
  count(*) filter (where ev.taxa_status = 'paga')                as taxas_pagas,
  coalesce(sum(coalesce(ev.taxa_valor, public.valor_taxa_atual()))
           filter (where ev.taxa_status = 'pendente'), 0) as valor_pendente,
  coalesce(sum(coalesce(ev.taxa_valor, public.valor_taxa_atual()))
           filter (where ev.taxa_status = 'paga'), 0)     as valor_pago,
  min(ev.date_start) filter (where ev.taxa_status = 'pendente')  as proxima_pendente
from public.clients c
left join public.calendar_events ev
  on ev.client_id = c.id
 and ev.status <> 'cancelada'
 and ev.equipment_id is not null
group by c.id;

comment on view public.clientes_taxas is
  'Resumo por cliente das taxas de compromisso que estão nos agendamentos. Substitui clients.reservation_fee_status, que guardava uma taxa só por cliente quando cada data reservada tem a sua.';

grant select on public.clientes_taxas to authenticated;

-- Locações realizadas e ainda não pagas, já com o crédito da taxa
-- abatido — a lista de cobrança, e não entra em faturamento nenhum.
create or replace view public.locacoes_a_receber
with (security_invoker = true) as
select
  r.id,
  r.client_id,
  c.name as cliente,
  r.event_date,
  r.calculated_value,
  coalesce((
    select sum(ev.taxa_valor) from calendar_events ev
     where ev.rental_id = r.id and ev.taxa_status = 'paga'
  ), 0) as credito_taxa,
  greatest(r.calculated_value - coalesce((
    select sum(ev.taxa_valor) from calendar_events ev
     where ev.rental_id = r.id and ev.taxa_status = 'paga'
  ), 0), 0) as valor_a_receber
from rentals r
left join clients c on c.id = r.client_id
where r.status = 'realizada'
  and r.pago = false
  and r.is_test = false;

comment on view public.locacoes_a_receber is
  'Locações que aconteceram e ainda não foram pagas, já com o crédito da taxa abatido. É a lista de cobrança, e não entra em faturamento nenhum.';

grant select on public.locacoes_a_receber to authenticated;

-- ============================================================
-- ÍNDICES DE PERFORMANCE (leva J)
-- ============================================================
create index calendar_events_date_start_idx on public.calendar_events(date_start);
create index transactions_date_scope_idx on public.transactions(date, scope);
create index transactions_client_id_idx on public.transactions(client_id);
create index rentals_client_id_idx on public.rentals(client_id);
create index calendar_events_client_id_idx on public.calendar_events(client_id);
-- leva O: rental_id em transactions passa a ser consultado o tempo todo
-- (pagamentos, despesas, rentals_lucro).
create index if not exists transactions_rental_id_idx on public.transactions(rental_id);

-- ============================================================
-- BIOMETRIA (passkey/WebAuthn) — leva O
-- Só a tabela de chaves por aparelho. A verificação da assinatura na
-- hora de liberar uma edição é lógica de backend Next.js e entra na
-- leva da tela de edição — aqui é só onde a chave pública de cada
-- aparelho cadastrado fica guardada.
-- ============================================================
create table public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

comment on table public.webauthn_credentials is
  'Chaves de biometria (passkey/WebAuthn) cadastradas por aparelho, para liberar a edição de lançamentos sem digitar senha. Guarda só a chave pública de cada aparelho — nunca a biometria em si, que nunca sai do celular.';

create index webauthn_credentials_user_id_idx on public.webauthn_credentials(user_id);

alter table public.webauthn_credentials enable row level security;

create policy "webauthn_credentials_self" on webauthn_credentials for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- TAGS AUTOMÁTICAS (usadas pelo fluxo de follow-up/reagendamento)
-- ============================================================
insert into tags (name, color, is_automatic) values
  ('Follow-up 1', '#7EC8E3', true),
  ('Follow-up 2', '#7EC8E3', true),
  ('Follow-up 3', '#B8A0D0', true),
  ('Follow-up 4', '#B8A0D0', true),
  ('Follow-up 5', '#E8789A', true),
  ('Reagendamento', '#d85f83', true)
on conflict (name) do nothing;

-- ============================================================
-- Depois de criar seu usuário em Authentication > Users,
-- rode isto trocando o e-mail, para virar admin com acesso total:
-- ============================================================
-- update profiles set is_admin = true,
--   permissions = '{"dashboard":true,"financeiro":true,"clientes":true,
--     "agenda":true,"equipamentos":true,"relatorios":true,
--     "exportacao":true,"configuracoes":true}'::jsonb
-- where email = 'seu-email@exemplo.com';
