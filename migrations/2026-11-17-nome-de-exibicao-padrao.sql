-- Nome de exibição sempre preenchido (17/11/2026, pedido do dono): quando o cadastro fica sem
-- nome de exibição, vale o primeiro nome do campo "Nome" ("DRA. CAMILA - NATAL" vira "Camila").
-- 1) Função que tira o título (Dr./Dra./Doutor(a)) e pega o primeiro nome (mesma regra de lib/saudacao.ts).
-- 2) Gatilho em clients: ao criar ou salvar com o nome de exibição vazio, preenche sozinho.
--    Quem já tem nome de exibição não muda.
-- 3) Preenche os cadastros que estão sem (mostrado antes na página de SQL).
create or replace function public.primeiro_nome_exibicao(p_nome text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(initcap(lower(
           (regexp_match(regexp_replace(btrim(coalesce(p_nome, '')), '^(dr|dra|doutora|doutor)\.?(\s+|$)', '', 'i'), '^[^\s().,\-0-9]+'))[1]
         )), '');
$$;
revoke execute on function public.primeiro_nome_exibicao(text) from public, anon;
grant execute on function public.primeiro_nome_exibicao(text) to authenticated, service_role;

create or replace function public.clients_preencher_nome_exibicao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(new.display_name, '')), '') is null then
    new.display_name := public.primeiro_nome_exibicao(new.name);
  end if;
  return new;
end;
$$;
revoke execute on function public.clients_preencher_nome_exibicao() from public, anon, authenticated;

drop trigger if exists trg_clients_nome_exibicao on public.clients;
create trigger trg_clients_nome_exibicao
  before insert or update of name, display_name on public.clients
  for each row execute function public.clients_preencher_nome_exibicao();

-- Cadastros que estão sem nome de exibição.
update public.clients
   set display_name = public.primeiro_nome_exibicao(name)
 where nullif(btrim(coalesce(display_name, '')), '') is null
   and public.primeiro_nome_exibicao(name) is not null;
