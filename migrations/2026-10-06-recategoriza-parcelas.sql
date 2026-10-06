-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 06/10/2026, pelo dono, e conferida por consulta de leitura.
-- Depende de 2026-10-06-despesas-fixas-e-categorias.sql.
--
-- Prévia (06/10/2026): 2 lançamentos de "Outros" passam para
-- "Parcela de equipamento":
--   PARCELA HIPRO 2  R$ 5.750,00  22/09/2026
--   PARCELA HIPRO 1  R$ 4.255,00  23/09/2026
-- Só muda a categoria. Valor, data e forma de pagamento ficam iguais.
-- ============================================================

with alvo as (
  update public.transactions t
     set category_id = (select id from public.categories where name = 'Parcela de equipamento' and type = 'saida' and scope = 'harmonize')
   where t.id in ('1aa5fb3c-e6c1-4a55-983e-4d770066c009', '3c655552-1e3b-48a3-882a-f8285a7489ee')
     and t.category_id = (select id from public.categories where name = 'Outros' and type = 'saida' and scope = 'harmonize')
  returning t.id, t.description
)
select public.registrar_movimentacao('editado', 'transactions', id, description,
         jsonb_build_object('acao_detalhada', 'categoria: Outros -> Parcela de equipamento'))
  from alvo;
