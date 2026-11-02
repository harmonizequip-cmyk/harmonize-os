-- Formulário de cadastro da cliente: "Como conheceu a Harmonize?" (02/11/2026).
--
-- O formulário (/cadastro/<token>) pergunta como ela conheceu a Harmonize e,
-- se foi indicação, o nome de quem indicou. convite_cadastro_receber passa a:
--  - gravar a origem na ficha (lead novo já nasce com ela; ficha existente só
--    recebe se ainda não tinha origem ou se era "formulario");
--  - ligar clients.indicado_por quando um único cadastro tem exatamente o nome
--    informado (sem acento nem maiúscula); senão fica só na anotação;
--  - criar uma anotação da cliente (origem nova 'formulario') com a resposta.
-- Mesma assinatura e mesmas permissões (só service_role). Não altera dado existente.
--
-- convite_cadastro_abrir passa a devolver também nome completo, documento,
-- clínica, endereço, cidade e UF da ficha ligada ao link, para o formulário
-- já vir preenchido quando o dono puxa um lead ou cliente que já existe.

alter table public.cliente_anotacoes drop constraint if exists cliente_anotacoes_origem_check;
alter table public.cliente_anotacoes add constraint cliente_anotacoes_origem_check
  check (origem in ('digitada', 'voz', 'assistente', 'campanha', 'formulario'));

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
  -- Como conheceu a Harmonize (código da lista de origens) e, se foi indicação, quem indicou.
  v_origem text := lower(nullif(btrim(p_dados ->> 'como_conheceu'), ''));
  v_origem_rotulo text := left(nullif(btrim(p_dados ->> 'como_conheceu_rotulo'), ''), 40);
  v_indicou text := left(nullif(btrim(p_dados ->> 'indicado_por'), ''), 120);
  v_indicou_id uuid;
  v_nota text;
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
  if v_origem is not null and v_origem !~ '^[a-z0-9_]{1,40}$' then v_origem := null; v_origem_rotulo := null; end if;
  if v_origem is distinct from 'indicacao' then v_indicou := null; end if;

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
      state = coalesce(v_uf, state),
      -- A resposta dela vale quando a ficha ainda não tinha origem (ou só "formulário").
      origem = case when origem is null or origem = 'formulario' then coalesce(v_origem, origem) else origem end
    where id = v_client;
  else
    v_novo := true;
    insert into clients (name, treatment, display_name, whatsapp, email, document, clinic_name, address, city, state, origem, stage)
    values (v_nome, v_trat, v_exib, v_whats, v_email, v_doc, v_clinica, v_end, v_cidade, v_uf, coalesce(v_origem, 'formulario'), 'lead')
    returning id into v_client;
  end if;

  -- Quem indicou: liga à ficha só quando um único cadastro tem exatamente esse nome.
  if v_indicou is not null then
    select min(id::text)::uuid into v_indicou_id from clients
     where not is_test and id <> v_client
       and (normalizar_nome_paciente(name) = normalizar_nome_paciente(v_indicou)
            or normalizar_nome_paciente(display_name) = normalizar_nome_paciente(v_indicou))
    having count(*) = 1;
    if v_indicou_id is not null then
      update clients set indicado_por = v_indicou_id where id = v_client and indicado_por is null;
    end if;
  end if;
  if v_origem is not null then
    v_nota := 'Pelo formulário: conheceu a Harmonize por '
      || case when v_indicou is not null then 'indicação de ' || v_indicou
              else coalesce(v_origem_rotulo, v_origem) end || '.';
    insert into cliente_anotacoes (client_id, texto, origem) values (v_client, v_nota, 'formulario');
  end if;

  update convites_cadastro set
    preenchido_em = now(), dados = p_dados, antes = v_antes, resultado_client_id = v_client,
    cadastro_novo = v_novo, email_login = lower(nullif(btrim(p_email_login), ''))
  where id = v_cv.id;

  perform registrar_movimentacao(case when v_novo then 'criado' else 'editado' end, 'cliente', v_client,
    'Cadastro preenchido pela cliente (formulário do Planejador)',
    jsonb_build_object('antes', v_antes, 'depois', p_dados - 'senha', 'convite_id', v_cv.id));

  return jsonb_build_object('client_id', v_client, 'nome', coalesce(v_exib, v_nome), 'tratamento', v_trat, 'novo', v_novo,
    'como_conheceu', coalesce(v_origem_rotulo, v_origem), 'indicado_por', v_indicou);
end;
$$;

revoke execute on function public.convite_cadastro_receber(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.convite_cadastro_receber(text, jsonb, text) to service_role;

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
           'tratamento', c.treatment, 'nome_exibicao', c.display_name, 'whatsapp', c.whatsapp, 'email', c.email,
           -- O resto da ficha, para o formulário já vir preenchido (02/11/2026).
           'nome_completo', c.name, 'documento', c.document, 'clinica', c.clinic_name,
           'endereco', c.address, 'cidade', c.city, 'uf', c.state)
  end
  from (select 1) x
  left join convites_cadastro cv on cv.token = p_token
  left join clients c on c.id = cv.client_id;
$$;

revoke execute on function public.convite_cadastro_abrir(text) from public, anon, authenticated;
grant execute on function public.convite_cadastro_abrir(text) to service_role;
