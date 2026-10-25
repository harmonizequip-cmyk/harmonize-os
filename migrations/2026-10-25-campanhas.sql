-- Campanhas: arte e mensagem enviadas uma a uma pelo WhatsApp (25/10/2026)
-- Pedido do dono: um público escolhido recebe a mesma arte e a mesma mensagem.
-- Nada sai sozinho: o dono toca em cada contato e marca o que aconteceu.
--   1. campanhas: nome, mensagem, arte (caminho no Storage), filtros do
--      público (jsonb), limite diário (1 a 100, padrão 15) e arquivada.
--   2. campanha_envios: um por cliente e campanha, com o status
--      (enviado, respondeu, agendou, nao_quer, pulado) e o texto exato enviado.
--   3. Escrita só pelas funções salvar_campanha, arquivar_campanha,
--      excluir_campanha, registrar_envio_campanha e desfazer_envio_campanha.
--   4. Pasta privada "campanhas" no Storage para as artes (mesmo padrão de
--      "comprovantes"; quem é só de visualização já fica barrado pelas
--      políticas restritivas gerais de storage.objects).
-- Aditivo: não apaga nem altera dados existentes.

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  mensagem text not null check (length(btrim(mensagem)) between 1 and 2000),
  arte_path text check (arte_path is null or arte_path ~ '^arte/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$'),
  arte_nome text check (arte_nome is null or length(arte_nome) <= 200),
  filtros jsonb not null default '{}'::jsonb check (jsonb_typeof(filtros) = 'object'),
  limite_diario integer not null default 15 check (limite_diario between 1 and 100),
  arquivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);
create index if not exists campanhas_lista_idx on public.campanhas (arquivada, created_at desc);

comment on table public.campanhas is
  'Campanhas de WhatsApp enviadas um a um (arte fixa + mensagem com {saudacao}, {nome}, {cidade}). Público em filtros (jsonb, regras em lib/campanhas.ts). Escrita só por salvar_campanha, arquivar_campanha e excluir_campanha.';

create table if not exists public.campanha_envios (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null check (status in ('enviado', 'respondeu', 'agendou', 'nao_quer', 'pulado')),
  mensagem text check (mensagem is null or length(mensagem) <= 4000),
  enviado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (campanha_id, client_id)
);
create index if not exists campanha_envios_campanha_idx on public.campanha_envios (campanha_id, status);
create index if not exists campanha_envios_cliente_idx on public.campanha_envios (client_id);

comment on table public.campanha_envios is
  'Um envio por campanha e cliente: enviado (com o texto exato), respondeu, agendou, nao_quer (sai de TODAS as campanhas) ou pulado. Escrita só por registrar_envio_campanha e desfazer_envio_campanha.';

alter table public.campanhas enable row level security;
alter table public.campanha_envios enable row level security;
drop policy if exists "campanhas_select" on public.campanhas;
create policy "campanhas_select" on public.campanhas for select
  using (has_module_permission('clientes'));
drop policy if exists "campanha_envios_select" on public.campanha_envios;
create policy "campanha_envios_select" on public.campanha_envios for select
  using (has_module_permission('clientes'));
grant select on public.campanhas to authenticated;
grant select on public.campanha_envios to authenticated;
revoke all on public.campanhas from anon;
revoke all on public.campanha_envios from anon;

drop trigger if exists trg_somente_leitura on public.campanhas;
create trigger trg_somente_leitura before insert or update or delete on public.campanhas
  for each statement execute function public.bloquear_somente_leitura();
drop trigger if exists trg_somente_leitura on public.campanha_envios;
create trigger trg_somente_leitura before insert or update or delete on public.campanha_envios
  for each statement execute function public.bloquear_somente_leitura();

