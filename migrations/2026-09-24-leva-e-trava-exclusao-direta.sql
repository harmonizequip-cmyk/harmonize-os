-- ============================================================
-- LEVA E (parte 1): fecha a exclusão direta que pula a auditoria
--
-- O QUE ESTAVA ERRADO
-- clients, rentals, calendar_events, mentoring_events, tasks e
-- transactions têm política de RLS "for all", que cobre select, insert,
-- update E delete com a mesma regra: basta ter a permissão do módulo
-- (ex: "clientes"). Isso significa que qualquer usuário com essa
-- permissão consegue apagar uma linha direto (pelo console do navegador,
-- por uma chamada solta, por um bug futuro de tela) sem passar pelo
-- delete_record_forever.
--
-- Duas coisas ficam furadas quando isso acontece:
--   1. delete_record_forever exige require_admin() — só administrador
--      apaga. A política "for all" não checa is_admin nenhum, só a
--      permissão do módulo. Um usuário comum já tem “clientes” ligado
--      por padrão (ver profiles.permissions), então já consegue apagar
--      cliente sem ser admin.
--   2. Nada além do delete_record_forever grava em movimentacoes. Uma
--      exclusão direta é literalmente invisível: a linha some e não
--      sobra rastro nenhum de quem apagou o quê.
--
-- Testado localmente antes desta migração: um perfil não-admin, só com
-- "clientes" ligado, conseguiu `delete from clients` direto num cliente
-- sem locação nenhuma, e a tabela movimentacoes ficou com zero linhas
-- para aquele id. É exatamente o buraco que este arquivo fecha.
--
-- POR QUE ISSO NÃO QUEBRA delete_record_forever
-- A função é security definer, dona é o postgres (dono das tabelas), e
-- RLS não vale para o dono da tabela por padrão. A função já exige
-- is_admin nela mesma (require_admin), então a exclusão continua
-- funcionando exatamente igual para quem tem permissão de admin — só
-- que agora só existe esse caminho.
--
-- O QUE FICA DE FORA DESTA TRAVA
-- client_tags e tags continuam com exclusão direta liberada: são
-- associações e catálogo, não entram no histórico de movimentações, e a
-- tela de tags/etiquetas já apaga direto por design (ver
-- LeadCardModal.tsx e ConfiguracoesClient.tsx). Travar ali não protege
-- nada e quebraria essas duas telas.
--
-- PODE RODAR MAIS DE UMA VEZ: as políticas são recriadas do zero.
-- ============================================================

-- ------------------------------------------------------------
-- clients
-- ------------------------------------------------------------
drop policy if exists "clients_rw" on clients;
create policy "clients_select" on clients for select using (has_module_permission('clientes'));
create policy "clients_insert" on clients for insert with check (has_module_permission('clientes'));
create policy "clients_update" on clients for update
  using (has_module_permission('clientes'))
  with check (has_module_permission('clientes'));

-- ------------------------------------------------------------
-- rentals
-- ------------------------------------------------------------
drop policy if exists "rentals_rw" on rentals;
create policy "rentals_select" on rentals for select using (has_module_permission('agenda'));
create policy "rentals_insert" on rentals for insert with check (has_module_permission('agenda'));
create policy "rentals_update" on rentals for update
  using (has_module_permission('agenda'))
  with check (has_module_permission('agenda'));

-- ------------------------------------------------------------
-- calendar_events
-- ------------------------------------------------------------
drop policy if exists "calendar_rw" on calendar_events;
create policy "calendar_select" on calendar_events for select using (has_module_permission('agenda'));
create policy "calendar_insert" on calendar_events for insert with check (has_module_permission('agenda'));
create policy "calendar_update" on calendar_events for update
  using (has_module_permission('agenda'))
  with check (has_module_permission('agenda'));

-- ------------------------------------------------------------
-- mentoring_events
-- ------------------------------------------------------------
drop policy if exists "mentoring_rw" on mentoring_events;
create policy "mentoring_select" on mentoring_events for select using (has_module_permission('agenda'));
create policy "mentoring_insert" on mentoring_events for insert with check (has_module_permission('agenda'));
create policy "mentoring_update" on mentoring_events for update
  using (has_module_permission('agenda'))
  with check (has_module_permission('agenda'));

-- ------------------------------------------------------------
-- tasks
-- ------------------------------------------------------------
drop policy if exists "tasks_rw" on tasks;
create policy "tasks_select" on tasks for select using (has_module_permission('clientes'));
create policy "tasks_insert" on tasks for insert with check (has_module_permission('clientes'));
create policy "tasks_update" on tasks for update
  using (has_module_permission('clientes'))
  with check (has_module_permission('clientes'));

-- ------------------------------------------------------------
-- transactions (duas políticas antigas: harmonize e pessoal)
-- ------------------------------------------------------------
drop policy if exists "transactions_rw_harmonize" on transactions;
create policy "transactions_select_harmonize" on transactions for select
  using (scope = 'harmonize' and has_module_permission('financeiro'));
create policy "transactions_insert_harmonize" on transactions for insert
  with check (scope = 'harmonize' and has_module_permission('financeiro'));
create policy "transactions_update_harmonize" on transactions for update
  using (scope = 'harmonize' and has_module_permission('financeiro'))
  with check (scope = 'harmonize' and has_module_permission('financeiro'));

drop policy if exists "transactions_rw_pessoal" on transactions;
create policy "transactions_select_pessoal" on transactions for select
  using (scope = 'pessoal' and created_by = auth.uid());
create policy "transactions_insert_pessoal" on transactions for insert
  with check (scope = 'pessoal' and created_by = auth.uid());
create policy "transactions_update_pessoal" on transactions for update
  using (scope = 'pessoal' and created_by = auth.uid())
  with check (scope = 'pessoal' and created_by = auth.uid());

-- ============================================================
-- CONFERÊNCIA
-- Nenhuma das seis tabelas pode ter política de delete depois disto.
-- ============================================================
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('clients', 'rentals', 'calendar_events', 'mentoring_events', 'tasks', 'transactions')
   and cmd = 'DELETE';
