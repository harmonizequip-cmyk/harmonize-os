-- ============================================================
-- MODO TESTE
-- ============================================================
-- Permite usar o sistema de verdade enquanto se testa, sem sujar
-- relatório. Três peças:
--
--   1. settings.test_mode  -> a chave geral, ligada/desligada em
--      Configurações. Enquanto ligada, tudo que for criado nasce
--      marcado como teste, inclusive o que o sistema cria em cascata
--      (uma locação cria lançamento e evento de agenda junto).
--   2. is_test em cada tabela de dados -> a marca em si, por registro,
--      sempre editável nos dois sentidos. O risco que essa marcação
--      cria não é teste contar no relatório, é uma venda real ficar
--      marcada como teste e sumir do relatório sem ninguém notar, por
--      isso converter de volta pra real precisa ser fácil e visível.
--   3. funções pra listar, converter e apagar, todas com checagem de
--      admin no banco (não adianta esconder o botão na tela se a
--      função aceita ser chamada por qualquer um).
--
-- Nada aqui apaga nada sozinho. A limpeza só acontece quando alguém
-- chama purge_test_data() ou delete_record_forever() de propósito.
-- ============================================================

-- ------------------------------------------------------------
-- 1) A chave geral
-- ------------------------------------------------------------
alter table public.settings
  add column if not exists test_mode boolean not null default false;

-- ------------------------------------------------------------
-- 2) A marca por registro
-- ------------------------------------------------------------
alter table public.clients          add column if not exists is_test boolean not null default false;
alter table public.transactions     add column if not exists is_test boolean not null default false;
alter table public.rentals          add column if not exists is_test boolean not null default false;
alter table public.calendar_events  add column if not exists is_test boolean not null default false;
alter table public.mentoring_events add column if not exists is_test boolean not null default false;
alter table public.tasks            add column if not exists is_test boolean not null default false;

-- Índices parciais: só indexam as linhas de teste, que são poucas.
-- Servem pra tela "Dados de teste" listar rápido sem pesar nas
-- consultas normais do sistema.
create index if not exists clients_is_test_idx          on public.clients(id)          where is_test;
create index if not exists transactions_is_test_idx     on public.transactions(id)     where is_test;
create index if not exists rentals_is_test_idx          on public.rentals(id)          where is_test;
create index if not exists calendar_events_is_test_idx  on public.calendar_events(id)  where is_test;
create index if not exists mentoring_events_is_test_idx on public.mentoring_events(id) where is_test;
create index if not exists tasks_is_test_idx            on public.tasks(id)            where is_test;

-- ------------------------------------------------------------
-- 3) Herança automática da chave geral
-- ------------------------------------------------------------
-- Roda antes de cada insert. Se quem inseriu não disse nada sobre
-- is_test, o registro herda o estado da chave geral. Se alguém pediu
-- is_test = true explicitamente, respeita. É isso que faz o modo teste
-- pegar também nos registros criados em cascata pelas funções
-- create_rental, update_rental e finalize_rental_reservation, sem
-- precisar mexer em nenhuma delas.
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

drop trigger if exists clients_apply_test_mode on public.clients;
create trigger clients_apply_test_mode
  before insert on public.clients
  for each row execute function public.apply_test_mode();

drop trigger if exists transactions_apply_test_mode on public.transactions;
create trigger transactions_apply_test_mode
  before insert on public.transactions
  for each row execute function public.apply_test_mode();

drop trigger if exists rentals_apply_test_mode on public.rentals;
create trigger rentals_apply_test_mode
  before insert on public.rentals
  for each row execute function public.apply_test_mode();

drop trigger if exists calendar_events_apply_test_mode on public.calendar_events;
create trigger calendar_events_apply_test_mode
  before insert on public.calendar_events
  for each row execute function public.apply_test_mode();

drop trigger if exists mentoring_events_apply_test_mode on public.mentoring_events;
create trigger mentoring_events_apply_test_mode
  before insert on public.mentoring_events
  for each row execute function public.apply_test_mode();

drop trigger if exists tasks_apply_test_mode on public.tasks;
create trigger tasks_apply_test_mode
  before insert on public.tasks
  for each row execute function public.apply_test_mode();

-- ------------------------------------------------------------
-- 4) Agenda: teste não bloqueia data real
-- ------------------------------------------------------------
-- A trava de dupla reserva do equipamento passa a considerar is_test
-- como parte da chave. Assim um evento de teste no HIPRO 1 não impede
-- uma reserva real no mesmo dia, mas dois eventos de teste continuam
-- conflitando entre si (importante: é o que permite testar a própria
-- trava sem desligar ela).
alter table public.calendar_events
  drop constraint if exists no_equipment_double_booking;

alter table public.calendar_events
  add constraint no_equipment_double_booking
  exclude using gist (
    equipment_id with =,
    is_test with =,
    daterange(date_start, date_end, '[]') with &&
  )
  where (status <> 'cancelada' and equipment_id is not null);

-- ------------------------------------------------------------
-- 5) Guarda de admin, reaproveitada pelas funções abaixo
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
    where id = auth.uid() and is_admin
  ) then
    raise exception 'Apenas administradores podem executar esta ação.';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 6) Converter um registro: teste <-> real
