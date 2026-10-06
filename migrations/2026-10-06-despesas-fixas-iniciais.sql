-- ============================================================
-- STATUS: ESCRITA, AINDA NÃO APLICADA (aguarda o dono rodar).
-- Depende de 2026-10-06-despesas-fixas-e-categorias.sql.
--
-- Preenche a lista de contas fixas com o que apareceu em setembro. Depois
-- dá para mudar tudo em Configurações > Contas fixas do mês. Só preenche se
-- a lista ainda estiver vazia.
-- ============================================================

update public.settings
   set despesas_fixas = '[
     {"nome": "Parcela HIPRO 2", "valor": 5750.00, "tipo": "negocio"},
     {"nome": "Parcela HIPRO 1", "valor": 4255.00, "tipo": "negocio"},
     {"nome": "Aluguel moradia", "valor": 2250.00, "tipo": "pessoal"},
     {"nome": "Faculdade", "valor": 317.59, "tipo": "pessoal"}
   ]'::jsonb,
       updated_at = now()
 where id = true
   and despesas_fixas = '[]'::jsonb;
