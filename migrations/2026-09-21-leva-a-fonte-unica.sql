-- ============================================================
-- LEVA A DA AUDITORIA: fonte única dos valores
--
-- PROBLEMA
-- Cinco telas somavam rentals.calculated_value, cada uma com um
-- conjunto diferente de filtros, e nenhuma das cinco excluía locação
-- cancelada:
--
--   Dashboard (por equipamento)  is_test sim | período sim | cancelada NÃO
--   Lista de Clientes            is_test NÃO | período NÃO | cancelada NÃO
--   Ficha do cliente             is_test NÃO | período NÃO | cancelada NÃO
--   Equipamentos                 is_test NÃO | período NÃO | cancelada NÃO
--   Relatórios                   is_test sim | período NÃO | cancelada NÃO
--
-- Efeito medido na base em 21/09/2026: 7 locações canceladas somando
-- R$ 39.581,97 como se fossem faturamento, nas cinco telas. O total
-- mostrado era R$ 95.109,04 contra R$ 55.527,07 de faturamento real.
--
-- ESTA MIGRAÇÃO NÃO ALTERA NENHUM DADO.
-- Os dados da base estão corretos. Quem estava errado era a leitura.
-- As views abaixo passam a ser a única fonte de valor contabilizável;
-- as telas leem delas em vez de ler as tabelas direto. A partir daí,
-- esquecer o filtro deixa de ser possível, que era a causa de as
-- telas divergirem entre si.
--
-- Cancelar uma locação passa a tirar o valor dela de todos os totais
-- automaticamente, sem apagar linha nenhuma, e reverter o
-- cancelamento traz o valor de volta.
--
-- security_invoker = true mantém as políticas de RLS das tabelas de
-- origem valendo para quem consulta a view. Exige Postgres 15 ou
-- superior. Sem isso, a view rodaria com a permissão do dono e
-- furaria o RLS.
-- ============================================================

-- ------------------------------------------------------------
-- Locações que contam como faturamento
-- ------------------------------------------------------------
create or replace view public.rentals_contabilizaveis
with (security_invoker = true) as
select *
from public.rentals
where status <> 'cancelada'
  and is_test = false;

comment on view public.rentals_contabilizaveis is
  'Locações que contam como faturamento: exclui canceladas e modo teste. Toda soma de valor de locação deve ler daqui, nunca de rentals direto. Atenção: usa select *, então ao adicionar coluna em rentals é preciso rodar este create or replace view de novo para a coluna aparecer.';

-- ------------------------------------------------------------
-- Lançamentos que contam no caixa
--
-- Um lançamento entra no caixa se não for de teste E não estiver
-- preso a uma locação cancelada. Lançamento avulso (rental_id nulo)
-- entra normalmente, porque não depende de locação nenhuma.
-- ------------------------------------------------------------
create or replace view public.transactions_contabilizaveis
with (security_invoker = true) as
select t.*
from public.transactions t
where t.is_test = false
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
  'Lançamentos que contam no caixa: exclui modo teste e lançamentos presos a locação cancelada. Financeiro, Dashboard e Relatórios devem ler daqui, nunca de transactions direto. Atenção: usa select *, então ao adicionar coluna em transactions é preciso rodar este create or replace view de novo.';

grant select on public.rentals_contabilizaveis to authenticated;
grant select on public.transactions_contabilizaveis to authenticated;
