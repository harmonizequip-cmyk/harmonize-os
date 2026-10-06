-- ============================================================
-- STATUS: NÃO APLICADA por decisão do dono (06/10/2026): o lançamento continua em Retiradas.
-- Depende de 2026-10-06-despesas-fixas-e-categorias.sql.
--
-- Prévia (06/10/2026): 1 lançamento de "Retiradas" passa para "Impostos":
--   IMPOSTOS CAMPINA GRANDE  R$ 13.082,33  22/09/2026
-- Rode só se esse valor foi imposto da empresa. Se foi dinheiro pessoal,
-- não rode e ele continua em Retiradas.
-- ============================================================

with alvo as (
  update public.transactions t
     set category_id = (select id from public.categories where name = 'Impostos' and type = 'saida' and scope = 'harmonize')
   where t.id = 'eb70aad1-ce9c-4652-be7c-2be41db91a14'
     and t.category_id = (select id from public.categories where name = 'Retiradas' and type = 'saida' and scope = 'harmonize')
  returning t.id, t.description
)
select public.registrar_movimentacao('editado', 'transactions', id, description,
         jsonb_build_object('acao_detalhada', 'categoria: Retiradas -> Impostos'))
  from alvo;
