-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 05/10/2026, pelo dono, e conferida por consulta de leitura.
--
-- Apaga clients_backup_stage: cópia antiga (id, etapa do funil) de 191
-- clientes. Nada no app lê e nenhuma view depende dela. Prévia (05/10/2026):
-- 153 das 191 etapas guardadas já são diferentes das atuais, ou seja, é um
-- retrato de uma etapa antiga do funil. Só rode se não precisar mais dele.
-- Faça o backup em Configurações antes. Apagar não tem volta pelo banco.
-- ============================================================

drop table if exists public.clients_backup_stage;
