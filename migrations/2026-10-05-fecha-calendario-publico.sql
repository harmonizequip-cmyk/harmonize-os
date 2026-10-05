-- ============================================================
-- STATUS: ESCRITA, AINDA NÃO APLICADA (aguarda o dono rodar).
--
-- Fecha o último ponto do banco aberto para quem não está logado:
-- disponibilidade_publica (calendário público de datas livres).
-- Decisão do dono em 05/10/2026: ele não envia nenhum link público, e
-- nenhuma tela do app chama essa função (conferido no código).
--
-- Depois disto nenhuma função do schema public é executável por anon.
-- Reverter: grant execute on function public.disponibilidade_publica(date, date) to anon;
-- ============================================================

revoke execute on function public.disponibilidade_publica(date, date) from public, anon;
grant execute on function public.disponibilidade_publica(date, date) to authenticated, service_role;
