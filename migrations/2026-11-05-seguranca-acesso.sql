-- Segurança do acesso (05/11/2026, CRÍTICO, pedido do dono).
--
-- Contexto: o banco já nega tudo a quem não tem perfil liberado (RLS por
-- has_module_permission em todas as tabelas, views com security_invoker,
-- funções de apagar com require_admin e Storage por permissão). A brecha era
-- da tela: login sem perfil via a casca da Harmonize. Isso foi corrigido no app
-- (lib/acesso.ts: sem perfil, desligado ou sem permissão vai para /sem-acesso).
--
-- Aqui:
--  1. contato_harmonize(): o WhatsApp da Harmonize (Configurações > Empresa),
--     para o botão "pedir acesso" do portal pausado e da tela sem acesso. Só
--     esse número sai; qualquer login pode ler.
--  2. Funções internas deixam de ser chamáveis de fora (só usadas dentro de
--     outras funções do banco).
-- Não altera nem apaga dado.

create or replace function public.contato_harmonize()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(regexp_replace(coalesce(preferencias -> 'empresa' ->> 'whatsapp', ''), '\D', '', 'g'), '')
    from settings where id = true;
$$;
revoke execute on function public.contato_harmonize() from public, anon;
grant execute on function public.contato_harmonize() to authenticated, service_role;

revoke execute on function public.nome_curto_cliente(uuid) from public, anon, authenticated;
grant execute on function public.nome_curto_cliente(uuid) to service_role;
revoke execute on function public.categoria_nome_reservado(scope_type, entry_type, text, uuid) from public, anon, authenticated;
grant execute on function public.categoria_nome_reservado(scope_type, entry_type, text, uuid) to service_role;
revoke execute on function public.valor_taxa_atual() from public, anon, authenticated;
grant execute on function public.valor_taxa_atual() to service_role;

-- 3. O formulário de cadastro não aceita e-mail de login da equipe (dono,
--    funcionário, visualização) nem o login de outra cliente. A função
--    cadastro-cliente chama isto antes de criar o login. Devolve o motivo da
--    recusa ou nulo quando pode.
create or replace function public.cadastro_email_recusado(p_token text, p_email text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_perfil profiles%rowtype;
  v_cliente uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_user is null then return null; end if;
  select * into v_perfil from profiles where id = v_user;
  if v_perfil.id is null then return null; end if; -- login de outro formulário, ainda sem acesso
  if v_perfil.cliente_id is null then
    return 'Este e-mail já é usado num acesso da equipe da Harmonize. Use outro e-mail.';
  end if;
  select client_id into v_cliente from convites_cadastro where token = p_token;
  if v_cliente is not null and v_cliente <> v_perfil.cliente_id then
    return 'Este e-mail já é o login de outra cliente. Use outro e-mail.';
  end if;
  return null;
end;
$$;
revoke execute on function public.cadastro_email_recusado(text, text) from public, anon, authenticated;
grant execute on function public.cadastro_email_recusado(text, text) to service_role;
