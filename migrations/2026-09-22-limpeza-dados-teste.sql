-- ============================================================
-- LIMPEZA GERAL: zera os dados de operação, mantém a configuração
--
-- Pedido em 22/09/2026: tudo que estava no sistema até aqui era teste,
-- e a operação real começa do zero a partir de agora.
--
-- APAGA (dados de operação):
--   clientes, locações, lançamentos financeiros, eventos da agenda,
--   tarefas, mentorias, vínculos de tag com cliente e o histórico de
--   movimentações dos testes.
--
-- MANTÉM (configuração, que não é dado de teste):
--   categorias financeiras, equipamentos, etiquetas, configurações de
--   preço e taxa, limites de despesa, e os perfis de usuário com suas
--   permissões. Ou seja, você não precisa reconfigurar nada nem criar
--   login de novo.
--
-- ORDEM
-- O schema tem três ciclos de chave estrangeira (locação <-> lançamento,
-- mentoria <-> agenda, mentoria <-> lançamento). Apagar na ordem errada
-- para no primeiro vínculo. Por isso os updates para null vêm antes de
-- qualquer delete: eles soltam os ponteiros, e só então as tabelas podem
-- ser esvaziadas.
--
-- REVERSÃO
-- Não tem. Rode o backup manualmente antes, pela aba Actions do GitHub,
-- e confirme que a etapa de conferência ficou verde. Só então rode isto.
-- ============================================================

begin;

-- 1) Solta todos os ponteiros que formam ciclo
update public.rentals          set transaction_id = null;
update public.mentoring_events set transaction_id = null, calendar_event_id = null;
update public.calendar_events  set rental_id = null, mentoring_id = null;
update public.transactions     set rental_id = null, mentoring_id = null;

-- 2) Esvazia na ordem que as chaves restantes permitem
delete from public.movimentacoes;
delete from public.client_tags;
delete from public.tasks;
delete from public.calendar_events;
delete from public.transactions;
delete from public.rentals;
delete from public.mentoring_events;
delete from public.clients;

-- 3) Confere: as três primeiras linhas têm que vir zeradas, e as de
-- configuração têm que continuar com conteúdo.
select 'clientes'      as tabela, count(*) as restou from public.clients
union all select 'locacoes',        count(*) from public.rentals
union all select 'lancamentos',     count(*) from public.transactions
union all select 'eventos',         count(*) from public.calendar_events
union all select 'tarefas',         count(*) from public.tasks
union all select 'mentorias',       count(*) from public.mentoring_events
union all select 'movimentacoes',   count(*) from public.movimentacoes
union all select '--- CONFIG ---',  null
union all select 'categorias',      count(*) from public.categories
union all select 'equipamentos',    count(*) from public.equipments
union all select 'etiquetas',       count(*) from public.tags
union all select 'configuracoes',   count(*) from public.settings
union all select 'perfis',          count(*) from public.profiles;

commit;
