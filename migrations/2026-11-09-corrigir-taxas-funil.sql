-- Correção (09/11/2026): a migration 2026-11-05-seguranca-acesso.sql tirou de
-- authenticated o direito de executar valor_taxa_atual(), mas a view
-- clientes_taxas (security_invoker) chama essa função. Resultado: a leitura da
-- view voltava 403 e Funil, Clientes e Relatórios mostravam "Não consegui
-- carregar esta tela". A função só devolve o valor da taxa de reserva de
-- Configurações; quem não está logado (anon) continua sem acesso.
grant execute on function public.valor_taxa_atual() to authenticated;
