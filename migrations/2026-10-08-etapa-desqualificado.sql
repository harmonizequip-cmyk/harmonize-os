-- ============================================================
-- STATUS: ESCRITA, AINDA NÃO APLICADA (aguarda o dono rodar).
--
-- Nova etapa do funil de leads: "Desqualificado" (desqualificado), logo
-- depois de Nutrição. Para lead que não tem perfil ou não vai fechar.
-- Só amplia a lista de etapas aceitas; não mexe em nenhum cadastro.
-- ============================================================

alter table public.clients drop constraint if exists clients_stage_check;
alter table public.clients add constraint clients_stage_check
  check (stage in ('lead', 'contato', 'nutricao', 'desqualificado', 'em_contato', 'qualificado', 'agendado', 'cliente'));
