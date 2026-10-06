-- ============================================================
-- STATUS: ESCRITA, AINDA NÃO APLICADA (aguarda o dono rodar).
-- Depende de 2026-10-06-emprestimos.sql.
--
-- Prévia (06/10/2026): o lançamento "IMPOSTOS CAMPINA GRANDE" de
-- R$ 13.082,33 (22/09/2026, hoje em Retiradas) foi um empréstimo à LASER
-- DREAM CAMPINA GRANDE, segundo o dono. Passa para a categoria "Empréstimo
-- concedido" e entra no controle de empréstimos. Valor, data e forma de
-- pagamento ficam iguais; a descrição original fica guardada na observação.
-- ============================================================

with alvo as (
  update public.transactions t
     set category_id = (select id from public.categories where name = 'Empréstimo concedido' and type = 'saida' and scope = 'harmonize'),
         description = 'Empréstimo para LASER DREAM CAMPINA GRANDE',
         notes = trim(both ' ' from coalesce(t.notes, '') || ' Descrição original: ' || t.description)
   where t.id = 'eb70aad1-ce9c-4652-be7c-2be41db91a14'
     and not exists (select 1 from public.emprestimos e where e.transaction_id = t.id)
  returning t.id, t.amount, t.date, t.created_by
), novo as (
  insert into public.emprestimos (devedor, tipo, valor, data, descricao, transaction_id, created_by)
  select 'LASER DREAM CAMPINA GRANDE', 'concedido', amount, date, 'Lançado antes como IMPOSTOS CAMPINA GRANDE', id, created_by
    from alvo
  returning id, valor
)
select public.registrar_movimentacao('criado', 'emprestimos', id,
         'Empréstimo para LASER DREAM CAMPINA GRANDE (' || public.formatar_reais(valor) || ')',
         jsonb_build_object('acao_detalhada', 'lançamento de 22/09 reclassificado de Retiradas para empréstimo'))
  from novo;
