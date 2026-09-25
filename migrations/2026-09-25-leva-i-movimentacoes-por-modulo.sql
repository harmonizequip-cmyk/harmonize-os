-- ============================================================
-- LEVA I: leitura de movimentacoes passa a respeitar o módulo
--
-- CONTEXTO
-- movimentacoes_leitura (leva B) foi criada de propósito como "true"
-- para qualquer logado — na época fazia sentido, só existia um usuário
-- com acesso total. Na auditoria de segurança pedida pelo usuário
-- (mesma leva da correção em has_module_permission, leva H), ele
-- confirmou que hoje só ele tem login, mas que pode no futuro criar
-- uma conta só com o módulo "agenda" liberado. Uma conta assim, hoje,
-- já leria o histórico inteiro — inclusive lançamento financeiro e
-- edição de cadastro de cliente — mesmo sem ter esses módulos.
--
-- O QUE ESTA LEVA FAZ
-- Cada linha de movimentacoes tem uma "entidade" (calendar_events,
-- rentals, mentoring_events, clients, tasks, transactions — os únicos
-- valores que registrar_movimentacao grava hoje, conferido em todo o
-- histórico de migrations). A política de leitura passa a exigir o
-- mesmo módulo que já protege a tabela de origem daquela entidade:
--
--   calendar_events, rentals, mentoring_events  -> agenda
--   clients, tasks                              -> clientes
--   transactions                                -> financeiro
--   qualquer entidade fora dessa lista           -> configuracoes
--     (fallback propositalmente restritivo: preferível esconder um
--     tipo de registro novo que apareça no futuro a expor por engano)
--
-- Continua sem policy de insert/update/delete: só as funções
-- security definer escrevem aqui, isso não muda nesta leva.
--
-- IMPACTO PARA QUEM JÁ USA HOJE
-- Nenhum: is_admin=true passa em has_module_permission para qualquer
-- módulo (ver has_module_permission, leva H), então o único usuário
-- atual continua vendo o histórico inteiro, exatamente como antes.
-- ============================================================

drop policy if exists movimentacoes_leitura on public.movimentacoes;
create policy movimentacoes_leitura on public.movimentacoes
  for select to authenticated
  using (
    case entidade
      when 'calendar_events'  then has_module_permission('agenda')
      when 'rentals'          then has_module_permission('agenda')
      when 'mentoring_events' then has_module_permission('agenda')
      when 'clients'          then has_module_permission('clientes')
      when 'tasks'            then has_module_permission('clientes')
      when 'transactions'     then has_module_permission('financeiro')
      else has_module_permission('configuracoes')
    end
  );

comment on policy movimentacoes_leitura on public.movimentacoes is
  'Leitura por módulo (leva I): cada entidade só é visível para quem tem o módulo correspondente liberado (ou é admin, que passa em qualquer módulo). Antes desta leva era "true" para qualquer logado.';
