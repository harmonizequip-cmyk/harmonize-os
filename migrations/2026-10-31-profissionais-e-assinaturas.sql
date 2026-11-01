-- Profissionais da clínica e assinatura da sessão no Planejador HIPRO
-- (pedidos do dono, 31/10/2026).
--
-- A) Profissionais: cada cliente (clínica) cadastra as profissionais que
--    atendem (ex.: três atendentes). No planejamento, em vez de escrever o
--    nome toda vez, escolhe uma da lista ou cria mais uma. O planejamento
--    continua guardando o nome em estado.profissional (o prontuário antigo
--    sai igual) e passa a guardar também estado.profissionalId e
--    estado.profissionalRegistro (retrato da época; renomear depois não muda
--    planejamento feito). salvar_planejamento não muda.
--    O dono e a equipe com acesso à agenda veem todas; o login de cliente
--    (portal) vê e grava só as da clínica dela.
--    Os nomes já digitados nos planejamentos viram cadastro (um por cliente
--    e nome, sem duplicar).
--
-- B) Assinatura da sessão: o paciente e a profissional assinam com o dedo na
--    tela do celular do dono. Cada assinatura guarda a imagem (pasta privada
--    "assinaturas" do Storage, s/<planejamento>/<sessao>/<papel>-<id>.png),
--    o resumo assinado (resumo) e o sha256 desse resumo (conteudo_hash), para
--    a tela avisar quando a sessão mudou depois de assinada. Só o dono
--    (pode_assinar_sessao: admin ativo, não visualização, não cliente); nada
--    no portal por enquanto. Assinar de novo substitui a anterior (a função
--    devolve o caminho do arquivo antigo para a tela apagar); o histórico fica
--    nas movimentações.
--
-- Pode rodar mais de uma vez.

-- ============================================================
-- A) PROFISSIONAIS
-- ============================================================

