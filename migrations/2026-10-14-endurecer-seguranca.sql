-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 14/10/2026, pelo dono, e conferida por consulta de leitura (gatilhos abertos 0, disponibilidade fechada, anon sem tabelas, search_path fixo nas 5 funções, acesso de quem está logado intacto).
-- Endurecimento de segurança (checklist de 24 pontos, 14/10/2026).
-- Não altera nenhum dado. Só tira acessos que ninguém usa:
--   1. Funções de gatilho: são disparadas pelo banco, não chamadas pelo app.
--      Tira o EXECUTE de quem está logado (o gatilho continua funcionando).
--   2. disponibilidade_publica: não é usada pelo app e deixava qualquer conta
--      logada (até uma recém-criada, sem permissão) ver as datas ocupadas.
--   3. search_path fixo nas 5 funções que o verificador do Supabase apontou.
--   4. Quem não está logado (anon) perde todo acesso às tabelas e views. O RLS
--      já barrava; isto é a segunda tranca. Vale também para tabelas futuras.
-- ============================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.assinatura);
  end loop;
end $$;

revoke execute on function public.disponibilidade_publica(date, date) from public, anon, authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('formatar_reais', 'keep_client_forever', 'set_became_client_at', 'hoje_local', 'trg_rentals_marca_reagendamento')
  loop
    execute format('alter function %s set search_path = public', r.assinatura);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