-- Cria (p_id nulo) ou altera uma campanha. A mensagem só aceita as variáveis
-- {saudacao}, {nome} e {cidade} (a tela confere antes; aqui é a garantia).
create or replace function public.salvar_campanha(
  p_id uuid,
  p_nome text,
  p_mensagem text,
  p_arte_path text default null,
  p_arte_nome text default null,
  p_filtros jsonb default '{}'::jsonb,
  p_limite_diario integer default 15
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_msg text := btrim(replace(coalesce(p_mensagem, ''), E'\r', ''));
  v_arte text := nullif(btrim(coalesce(p_arte_path, '')), '');
  v_arte_nome text := left(nullif(btrim(coalesce(p_arte_nome, '')), ''), 200);
  v_filtros jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_limite integer := coalesce(p_limite_diario, 15);
  v_antes campanhas%rowtype;
  v_id uuid;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para mexer em campanhas.';
  end if;
  if v_nome = '' or length(v_nome) > 80 then
    raise exception 'Dê um nome curto à campanha (até 80 caracteres).';
  end if;
  if v_msg = '' then
    raise exception 'Escreva a mensagem da campanha.';
  end if;
  if length(v_msg) > 2000 then
    raise exception 'Mensagem longa demais (máximo 2.000 caracteres).';
  end if;
  if regexp_replace(v_msg, '\{(saudacao|nome|cidade)\}', '', 'g') ~ '[{}]' then
    raise exception 'A mensagem tem variável desconhecida ou chave sem par. Use só {saudacao}, {nome} e {cidade}.';
  end if;
  if v_arte is not null and v_arte !~ '^arte/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$' then
    raise exception 'Caminho da arte inválido.';
  end if;
  if jsonb_typeof(v_filtros) <> 'object' then
    raise exception 'Filtros do público inválidos.';
  end if;
  if v_limite not between 1 and 100 then
    raise exception 'O limite diário vai de 1 a 100 envios.';
  end if;
  if v_arte is null then
    v_arte_nome := null;
  end if;

  if p_id is null then
    insert into campanhas (nome, mensagem, arte_path, arte_nome, filtros, limite_diario, created_by)
    values (v_nome, v_msg, v_arte, v_arte_nome, v_filtros, v_limite, auth.uid())
    returning id into v_id;
    perform registrar_movimentacao('criado', 'campanha', v_id,
      'Campanha criada: ' || v_nome,
      jsonb_build_object('limite_diario', v_limite, 'com_arte', v_arte is not null));
    return v_id;
  end if;

  select * into v_antes from campanhas where id = p_id for update;
  if not found then
    raise exception 'Campanha não encontrada.';
  end if;
  update campanhas
     set nome = v_nome, mensagem = v_msg, arte_path = v_arte, arte_nome = v_arte_nome,
         filtros = v_filtros, limite_diario = v_limite, updated_at = now()
   where id = p_id;
  perform registrar_movimentacao('editado', 'campanha', p_id,
    'Campanha alterada: ' || v_nome,
    jsonb_build_object(
      'antes', jsonb_build_object('nome', v_antes.nome, 'mensagem', v_antes.mensagem, 'arte_path', v_antes.arte_path,
                                  'limite_diario', v_antes.limite_diario, 'filtros', v_antes.filtros),
      'depois', jsonb_build_object('nome', v_nome, 'mensagem', v_msg, 'arte_path', v_arte,
                                   'limite_diario', v_limite, 'filtros', v_filtros)));
  return p_id;
end;
$$;

-- Arquiva ou desarquiva (alterna). Devolve o novo estado.
create or replace function public.arquivar_campanha(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c campanhas%rowtype;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para mexer em campanhas.';
  end if;
  select * into v_c from campanhas where id = p_id for update;
  if not found then
    raise exception 'Campanha não encontrada.';
  end if;
  update campanhas set arquivada = not v_c.arquivada, updated_at = now() where id = p_id;
  perform registrar_movimentacao('editado', 'campanha', p_id,
    case when v_c.arquivada then 'Campanha desarquivada: ' else 'Campanha arquivada: ' end || v_c.nome,
    jsonb_build_object('arquivada', not v_c.arquivada));
  return not v_c.arquivada;
end;
$$;

-- Apaga só campanha sem nenhum envio registrado; com envios, arquivar.
-- Devolve o caminho da arte para a tela apagar o arquivo do Storage.
create or replace function public.excluir_campanha(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c campanhas%rowtype;
  v_qtd int;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para mexer em campanhas.';
  end if;
  select * into v_c from campanhas where id = p_id for update;
  if not found then
    raise exception 'Campanha não encontrada.';
  end if;
  select count(*) into v_qtd from campanha_envios where campanha_id = p_id;
  if v_qtd > 0 then
    raise exception 'A campanha "%" já tem % envio(s) registrado(s): arquive em vez de apagar.', v_c.nome, v_qtd;
  end if;
  delete from campanhas where id = p_id;
  perform registrar_movimentacao('excluido', 'campanha', p_id,
    'Campanha apagada: ' || v_c.nome,
    jsonb_build_object('mensagem', v_c.mensagem, 'arte_path', v_c.arte_path));
  return v_c.arte_path;
end;
$$;

-- Cria ou atualiza o envio de uma cliente numa campanha. 'enviado' grava a
-- hora do envio (a primeira) e o texto exato; os outros status mantêm a hora.
-- Campanha arquivada não recebe envio novo (só muda o que já existe).
create or replace function public.registrar_envio_campanha(
  p_campanha uuid,
  p_client uuid,
  p_status text,
  p_mensagem text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_msg text := nullif(btrim(coalesce(p_mensagem, '')), '');
  v_c campanhas%rowtype;
  v_cliente text;
  v_antes campanha_envios%rowtype;
  v_id uuid;
  v_rotulo text;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para registrar envios de campanha.';
  end if;
  if v_status not in ('enviado', 'respondeu', 'agendou', 'nao_quer', 'pulado') then
    raise exception 'Situação inválida.';
  end if;
  if v_msg is not null and length(v_msg) > 4000 then
    raise exception 'Mensagem longa demais.';
  end if;
  select * into v_c from campanhas where id = p_campanha;
  if not found then
    raise exception 'Campanha não encontrada.';
  end if;
  select name into v_cliente from clients where id = p_client;
  if v_cliente is null then
    raise exception 'Cliente não encontrada.';
  end if;
  if v_status = 'enviado' and v_msg is null then
    raise exception 'Mensagem vazia.';
  end if;

  v_rotulo := case v_status
    when 'enviado' then 'enviada para '
    when 'respondeu' then 'respondida por '
    when 'agendou' then 'virou agendamento de '
    when 'nao_quer' then 'recusada (não quer receber) por '
    else 'pulada para ' end;

  select * into v_antes from campanha_envios where campanha_id = p_campanha and client_id = p_client for update;
  if not found then
    if v_c.arquivada then
      raise exception 'Campanha arquivada: desarquive para continuar enviando.';
    end if;
    insert into campanha_envios (campanha_id, client_id, status, mensagem, enviado_em, atualizado_em)
    values (p_campanha, p_client, v_status, v_msg,
            case when v_status = 'enviado' then now() end, now())
    returning id into v_id;
    perform registrar_movimentacao('criado', 'envio_campanha', v_id,
      'Campanha "' || v_c.nome || '" ' || v_rotulo || v_cliente,
      jsonb_build_object('client_id', p_client, 'campanha_id', p_campanha, 'status', v_status));
    return v_id;
  end if;

  update campanha_envios
     set status = v_status,
         mensagem = coalesce(v_msg, mensagem),
         enviado_em = case when v_status = 'enviado' then coalesce(enviado_em, now()) else enviado_em end,
         atualizado_em = now()
   where id = v_antes.id;
  perform registrar_movimentacao('editado', 'envio_campanha', v_antes.id,
    'Campanha "' || v_c.nome || '" ' || v_rotulo || v_cliente,
    jsonb_build_object('client_id', p_client, 'campanha_id', p_campanha, 'antes', v_antes.status, 'depois', v_status));
  return v_antes.id;
end;
$$;

-- Desfaz o envio (apaga a linha): a cliente volta para a fila da campanha.
create or replace function public.desfazer_envio_campanha(p_campanha uuid, p_client uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e campanha_envios%rowtype;
  v_nome_campanha text;
  v_cliente text;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para mexer em envios de campanha.';
  end if;
  select * into v_e from campanha_envios where campanha_id = p_campanha and client_id = p_client for update;
  if not found then
    raise exception 'Envio não encontrado.';
  end if;
  select nome into v_nome_campanha from campanhas where id = p_campanha;
  select name into v_cliente from clients where id = p_client;
  delete from campanha_envios where id = v_e.id;
  perform registrar_movimentacao('excluido', 'envio_campanha', v_e.id,
    'Envio desfeito: campanha "' || coalesce(v_nome_campanha, '') || '" para ' || coalesce(v_cliente, 'cliente'),
    jsonb_build_object('client_id', p_client, 'campanha_id', p_campanha, 'status', v_e.status,
                       'mensagem', v_e.mensagem, 'enviado_em', v_e.enviado_em));
end;
$$;

revoke execute on function public.salvar_campanha(uuid, text, text, text, text, jsonb, integer) from public, anon;
revoke execute on function public.arquivar_campanha(uuid) from public, anon;
revoke execute on function public.excluir_campanha(uuid) from public, anon;
revoke execute on function public.registrar_envio_campanha(uuid, uuid, text, text) from public, anon;
revoke execute on function public.desfazer_envio_campanha(uuid, uuid) from public, anon;
grant execute on function public.salvar_campanha(uuid, text, text, text, text, jsonb, integer) to authenticated, service_role;
grant execute on function public.arquivar_campanha(uuid) to authenticated, service_role;
grant execute on function public.excluir_campanha(uuid) to authenticated, service_role;
grant execute on function public.registrar_envio_campanha(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.desfazer_envio_campanha(uuid, uuid) to authenticated, service_role;

-- Pasta privada "campanhas" no Storage (artes das campanhas), com o módulo
-- clientes. Mesmo padrão de "comprovantes". As políticas restritivas gerais
-- (somente_leitura_nao_envia/altera/apaga) já barram quem é só de visualização.
do $campanhas$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sem Storage do Supabase: pasta de campanhas não criada.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('campanhas', 'campanhas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "campanhas_ler" on storage.objects;
  drop policy if exists "campanhas_enviar" on storage.objects;
  drop policy if exists "campanhas_apagar" on storage.objects;

  create policy "campanhas_ler" on storage.objects for select to authenticated
    using (bucket_id = 'campanhas' and public.has_module_permission('clientes'));
  create policy "campanhas_enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'campanhas' and public.has_module_permission('clientes'));
  create policy "campanhas_apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'campanhas' and public.has_module_permission('clientes'));
end
$campanhas$;
