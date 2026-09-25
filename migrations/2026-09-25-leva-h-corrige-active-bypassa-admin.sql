-- ============================================================
-- LEVA H: active deixa de ser ignorado quando is_admin=true
--
-- CONTEXTO
-- has_module_permission nunca esteve versionado neste repositório —
-- foi criado direto no painel do Supabase. Ela é a função por trás de
-- toda política de RLS do sistema (clients, calendar_events, rentals,
-- transactions, tasks, etc — ver `select * from pg_policies`), então
-- esta migration serve dois propósitos: registrar a definição atual
-- (documentação) e corrigir um furo real encontrado numa auditoria de
-- segurança pedida pelo usuário.
--
-- O FURO
-- A definição em produção era:
--   select is_admin or (active and coalesce((permissions ->> module)::boolean, false))
-- "is_admin" vem antes do "or", então ele decide sozinho: um perfil
-- com is_admin=true passa em qualquer checagem de permissão mesmo com
-- active=false. Ou seja, desativar um administrador (active=false) não
-- desativa nada de verdade — ele continua com acesso total a todas as
-- tabelas do sistema. "active" só funcionava como freio real para
-- quem não é admin.
--
-- A CORREÇÃO
-- Move "active" para fora do or, valendo para todo mundo, admin
-- incluso: sem estar active, ninguém passa, nem admin.
--
-- IMPACTO EM QUEM JÁ USA O SISTEMA HOJE
-- Nenhum: todo perfil com active=true continua exatamente com o mesmo
-- resultado de antes. Só muda o caso active=false + is_admin=true, que
-- passava a ter acesso e agora não tem mais — que é o comportamento
-- esperado de "desativei essa conta".
-- ============================================================

create or replace function public.has_module_permission(module text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select active and (is_admin or coalesce((permissions ->> module)::boolean, false))
       from profiles where id = auth.uid()),
    false
  );
$function$;

comment on function public.has_module_permission(text) is
  'Porta de entrada de toda política de RLS do sistema: true só se o perfil logado está active E (é admin OU tem o módulo liberado em permissions). active bloqueia mesmo administrador (leva H) — antes desta correção, is_admin ignorava active.';