create table if not exists public.profissionais (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nome text not null check (btrim(nome) <> '' and length(nome) <= 120),
  registro text check (registro is null or length(registro) <= 60),
  ativo boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Nome único por clínica, sem acento, maiúscula nem espaço sobrando (mesma regra dos pacientes).
create unique index if not exists profissionais_cliente_nome_uidx
  on public.profissionais (client_id, public.normalizar_nome_paciente(nome));
alter table public.profissionais enable row level security;
drop policy if exists "profissionais_select" on public.profissionais;
create policy "profissionais_select" on public.profissionais for select
  using (has_module_permission('agenda'));
drop policy if exists "profissionais_select_cliente" on public.profissionais;
create policy "profissionais_select_cliente" on public.profissionais for select
  using (client_id = public.cliente_do_usuario());
revoke all on public.profissionais from anon;
grant select on public.profissionais to authenticated;
drop trigger if exists trg_somente_leitura on public.profissionais;
create trigger trg_somente_leitura before insert or update or delete on public.profissionais
  for each statement execute function public.bloquear_somente_leitura();
comment on table public.profissionais is
  'Profissionais de cada clínica (cliente) que atendem os pacientes do Planejador HIPRO. O planejamento guarda o nome em estado.profissional e o id em estado.profissionalId. Escrita só por salvar_profissional e excluir_profissional.';

-- Criar ou editar. Login de cliente: sempre na clínica dela. Criar com um nome
-- que já existe na clínica devolve o cadastro que existe (e o reativa).
create or replace function public.salvar_profissional(
  p_id uuid,
  p_client_id uuid,
  p_nome text,
  p_registro text default null,
  p_ativo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := cliente_do_usuario();
  v_client_id uuid := p_client_id;
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_registro text := nullif(btrim(regexp_replace(coalesce(p_registro, ''), '\s+', ' ', 'g')), '');
  v_id uuid := p_id;
  v_existe profissionais%rowtype;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para cadastrar profissionais.';
  end if;
  if v_nome is null then raise exception 'Escreva o nome da profissional.'; end if;
  if length(v_nome) > 120 then raise exception 'Nome grande demais.'; end if;
  if length(coalesce(v_registro, '')) > 60 then raise exception 'Registro grande demais.'; end if;
  if v_cliente is not null then v_client_id := v_cliente; end if;

  if v_id is null then
    if v_client_id is null or not exists (select 1 from clients where id = v_client_id) then
      raise exception 'Escolha a cliente (clínica) da profissional.';
    end if;
    select * into v_existe from profissionais
     where client_id = v_client_id and normalizar_nome_paciente(nome) = normalizar_nome_paciente(v_nome);
    if v_existe.id is not null then
      update profissionais set
        ativo = true,
        registro = coalesce(v_registro, registro),
        updated_at = now()
       where id = v_existe.id;
      return v_existe.id;
    end if;
    insert into profissionais (client_id, nome, registro, ativo)
    values (v_client_id, v_nome, v_registro, coalesce(p_ativo, true))
    returning id into v_id;
    perform registrar_movimentacao('criado', 'profissional', v_id,
      'Profissional cadastrada: ' || v_nome
        || case when v_cliente is not null then ' (pela cliente)' else '' end,
      jsonb_build_object('client_id', v_client_id, 'registro', v_registro));
  else
    select * into v_existe from profissionais where id = v_id and (v_cliente is null or client_id = v_cliente);
    if v_existe.id is null then raise exception 'Profissional não encontrada.'; end if;
    if exists (select 1 from profissionais
                where client_id = v_existe.client_id and id <> v_id
                  and normalizar_nome_paciente(nome) = normalizar_nome_paciente(v_nome)) then
      raise exception 'Já existe uma profissional com esse nome nesta clínica.';
    end if;
    update profissionais set
      nome = v_nome,
      registro = v_registro,
      ativo = coalesce(p_ativo, ativo),
      updated_at = now()
     where id = v_id;
    perform registrar_movimentacao('editado', 'profissional', v_id,
      'Profissional atualizada: ' || v_nome
        || case when not coalesce(p_ativo, v_existe.ativo) then ' (desativada)' else '' end,
      jsonb_build_object('client_id', v_existe.client_id, 'registro', v_registro, 'ativo', coalesce(p_ativo, v_existe.ativo)));
  end if;
  return v_id;
end;
$$;
revoke execute on function public.salvar_profissional(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.salvar_profissional(uuid, uuid, text, text, boolean) to authenticated, service_role;

-- Apaga só a que nunca foi usada (em planejamento, pelo id ou pelo nome, ou
-- em assinatura); a usada é desativada. Devolve 'excluida' ou 'desativada'.
create or replace function public.excluir_profissional(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := cliente_do_usuario();
  v profissionais%rowtype;
  v_usada boolean;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para excluir profissionais.';
  end if;
  select * into v from profissionais where id = p_id and (v_cliente is null or client_id = v_cliente);
  if v.id is null then raise exception 'Profissional não encontrada.'; end if;

  v_usada := exists (
      select 1 from planejamentos pl
       where pl.client_id = v.client_id
         and (pl.estado ->> 'profissionalId' = v.id::text
              or normalizar_nome_paciente(pl.estado ->> 'profissional') = normalizar_nome_paciente(v.nome)))
    or exists (select 1 from assinaturas_sessao a where a.profissional_id = v.id);

  if v_usada then
    update profissionais set ativo = false, updated_at = now() where id = v.id;
    perform registrar_movimentacao('editado', 'profissional', v.id,
      'Profissional desativada (já usada em planejamento): ' || v.nome, jsonb_build_object('client_id', v.client_id));
    return 'desativada';
  end if;
  delete from profissionais where id = v.id;
  perform registrar_movimentacao('excluido', 'profissional', v.id,
    'Profissional excluída: ' || v.nome, jsonb_build_object('client_id', v.client_id));
  return 'excluida';
end;
$$;
revoke execute on function public.excluir_profissional(uuid) from public, anon;
grant execute on function public.excluir_profissional(uuid) to authenticated, service_role;

-- ============================================================
-- B) ASSINATURA DA SESSÃO (só o dono)
-- ============================================================

create or replace function public.pode_assinar_sessao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
     where id = auth.uid()
       and active
       and is_admin
       and not coalesce(somente_leitura, false)
       and cliente_id is null
  );
$$;
revoke execute on function public.pode_assinar_sessao() from public, anon;
grant execute on function public.pode_assinar_sessao() to authenticated, service_role;

create table if not exists public.assinaturas_sessao (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid not null references public.planejamentos(id) on delete cascade,
  sessao int not null check (sessao between 1 and 50),
  papel text not null check (papel in ('paciente', 'profissional')),
  nome text not null check (btrim(nome) <> '' and length(nome) <= 120),
  profissional_id uuid references public.profissionais(id) on delete set null,
  registro text check (registro is null or length(registro) <= 60),
  imagem text not null,
  conteudo_hash text not null check (conteudo_hash ~ '^[0-9a-f]{64}$'),
  resumo jsonb not null default '{}'::jsonb check (jsonb_typeof(resumo) = 'object'),
  assinada_em timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  aparelho text check (aparelho is null or length(aparelho) <= 300),
  constraint assinaturas_sessao_unica unique (planejamento_id, sessao, papel)
);
alter table public.assinaturas_sessao enable row level security;
drop policy if exists "assinaturas_sessao_select" on public.assinaturas_sessao;
create policy "assinaturas_sessao_select" on public.assinaturas_sessao for select
  using (public.pode_assinar_sessao());
revoke all on public.assinaturas_sessao from anon;
grant select on public.assinaturas_sessao to authenticated;
drop trigger if exists trg_somente_leitura on public.assinaturas_sessao;
create trigger trg_somente_leitura before insert or update or delete on public.assinaturas_sessao
  for each statement execute function public.bloquear_somente_leitura();
comment on table public.assinaturas_sessao is
  'Assinaturas (paciente e profissional) de cada sessão de um planejamento do Planejador HIPRO, colhidas com o dedo no celular do dono. imagem = caminho na pasta privada assinaturas do Storage; resumo = o que foi assinado; conteudo_hash = sha256 do resumo canônico. Uma por sessão e papel (assinar de novo substitui). Só pode_assinar_sessao(). Escrita só por registrar_assinatura_sessao e excluir_assinatura_sessao.';

-- Registra (ou substitui) a assinatura de um papel numa sessão. Devolve o id
-- novo e o caminho da imagem anterior (para a tela apagar o arquivo).
create or replace function public.registrar_assinatura_sessao(
  p_planejamento_id uuid,
  p_sessao int,
  p_papel text,
  p_nome text,
  p_profissional_id uuid,
  p_registro text,
  p_imagem text,
  p_conteudo_hash text,
  p_resumo jsonb,
  p_aparelho text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano planejamentos%rowtype;
  v_prof profissionais%rowtype;
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_registro text := nullif(btrim(regexp_replace(coalesce(p_registro, ''), '\s+', ' ', 'g')), '');
  v_prof_id uuid;
  v_max int;
  v_prefixo text;
  v_anterior text;
  v_id uuid;
begin
  if not pode_assinar_sessao() then
    raise exception 'Sem permissão para colher assinaturas.';
  end if;
  select * into v_plano from planejamentos where id = p_planejamento_id;
  if v_plano.id is null then raise exception 'Planejamento não encontrado.'; end if;
  if p_papel is null or p_papel not in ('paciente', 'profissional') then
    raise exception 'Papel inválido.';
  end if;
  begin
    v_max := greatest(coalesce(nullif(v_plano.estado ->> 'sessoesTotal', '')::int, 1),
                      coalesce(nullif(v_plano.estado ->> 'sessaoAtual', '')::int, 1), 1);
  exception when others then v_max := 1;
  end;
  if p_sessao is null or p_sessao < 1 or p_sessao > least(v_max, 50) then
    raise exception 'Sessão inválida.';
  end if;
  if v_nome is null then raise exception 'Escreva o nome de quem assina.'; end if;
  if length(v_nome) > 120 then raise exception 'Nome grande demais.'; end if;
  if length(coalesce(v_registro, '')) > 60 then raise exception 'Registro grande demais.'; end if;
  v_prefixo := 's/' || p_planejamento_id::text || '/' || p_sessao::text || '/' || p_papel || '-';
  if p_imagem is null or left(p_imagem, length(v_prefixo)) <> v_prefixo or right(p_imagem, 4) <> '.png' then
    raise exception 'Caminho da assinatura inválido.';
  end if;
  if p_conteudo_hash is null or p_conteudo_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Conferência do conteúdo inválida.';
  end if;
  if p_resumo is null or jsonb_typeof(p_resumo) <> 'object' or pg_column_size(p_resumo) > 200000 then
    raise exception 'Resumo da sessão inválido.';
  end if;

  if p_papel = 'profissional' and p_profissional_id is not null then
    select * into v_prof from profissionais where id = p_profissional_id;
    if v_prof.id is null or v_prof.client_id is distinct from v_plano.client_id then
      raise exception 'Esta profissional não é da clínica deste planejamento.';
    end if;
    v_prof_id := v_prof.id;
    v_registro := coalesce(v_registro, v_prof.registro);
  end if;
  if p_papel = 'paciente' then v_registro := null; end if;

  delete from assinaturas_sessao
   where planejamento_id = p_planejamento_id and sessao = p_sessao and papel = p_papel
   returning imagem into v_anterior;

  insert into assinaturas_sessao (planejamento_id, sessao, papel, nome, profissional_id, registro,
                                  imagem, conteudo_hash, resumo, aparelho)
  values (p_planejamento_id, p_sessao, p_papel, v_nome, v_prof_id, v_registro,
          p_imagem, p_conteudo_hash, p_resumo, nullif(left(btrim(coalesce(p_aparelho, '')), 300), ''))
  returning id into v_id;

  perform registrar_movimentacao('criado', 'assinatura_sessao', v_id,
    case when p_papel = 'paciente' then 'Assinatura do paciente ' else 'Assinatura da profissional ' end
      || v_nome || ' na Sessão ' || p_sessao
      || coalesce(' de ' || nullif(v_plano.paciente, ''), '')
      || case when v_anterior is not null then ' (substituiu a anterior)' else '' end,
    jsonb_build_object('planejamento_id', p_planejamento_id, 'sessao', p_sessao, 'papel', p_papel,
                       'conteudo_hash', p_conteudo_hash, 'profissional_id', v_prof_id));
  return jsonb_build_object('id', v_id, 'anterior', v_anterior);
end;
$$;
revoke execute on function public.registrar_assinatura_sessao(uuid, int, text, text, uuid, text, text, text, jsonb, text) from public, anon;
grant execute on function public.registrar_assinatura_sessao(uuid, int, text, text, uuid, text, text, text, jsonb, text) to authenticated, service_role;

-- Apaga uma assinatura e devolve o caminho da imagem (a tela apaga o arquivo).
create or replace function public.excluir_assinatura_sessao(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a assinaturas_sessao%rowtype;
begin
  if not pode_assinar_sessao() then
    raise exception 'Sem permissão para apagar assinaturas.';
  end if;
  delete from assinaturas_sessao where id = p_id returning * into a;
  if a.id is null then raise exception 'Assinatura não encontrada.'; end if;
  perform registrar_movimentacao('excluido', 'assinatura_sessao', a.id,
    case when a.papel = 'paciente' then 'Assinatura do paciente ' else 'Assinatura da profissional ' end
      || a.nome || ' na Sessão ' || a.sessao || ' apagada',
    jsonb_build_object('planejamento_id', a.planejamento_id, 'sessao', a.sessao, 'papel', a.papel));
  return jsonb_build_object('caminho', a.imagem);
end;
$$;
revoke execute on function public.excluir_assinatura_sessao(uuid) from public, anon;
grant execute on function public.excluir_assinatura_sessao(uuid) to authenticated, service_role;

-- Pasta privada "assinaturas" no Storage (PNG até 500 KB), só para o dono.
-- As políticas restritivas gerais (somente_leitura_nao_envia/altera/apaga)
-- também barram quem é só de visualização.
do $assinaturas$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sem Storage do Supabase: pasta das assinaturas não criada.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('assinaturas', 'assinaturas', false, 512000, array['image/png'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "assinaturas_ler" on storage.objects;
  drop policy if exists "assinaturas_enviar" on storage.objects;
  drop policy if exists "assinaturas_apagar" on storage.objects;

  create policy "assinaturas_ler" on storage.objects for select to authenticated
    using (bucket_id = 'assinaturas' and public.pode_assinar_sessao());
  create policy "assinaturas_enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'assinaturas' and public.pode_assinar_sessao());
  create policy "assinaturas_apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'assinaturas' and public.pode_assinar_sessao());
end
$assinaturas$;

-- ============================================================
-- SEMENTE: nomes já digitados nos planejamentos viram cadastro
-- (um por cliente e nome; fica o jeito escrito no mais recente).
-- ============================================================
insert into public.profissionais (client_id, nome, created_by, created_at)
select distinct on (pl.client_id, public.normalizar_nome_paciente(pl.estado ->> 'profissional'))
       pl.client_id,
       left(btrim(regexp_replace(pl.estado ->> 'profissional', '\s+', ' ', 'g')), 120),
       pl.created_by,
       pl.created_at
  from public.planejamentos pl
 where pl.client_id is not null
   and coalesce(btrim(pl.estado ->> 'profissional'), '') <> ''
   and not exists (select 1 from public.profissionais pr
                    where pr.client_id = pl.client_id
                      and public.normalizar_nome_paciente(pr.nome) = public.normalizar_nome_paciente(pl.estado ->> 'profissional'))
 order by pl.client_id, public.normalizar_nome_paciente(pl.estado ->> 'profissional'), pl.updated_at desc
on conflict do nothing;
