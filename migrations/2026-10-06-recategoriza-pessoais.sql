-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 06/10/2026, pelo dono, e conferida por consulta de leitura.
--
-- Prévia (06/10/2026): 2 contas pessoais pagas pelo caixa da empresa saem
-- de "Outros" e vão para "Retiradas" (dinheiro que sai do negócio para a
-- vida pessoal):
--   ALUGUEL MORADIA  R$ 2.250,00  12/09/2026
--   FACULDADE        R$   317,59  25/09/2026
-- Só muda a categoria.
-- ============================================================

with alvo as (
  update public.transactions t
     set category_id = (select id from public.categories where name = 'Retiradas' and type = 'saida' and scope = 'harmonize')
   where t.id in ('7548c3b6-2a6b-4796-bfc9-26add9356d78', 'ab7beeec-d697-44eb-9310-0ee19b2c7ec0')
     and t.category_id = (select id from public.categories where name = 'Outros' and type = 'saida' and scope = 'harmonize')
  returning t.id, t.description
)
select public.registrar_movimentacao('editado', 'transactions', id, description,
         jsonb_build_object('acao_detalhada', 'categoria: Outros -> Retiradas'))
  from alvo;
