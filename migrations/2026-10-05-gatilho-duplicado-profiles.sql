-- ============================================================
-- STATUS: ESCRITA, AINDA NÃO APLICADA (aguarda o dono rodar).
--
-- Gatilho duplicado em profiles: trg_protect_profile_privileges e
-- trg_profiles_lock_privileged_fields rodam o MESMO corpo (confirmado por
-- hash em 05/10/2026). Fica trg_profiles_lock_privileged_fields; sai o
-- duplicado e a função dele. Não mexe em dados.
--
-- (handle_new_user saiu só do schema.sql: nunca existiu no banco.)
-- Reverter: recriar protect_profile_privileges e o gatilho com o corpo de
-- profiles_lock_privileged_fields.
-- ============================================================

drop trigger if exists trg_protect_profile_privileges on public.profiles;
drop function if exists public.protect_profile_privileges();
