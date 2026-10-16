-- ============================================================
-- FORMULÁRIO DE CADASTRO PARA A CLIENTE PREENCHER (acesso ao Planejador)
--
-- STATUS: AGUARDANDO O DONO
--
-- O dono gera um link (convite com token, vale 14 dias, uso único) e manda
-- no WhatsApp. A cliente abre /cadastro/<token>, preenche os dados e cria a
-- senha. A Edge Function "cadastro-cliente" (sem login, confere o token) cria
-- o login e chama convite_cadastro_receber: se o convite é de uma cliente,
-- ou o WhatsApp bate com um cadastro, atualiza esse cadastro (o mesmo
-- registro, então locações, pagamentos e planejamentos continuam com ela; o
-- que havia antes fica em convites_cadastro.antes e nas movimentações). Sem
-- cadastro parecido, cria um novo. O dono recebe aviso no celular e só toca
-- em "Liberar acesso" (liberar_acesso_planejador com o e-mail do login).
-- ============================================================

create table if not exists public.convites_cadastro (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  client_id uuid references public.clients(id) on delete set null,
  criado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '14 days',
  preenchido_em timestamptz,
  dados jsonb,
  antes jsonb,
  resultado_client_id uuid references public.clients(id) on delete set null,
  cadastro_novo boolean,
  email_login text
);
create index if not exists convites_cadastro_resultado_idx on public.convites_cadastro (resultado_client_id) where preenchido_em is not null;
alter table public.convites_cadastro enable row level security;
create policy "convites_cadastro_select" on public.convites_cadastro for select using (has_module_permission('clientes'));
grant select on public.convites_cadastro to authenticated;
create trigger trg_somente_leitura before insert or update or delete on public.convites_cadastro for each statement execute function public.bloquear_somente_leitura();
comment on table public.convites_cadastro is
  'Links de cadastro que a cliente preenche sozinha (/cadastro/<token>). dados = o que ela mandou; antes = como estava o cadastro que foi atualizado.';

