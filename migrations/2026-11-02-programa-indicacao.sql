-- Programa de indicação (02/11/2026, pedido do dono).
--
-- Regras do dono:
--  - Quem indica ganha 10% de desconto quando a indicada faz a PRIMEIRA locação
--    de HIPRO (mentoria não conta). A indicada também ganha 10% na primeira locação.
--  - Um desconto por locação: 2 indicações = 10% numa locação e 10% na seguinte.
--  - O desconto vale 90 dias. Entra sozinho na finalização da locação, com opção
--    de tirar (a tela marca como usado por usar_desconto_indicacao).
--  - Cada cliente tem o seu link (/indicacao/<codigo>): a indicada preenche o
--    cadastro em até 7 dias e já fica amarrada a quem indicou.
--  - Indicação digitada no formulário que não bate com um cadastro só (nenhum
--    ou mais de um com o nome) fica em clients.indicacao_nome para o dono ligar.
--
-- Tudo novo; não altera nem apaga dado existente.

-- 1. Colunas novas.
alter table public.clients add column if not exists codigo_indicacao text;
alter table public.clients add column if not exists indicacao_nome text;
create unique index if not exists clients_codigo_indicacao_uk on public.clients (codigo_indicacao) where codigo_indicacao is not null;
comment on column public.clients.codigo_indicacao is 'Código do link de indicação da cliente (/indicacao/<codigo>), gerado por codigo_indicacao_cliente.';
comment on column public.clients.indicacao_nome is 'Nome de quem indicou, digitado no formulário, quando não deu para ligar a um cadastro só. O dono liga (definir_indicacao) ou dispensa.';

alter table public.convites_cadastro add column if not exists indicador_id uuid references public.clients(id) on delete set null;
comment on column public.convites_cadastro.indicador_id is 'Link de indicação: a cliente dona do link (a indicada fica com indicado_por = ela).';

alter table public.cliente_anotacoes drop constraint if exists cliente_anotacoes_origem_check;
alter table public.cliente_anotacoes add constraint cliente_anotacoes_origem_check
  check (origem in ('digitada', 'voz', 'assistente', 'campanha', 'formulario', 'indicacao'));