-- ------------------------------------------------------------
-- Vale nos dois sentidos, de propósito. Marcar como real algo que foi
-- marcado como teste por engano é o caso mais importante dos dois,
-- porque é o que devolve a venda pro relatório.
--
-- A lista branca de tabelas não é decoração: sem ela, o nome da tabela
-- vindo da tela entraria direto num format() e viraria porta de
-- injeção de SQL.
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

-- ------------------------------------------------------------
-- 6b) Converter um cliente e tudo que está pendurado nele
-- ------------------------------------------------------------
-- Existe por causa do dia da virada: todo teste feito antes desta
-- migração está gravado como real, porque a coluna nasceu com default
-- false. Marcar isso registro por registro na mão seria inviável, e
-- deixar como está manteria o relatório sujo justamente no histórico.
--
-- Vale nos dois sentidos pelo mesmo motivo do set_record_test_flag: se
-- der pra marcar um cliente inteiro como teste por engano, tem que dar
-- pra desfazer com a mesma facilidade.
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
    'mentoring_events', v_mentoring
  );
end;
$$;

-- ------------------------------------------------------------
-- 7) Quanta coisa de teste existe hoje
-- ------------------------------------------------------------
-- Serve pra tela mostrar o número antes de perguntar se pode apagar.
-- Confirmar uma exclusão sem saber o tamanho do estrago é o tipo de
-- coisa que só dá errado uma vez.
create or replace function public.count_test_data()
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
    'tasks',            (select count(*) from public.tasks            where is_test)
  );
$$;

-- ------------------------------------------------------------
-- 8) Apagar tudo que está marcado como teste
-- ------------------------------------------------------------
-- Roda inteiro ou não roda: qualquer erro no meio desfaz tudo, porque
-- uma função em plpgsql já executa dentro de uma transação.
--
-- Duas cautelas que valem o código a mais:
--
--   a) rentals e transactions se referenciam nos dois sentidos, então
--      as referências são desfeitas antes de apagar, senão o banco
--      recusa por chave estrangeira.
--   b) um cliente marcado como teste que tenha lançamento ou locação
--      REAL pendurado nele não é apagado. É sinal de que a marcação
--      está errada, não de que o dado real deve sumir junto. Esses
--      clientes voltam na resposta em 'clientes_preservados' pra
--      aparecer na tela.
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

  -- (a) desfaz os vínculos apontando PARA registros de teste, vindos de
  -- registros que vão sobreviver
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

  -- (b) clientes de teste: só os que não deixaram nada real pra trás
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
-- 9) Apagar um registro específico, teste ou real
-- ------------------------------------------------------------
-- A senha é conferida na tela (reautenticando no Supabase com a conta
-- de quem está logado) antes desta função ser chamada. Aqui fica a
-- segunda barreira, a de admin, que vale mesmo se alguém chamar a
-- função por fora do sistema.
--
-- Os vínculos são desfeitos antes de apagar, então excluir um
-- lançamento não derruba a locação que apontava pra ele: a locação
-- continua lá, só fica sem lançamento vinculado.
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
  v_blockers int;
begin
  perform public.require_admin();

  if p_table = 'transactions' then
    update public.rentals          set transaction_id = null where transaction_id = p_id;
    update public.mentoring_events set transaction_id = null where transaction_id = p_id;
    delete from public.transactions where id = p_id;

  elsif p_table = 'rentals' then
    update public.transactions    set rental_id = null where rental_id = p_id;
    update public.calendar_events set rental_id = null where rental_id = p_id;
    delete from public.rentals where id = p_id;

  elsif p_table = 'calendar_events' then
    update public.mentoring_events set calendar_event_id = null where calendar_event_id = p_id;
    delete from public.calendar_events where id = p_id;

  elsif p_table = 'mentoring_events' then
    update public.transactions    set mentoring_id = null where mentoring_id = p_id;
    update public.calendar_events set mentoring_id = null where mentoring_id = p_id;
    delete from public.mentoring_events where id = p_id;

  elsif p_table = 'tasks' then
    delete from public.tasks where id = p_id;

  elsif p_table = 'clients' then
    -- Cliente é o único caso em que a exclusão é recusada em vez de
    -- arrastar o resto junto. Apagar um cliente com histórico
    -- financeiro em cima levaria dado real embora sem aviso.
    select
      (select count(*) from public.transactions    where client_id = p_id)
      + (select count(*) from public.rentals         where client_id = p_id)
      + (select count(*) from public.calendar_events where client_id = p_id)
    into v_blockers;

    if v_blockers > 0 then
      raise exception 'Este cliente tem % registro(s) vinculado(s) (lançamentos, locações ou eventos). Exclua-os antes, ou mantenha o cliente.', v_blockers;
    end if;

    delete from public.client_tags where client_id = p_id;
    delete from public.tasks where client_id = p_id;
    delete from public.clients where id = p_id;

  else
    raise exception 'Tabela não permitida: %', p_table;
  end if;
end;
$$;