-- Dono gera o link. Para uma cliente, reaproveita o link ainda aberto dela.
create or replace function public.criar_convite_cadastro(p_client_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not has_module_permission('clientes') then raise exception 'Sem permissão.'; end if;
  if p_client_id is not null then
    if not exists (select 1 from clients where id = p_client_id) then raise exception 'Cliente não encontrada.'; end if;
    select token into v_token from convites_cadastro
     where client_id = p_client_id and preenchido_em is null and expira_em > now()
     order by created_at desc limit 1;
    if v_token is not null then return v_token; end if;
  end if;
  insert into convites_cadastro (client_id) values (p_client_id) returning token into v_token;
  return v_token;
end;
$$;

-- Para a página do formulário (pela Edge Function): o link vale? e o que já se sabe dela.
create or replace function public.convite_cadastro_abrir(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when cv.id is null then jsonb_build_object('valido', false, 'motivo', 'Link inválido.')
    when cv.preenchido_em is not null then jsonb_build_object('valido', false, 'motivo', 'Este cadastro já foi enviado. Fale com a Harmonize se precisar mudar algo.')
    when cv.expira_em <= now() then jsonb_build_object('valido', false, 'motivo', 'Este link venceu. Peça um novo para a Harmonize.')
    else jsonb_build_object('valido', true,
           'tratamento', c.treatment, 'nome_exibicao', c.display_name, 'whatsapp', c.whatsapp, 'email', c.email)
  end
  from (select 1) x
  left join convites_cadastro cv on cv.token = p_token
  left join clients c on c.id = cv.client_id;
$$;

-- Recebe o formulário (só a Edge Function chama, como service_role).
create or replace function public.convite_cadastro_receber(p_token text, p_dados jsonb, p_email_login text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cv convites_cadastro%rowtype;
  v_nome text := upper(nullif(btrim(p_dados ->> 'nome_completo'), ''));
  v_trat text := nullif(btrim(p_dados ->> 'tratamento'), '');
  v_exib text := nullif(btrim(p_dados ->> 'nome_exibicao'), '');
  v_whats text := regexp_replace(coalesce(p_dados ->> 'whatsapp', ''), '\D', '', 'g');
  v_email text := lower(nullif(btrim(p_dados ->> 'email'), ''));
  v_doc text := nullif(btrim(p_dados ->> 'documento'), '');
  v_clinica text := upper(nullif(btrim(p_dados ->> 'clinica'), ''));
  v_end text := upper(nullif(btrim(p_dados ->> 'endereco'), ''));
  v_cidade text := upper(nullif(btrim(p_dados ->> 'cidade'), ''));
  v_uf text := upper(nullif(btrim(p_dados ->> 'uf'), ''));
  v_client uuid;
  v_antes jsonb;
  v_novo boolean := false;
  v_qtd int;
begin
  select * into v_cv from convites_cadastro where token = p_token for update;
  if v_cv.id is null then raise exception 'Link inválido.'; end if;
  if v_cv.preenchido_em is not null then raise exception 'Este cadastro já foi enviado.'; end if;
  if v_cv.expira_em <= now() then raise exception 'Este link venceu.'; end if;
  if v_nome is null or length(v_whats) < 10 or v_email is null then
    raise exception 'Preencha nome completo, WhatsApp com DDD e e-mail.';
  end if;
  if v_trat is not null and v_trat not in ('Dr.', 'Dra.') then v_trat := null; end if;

  -- Quem é: a cliente do link; senão, o mesmo WhatsApp (11 ou 10 dígitos finais; 8 se só um bater).
  v_client := v_cv.client_id;
  if v_client is null then
    select id into v_client from clients
     where not is_test and right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 10) = right(v_whats, 10)
     order by became_client_at desc nulls last, created_at limit 1;
  end if;
  if v_client is null then
    select count(*), min(id::text)::uuid into v_qtd, v_client from clients
     where not is_test and length(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g')) >= 8
       and right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 8) = right(v_whats, 8);
    if v_qtd <> 1 then v_client := null; end if;
  end if;

  if v_client is not null then
    select jsonb_build_object('name', name, 'treatment', treatment, 'display_name', display_name, 'whatsapp', whatsapp,
                              'email', email, 'document', document, 'clinic_name', clinic_name, 'address', address,
                              'city', city, 'state', state)
      into v_antes from clients where id = v_client;
    update clients set
      name = v_nome,
      treatment = coalesce(v_trat, treatment),
      display_name = coalesce(v_exib, display_name),
      whatsapp = v_whats,
      email = v_email,
      document = coalesce(v_doc, document),
      clinic_name = coalesce(v_clinica, clinic_name),
      address = coalesce(v_end, address),
      city = coalesce(v_cidade, city),
      state = coalesce(v_uf, state)
    where id = v_client;
  else
    v_novo := true;
    insert into clients (name, treatment, display_name, whatsapp, email, document, clinic_name, address, city, state, origem, stage)
    values (v_nome, v_trat, v_exib, v_whats, v_email, v_doc, v_clinica, v_end, v_cidade, v_uf, 'formulario', 'lead')
    returning id into v_client;
  end if;

  update convites_cadastro set
    preenchido_em = now(), dados = p_dados, antes = v_antes, resultado_client_id = v_client,
    cadastro_novo = v_novo, email_login = lower(nullif(btrim(p_email_login), ''))
  where id = v_cv.id;

  perform registrar_movimentacao(case when v_novo then 'criado' else 'editado' end, 'cliente', v_client,
    'Cadastro preenchido pela cliente (formulário do Planejador)',
    jsonb_build_object('antes', v_antes, 'depois', p_dados - 'senha', 'convite_id', v_cv.id));

  return jsonb_build_object('client_id', v_client, 'nome', coalesce(v_exib, v_nome), 'tratamento', v_trat, 'novo', v_novo);
end;
$$;

revoke execute on function public.criar_convite_cadastro(uuid) from public, anon;
grant execute on function public.criar_convite_cadastro(uuid) to authenticated, service_role;
revoke execute on function public.convite_cadastro_abrir(text) from public, anon, authenticated;
grant execute on function public.convite_cadastro_abrir(text) to service_role;
revoke execute on function public.convite_cadastro_receber(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.convite_cadastro_receber(text, jsonb, text) to service_role;