-- 2. Descontos ganhos.
create table if not exists public.descontos_indicacao (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  tipo text not null check (tipo in ('indicou', 'indicado')),
  outro_client_id uuid references public.clients(id) on delete set null,
  percentual numeric(5,2) not null default 10 check (percentual > 0 and percentual <= 100),
  valido_ate date not null,
  origem_rental_id uuid references public.rentals(id) on delete set null,
  usado_rental_id uuid references public.rentals(id) on delete set null,
  usado_em timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists descontos_indicacao_indicado_uk on public.descontos_indicacao (client_id) where tipo = 'indicado';
create unique index if not exists descontos_indicacao_indicou_uk on public.descontos_indicacao (client_id, outro_client_id) where tipo = 'indicou';
create index if not exists descontos_indicacao_cliente_idx on public.descontos_indicacao (client_id, valido_ate);
comment on table public.descontos_indicacao is
  'Descontos do programa de indicação: indicou (quem indicou, nasce na primeira locação da indicada) e indicado (a indicada, nasce ao ser ligada). 10%, 90 dias, um por locação. Escrita só pelos gatilhos e por usar/desfazer_uso_desconto_indicacao.';
alter table public.descontos_indicacao enable row level security;
drop policy if exists "descontos_indicacao_select" on public.descontos_indicacao;
create policy "descontos_indicacao_select" on public.descontos_indicacao for select using (has_module_permission('clientes'));
grant select on public.descontos_indicacao to authenticated;
drop trigger if exists trg_somente_leitura on public.descontos_indicacao;
create trigger trg_somente_leitura before insert or update or delete on public.descontos_indicacao
  for each statement execute function public.bloquear_somente_leitura();

-- 3. Nome curto (Dra. Ana) para as mensagens do link.
create or replace function public.nome_curto_cliente(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(coalesce(c.treatment || ' ', '') ||
           coalesce(nullif(btrim(c.display_name), ''), initcap(split_part(lower(btrim(c.name)), ' ', 1)))), '')
    from clients c where c.id = p_client_id;
$$;
revoke execute on function public.nome_curto_cliente(uuid) from public, anon;
grant execute on function public.nome_curto_cliente(uuid) to authenticated, service_role;

-- 4. Gatilhos.
-- 4a. A indicada ganha 10% ao ser ligada a quem indicou (se ainda não alugou).
create or replace function public.indicacao_ao_ligar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_test then return new; end if;
  if tg_op = 'UPDATE' and new.indicado_por is not distinct from old.indicado_por then return new; end if;
  if new.indicado_por is null then
    delete from descontos_indicacao where client_id = new.id and tipo = 'indicado' and usado_em is null;
    return new;
  end if;
  if exists (select 1 from descontos_indicacao where client_id = new.id and tipo = 'indicado') then
    update descontos_indicacao set outro_client_id = new.indicado_por
     where client_id = new.id and tipo = 'indicado' and usado_em is null;
    return new;
  end if;
  if exists (select 1 from rentals where client_id = new.id and status::text <> 'cancelada' and not is_test) then
    return new; -- já alugou antes: não é a primeira locação
  end if;
  insert into descontos_indicacao (client_id, tipo, outro_client_id, valido_ate)
  values (new.id, 'indicado', new.indicado_por, hoje_local() + 90)
  on conflict do nothing;
  insert into cliente_anotacoes (client_id, texto, origem)
  values (new.id, 'Ganhou 10% de desconto na primeira locação por indicação de '
    || coalesce(nome_curto_cliente(new.indicado_por), 'uma cliente') || ' (vale até '
    || to_char(hoje_local() + 90, 'DD/MM/YYYY') || ').', 'indicacao');
  return new;
end;
$$;
revoke execute on function public.indicacao_ao_ligar_cliente() from public, anon, authenticated;
drop trigger if exists trg_indicacao_ao_ligar_cliente on public.clients;
create trigger trg_indicacao_ao_ligar_cliente after insert or update of indicado_por on public.clients
  for each row execute function public.indicacao_ao_ligar_cliente();

-- 4b. Quem indicou ganha 10% quando a indicada faz a primeira locação de HIPRO.
create or replace function public.indicacao_ao_ligar_locacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_indicador uuid;
  v_ate date := hoje_local() + 90;
begin
  if new.rental_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.rental_id is not distinct from old.rental_id then return new; end if;
  if coalesce(new.is_test, false) or coalesce(new.is_mentoria, false) then return new; end if;
  if new.event_type::text not in ('hipro_1', 'hipro_2') or new.status::text = 'cancelada' then return new; end if;
  select indicado_por into v_indicador from clients where id = new.client_id and not is_test;
  if v_indicador is null then return new; end if;
  -- Primeira locação: nenhuma outra locação de HIPRO dela que conte.
  if exists (
    select 1 from rentals r
     where r.client_id = new.client_id and r.id <> new.rental_id
       and r.status::text <> 'cancelada' and not r.is_test
       and not exists (select 1 from calendar_events ce where ce.rental_id = r.id and coalesce(ce.is_mentoria, false))
  ) then
    return new;
  end if;
  insert into descontos_indicacao (client_id, tipo, outro_client_id, valido_ate, origem_rental_id)
  values (v_indicador, 'indicou', new.client_id, v_ate, new.rental_id)
  on conflict do nothing;
  if found then
    insert into cliente_anotacoes (client_id, texto, origem)
    values (v_indicador, 'Ganhou 10% de desconto na próxima locação: ' || coalesce(nome_curto_cliente(new.client_id), 'a indicada')
      || ' fez a primeira locação (vale até ' || to_char(v_ate, 'DD/MM/YYYY') || ').', 'indicacao');
  end if;
  return new;
end;
$$;
revoke execute on function public.indicacao_ao_ligar_locacao() from public, anon, authenticated;
drop trigger if exists trg_indicacao_ao_ligar_locacao on public.calendar_events;
create trigger trg_indicacao_ao_ligar_locacao after insert or update of rental_id on public.calendar_events
  for each row execute function public.indicacao_ao_ligar_locacao();

-- 4c. Locação cancelada: some o desconto que ela gerou (se não foi usado) e volta o que foi usado nela.
create or replace function public.indicacao_ao_cancelar_locacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status::text = 'cancelada' and old.status::text is distinct from 'cancelada' then
    delete from descontos_indicacao where origem_rental_id = new.id and usado_em is null;
    update descontos_indicacao set usado_em = null, usado_rental_id = null where usado_rental_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.indicacao_ao_cancelar_locacao() from public, anon, authenticated;
drop trigger if exists trg_indicacao_ao_cancelar_locacao on public.rentals;
create trigger trg_indicacao_ao_cancelar_locacao after update of status on public.rentals
  for each row execute function public.indicacao_ao_cancelar_locacao();

-- 5. Funções das telas.
create or replace function public.usar_desconto_indicacao(p_desconto_id uuid, p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d descontos_indicacao%rowtype;
  v_client uuid;
begin
  if not (has_module_permission('agenda') or has_module_permission('financeiro')) then
    raise exception 'Sem permissão.';
  end if;
  select * into d from descontos_indicacao where id = p_desconto_id for update;
  if d.id is null then raise exception 'Desconto não encontrado.'; end if;
  if d.usado_em is not null then raise exception 'Este desconto já foi usado.'; end if;
  if d.valido_ate < hoje_local() then raise exception 'Este desconto venceu em %.', to_char(d.valido_ate, 'DD/MM/YYYY'); end if;
  select client_id into v_client from rentals where id = p_rental_id;
  if v_client is null then raise exception 'Locação não encontrada.'; end if;
  if v_client <> d.client_id then raise exception 'O desconto é de outra cliente.'; end if;
  update descontos_indicacao set usado_em = now(), usado_rental_id = p_rental_id where id = d.id;
  perform registrar_movimentacao('editado', 'cliente', d.client_id, 'Desconto de indicação de ' || d.percentual || '% usado na locação',
    jsonb_build_object('desconto_id', d.id, 'rental_id', p_rental_id));
end;
$$;
revoke execute on function public.usar_desconto_indicacao(uuid, uuid) from public, anon;
grant execute on function public.usar_desconto_indicacao(uuid, uuid) to authenticated, service_role;

create or replace function public.desfazer_uso_desconto_indicacao(p_desconto_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d descontos_indicacao%rowtype;
begin
  if not has_module_permission('configuracoes') then raise exception 'Só o administrador desfaz o uso do desconto.'; end if;
  update descontos_indicacao set usado_em = null, usado_rental_id = null where id = p_desconto_id and usado_em is not null returning * into d;
  if d.id is null then raise exception 'Desconto não encontrado ou ainda não usado.'; end if;
  perform registrar_movimentacao('editado', 'cliente', d.client_id, 'Uso do desconto de indicação desfeito',
    jsonb_build_object('desconto_id', d.id));
end;
$$;
revoke execute on function public.desfazer_uso_desconto_indicacao(uuid) from public, anon;
grant execute on function public.desfazer_uso_desconto_indicacao(uuid) to authenticated, service_role;

-- Código do link da cliente (cria na primeira vez).
create or replace function public.codigo_indicacao_cliente(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_letras text := 'abcdefghjkmnpqrstuvwxyz23456789';
  i int;
begin
  if not has_module_permission('clientes') then raise exception 'Sem permissão.'; end if;
  select codigo_indicacao into v_codigo from clients where id = p_client_id;
  if not found then raise exception 'Cliente não encontrada.'; end if;
  if v_codigo is not null then return v_codigo; end if;
  loop
    v_codigo := '';
    for i in 1..8 loop
      v_codigo := v_codigo || substr(v_letras, 1 + floor(random() * length(v_letras))::int, 1);
    end loop;
    exit when not exists (select 1 from clients where codigo_indicacao = v_codigo);
  end loop;
  update clients set codigo_indicacao = v_codigo where id = p_client_id;
  return v_codigo;
end;
$$;
revoke execute on function public.codigo_indicacao_cliente(uuid) from public, anon;
grant execute on function public.codigo_indicacao_cliente(uuid) to authenticated, service_role;

-- O dono liga a indicação que ficou pendente (ou troca quem indicou).
create or replace function public.definir_indicacao(p_client_id uuid, p_indicador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('clientes') then raise exception 'Sem permissão.'; end if;
  if p_indicador_id is not null and p_indicador_id = p_client_id then raise exception 'A cliente não pode indicar a si mesma.'; end if;
  if p_indicador_id is not null and not exists (select 1 from clients where id = p_indicador_id) then
    raise exception 'Quem indicou não foi encontrado.';
  end if;
  update clients set indicado_por = p_indicador_id, indicacao_nome = null where id = p_client_id;
  if not found then raise exception 'Cliente não encontrada.'; end if;
  perform registrar_movimentacao('editado', 'cliente', p_client_id, descrever_registro('clients', p_client_id),
    jsonb_build_object('acao_detalhada', case when p_indicador_id is null then 'Indicação retirada'
      else 'Indicada por ' || coalesce(nome_curto_cliente(p_indicador_id), '') end));
end;
$$;
revoke execute on function public.definir_indicacao(uuid, uuid) from public, anon;
grant execute on function public.definir_indicacao(uuid, uuid) to authenticated, service_role;

create or replace function public.dispensar_indicacao_nome(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('clientes') then raise exception 'Sem permissão.'; end if;
  update clients set indicacao_nome = null where id = p_client_id;
end;
$$;
revoke execute on function public.dispensar_indicacao_nome(uuid) from public, anon;
grant execute on function public.dispensar_indicacao_nome(uuid) to authenticated, service_role;

-- 6. Link de indicação (só a Edge Function cadastro-cliente chama, como service_role).
create or replace function public.indicacao_abrir(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when c.id is null then jsonb_build_object('valido', false, 'motivo', 'Link de indicação inválido.')
              else jsonb_build_object('valido', true, 'indicador_nome', nome_curto_cliente(c.id)) end
    from (select 1) x
    left join clients c on c.codigo_indicacao = lower(btrim(p_codigo)) and not c.is_test;
$$;
revoke execute on function public.indicacao_abrir(text) from public, anon, authenticated;
grant execute on function public.indicacao_abrir(text) to service_role;

create or replace function public.indicacao_criar_convite(p_codigo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_indicador uuid;
  v_token text;
begin
  select id into v_indicador from clients where codigo_indicacao = lower(btrim(p_codigo)) and not is_test;
  if v_indicador is null then raise exception 'Link de indicação inválido.'; end if;
  -- Freio contra robô: no máximo 100 links abertos por dia para a mesma cliente.
  if (select count(*) from convites_cadastro where indicador_id = v_indicador and created_at > now() - interval '1 day') >= 100 then
    raise exception 'Muitos acessos a este link hoje. Tente amanhã.';
  end if;
  insert into convites_cadastro (client_id, indicador_id, expira_em, criado_por)
  values (null, v_indicador, now() + interval '7 days', null)
  returning token into v_token;
  return v_token;
end;
$$;
revoke execute on function public.indicacao_criar_convite(text) from public, anon, authenticated;
grant execute on function public.indicacao_criar_convite(text) to service_role;

-- 7. Formulário: abre com o nome de quem indicou e o prazo; recebe amarrando a indicação.
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
    when cv.expira_em <= now() and cv.indicador_id is not null then jsonb_build_object('valido', false, 'motivo', 'O prazo de 7 dias para garantir o desconto da indicação acabou. Fale com a Harmonize.')
    when cv.expira_em <= now() then jsonb_build_object('valido', false, 'motivo', 'Este link venceu. Peça um novo para a Harmonize.')
    else jsonb_build_object('valido', true,
           'tratamento', c.treatment, 'nome_exibicao', c.display_name, 'whatsapp', c.whatsapp, 'email', c.email,
           -- O resto da ficha, para o formulário já vir preenchido (02/11/2026).
           'nome_completo', c.name, 'documento', c.document, 'clinica', c.clinic_name,
           'endereco', c.address, 'cidade', c.city, 'uf', c.state,
           -- Link de indicação de uma cliente (programa de indicação, 02/11/2026).
           'indicacao', cv.indicador_id is not null,
           'indicador_nome', nome_curto_cliente(cv.indicador_id),
           'expira_em', cv.expira_em)
  end
  from (select 1) x
  left join convites_cadastro cv on cv.token = p_token
  left join clients c on c.id = cv.client_id;
$$;

revoke execute on function public.convite_cadastro_abrir(text) from public, anon, authenticated;
grant execute on function public.convite_cadastro_abrir(text) to service_role;

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
  v_indicador uuid;
  v_qtd_ind int;
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
  v_indicador := v_cv.indicador_id;
  -- Pelo link de indicação, a origem é sempre "indicacao" e quem indicou é a dona do link.
  if v_indicador is not null then
    v_origem := 'indicacao';
    v_origem_rotulo := coalesce(v_origem_rotulo, 'Indicação');
    v_indicou := null;
  end if;

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

  -- Link de indicação: amarra direto em quem indicou (o gatilho cria o desconto da indicada).
  if v_indicador is not null and v_indicador <> v_client then
    update clients set indicado_por = v_indicador, indicacao_nome = null
     where id = v_client and indicado_por is null;
  end if;
  -- Quem indicou, digitado no formulário: liga à ficha só quando um único cadastro tem
  -- exatamente esse nome; senão (nenhum ou mais de um) guarda o nome para o dono ligar.
  if v_indicou is not null then
    select count(*), min(id::text)::uuid into v_qtd_ind, v_indicou_id from clients
     where not is_test and id <> v_client
       and (normalizar_nome_paciente(name) = normalizar_nome_paciente(v_indicou)
            or normalizar_nome_paciente(display_name) = normalizar_nome_paciente(v_indicou));
    if v_qtd_ind = 1 then
      update clients set indicado_por = v_indicou_id, indicacao_nome = null where id = v_client and indicado_por is null;
    else
      update clients set indicacao_nome = v_indicou where id = v_client and indicado_por is null;
    end if;
  end if;
  if v_origem is not null then
    v_nota := case when v_indicador is not null
      then 'Pelo link de indicação de ' || coalesce(nome_curto_cliente(v_indicador), 'uma cliente') || ' (10% de desconto na primeira locação).'
      else 'Pelo formulário: conheceu a Harmonize por '
        || case when v_indicou is not null then 'indicação de ' || v_indicou
                else coalesce(v_origem_rotulo, v_origem) end || '.' end;
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

-- 8. Indicações que já chegaram pelo formulário sem ficha ligada: guarda o nome
--    digitado para o dono ligar (só preenche a coluna nova, nada mais muda).
update clients c set indicacao_nome = left(btrim(cv.dados ->> 'indicado_por'), 120)
  from convites_cadastro cv
 where cv.resultado_client_id = c.id
   and cv.dados ->> 'como_conheceu' = 'indicacao'
   and coalesce(btrim(cv.dados ->> 'indicado_por'), '') <> ''
   and c.indicado_por is null
   and c.indicacao_nome is null;
