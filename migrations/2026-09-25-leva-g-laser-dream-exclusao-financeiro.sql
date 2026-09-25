-- ============================================================
-- LEVA G: LASER DREAM JP nunca deve contar como faturamento
--
-- CONTEXTO
-- LASER DREAM JP é a própria clínica do usuário, cadastrada só para
-- travar data na agenda (reservar o HIPRO 1/2 para não deixar outro
-- cliente marcar o "dia da clínica"). Nunca gera faturamento de
-- verdade — é diferente de:
--   parceiro   -> isenta só a taxa de compromisso, mas ainda é negócio
--                 real e pode gerar receita (LASER DREAM JP também é
--                 parceiro desde a leva de 24/09, isso não muda aqui).
--   is_test    -> some de toda tela (Clientes, Funil, Relatórios,
--                 Agenda). Forte demais aqui: LASER DREAM JP precisa
--                 continuar aparecendo normal em Clientes/Funil/Agenda,
--                 só não pode entrar em soma de dinheiro.
--
-- O QUE ESTE ARQUIVO FAZ
-- Marca excluir_financeiro=true só nela, e as duas views que já são a
-- fonte única de faturamento (leva A: rentals_contabilizaveis e
-- transactions_contabilizaveis) passam a excluir quem tem essa marca.
-- Efeito: some do Radar de precificação, da concentração de receita e
-- do mix de receita em Relatórios (e de qualquer outra tela que já lê
-- dessas duas views, como Dashboard e Financeiro). Continua contando
-- normal em origem que converte, funil de follow-up e padrão de agenda
-- por dia da semana — isso é uso real de equipamento, não dinheiro, e
-- o pedido foi só "não contabilizar no financeiro".
--
-- taxas_pendentes (view clientes_taxas, leva C4) já não precisa de
-- ajuste: reserva de parceiro nasce com taxa nao_aplica sozinha
-- (leva C3c), e LASER DREAM JP já é parceiro.
--
-- PODE RODAR MAIS DE UMA VEZ: create or replace view é idempotente, e
-- o update abaixo só muda quem ainda não está marcado.
-- ============================================================

alter table public.clients add column if not exists excluir_financeiro boolean not null default false;

comment on column public.clients.excluir_financeiro is
  'true = nunca conta como faturamento (rentals_contabilizaveis / transactions_contabilizaveis), mesmo sem ser cadastro de teste. Para uso interno que nunca gera receita de verdade (ex: LASER DREAM JP, controle de agenda da própria clínica). Diferente de parceiro (isenta só a taxa, ainda é negócio real) e de is_test (some de toda tela).';

update public.clients
   set excluir_financeiro = true
 where name ilike 'LASER DREAM JP'
   and excluir_financeiro is distinct from true;

-- ------------------------------------------------------------
-- rentals_contabilizaveis: mesma view da leva A, agora também
-- excluindo quem está marcado excluir_financeiro. security_invoker
-- mantido (mesmo motivo da leva A: sem isso a view fura o RLS das
-- tabelas de origem).
-- ------------------------------------------------------------
create or replace view public.rentals_contabilizaveis
with (security_invoker = true) as
select r.*
from public.rentals r
where r.status <> 'cancelada'
  and r.is_test = false
  and not exists (
    select 1 from public.clients c
    where c.id = r.client_id and c.excluir_financeiro
  );

comment on view public.rentals_contabilizaveis is
  'Locações que contam como faturamento: exclui canceladas, modo teste, e cliente marcado excluir_financeiro (leva G). Toda soma de valor de locação deve ler daqui, nunca de rentals direto. Atenção: usa select *, então ao adicionar coluna em rentals é preciso rodar este create or replace view de novo para a coluna aparecer.';

-- ------------------------------------------------------------
-- transactions_contabilizaveis: mesmo raciocínio, cobrindo tanto o
-- lançamento vinculado direto ao cliente (client_id) quanto o que
-- chega até ele só pela locação (rental_id).
-- ------------------------------------------------------------
create or replace view public.transactions_contabilizaveis
with (security_invoker = true) as
select t.*
from public.transactions t
where t.is_test = false
  and (
    t.client_id is null
    or not exists (
      select 1 from public.clients c
      where c.id = t.client_id and c.excluir_financeiro
    )
  )
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
  'Lançamentos que contam no caixa: exclui modo teste, lançamentos presos a locação cancelada, e cliente marcado excluir_financeiro (leva G). Financeiro, Dashboard e Relatórios devem ler daqui, nunca de transactions direto. Atenção: usa select *, então ao adicionar coluna em transactions é preciso rodar este create or replace view de novo.';

grant select on public.rentals_contabilizaveis to authenticated;
grant select on public.transactions_contabilizaveis to authenticated;

-- ============================================================
-- CONFERÊNCIA
-- ============================================================
select c.name, c.parceiro, c.excluir_financeiro
  from public.clients c
 where c.name ilike '%LASER DREAM%';
