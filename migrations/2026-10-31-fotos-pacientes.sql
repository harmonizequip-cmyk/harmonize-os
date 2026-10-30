-- Fotos dos pacientes do Planejador HIPRO (piloto só para o dono, 31/10/2026).
--
-- Cada foto é de um paciente (tabela pacientes), de uma etapa (antes, imediato,
-- 30, 60 e 90 dias) e, se quiser, de uma área tratada e de um planejamento.
-- Os arquivos ficam na pasta privada "fotos-pacientes" do Storage:
--   p/<paciente_id>/<etapa>/<id>.jpg e p/<paciente_id>/<etapa>/<id>_mini.jpg
--
-- Piloto: só o dono (administrador ativo, que não é só de visualização nem
-- login de cliente) vê e envia. Clientes do portal e o acesso de
-- visualização não veem nada, nem a lista, nem os arquivos.
--
-- Foto só entra depois de marcar que o paciente autorizou o uso de imagem
-- (pacientes.fotos_autorizadas_em). O backup guarda a lista das fotos, não
-- os arquivos (como os comprovantes).

-- 1. Quem pode ver e enviar fotos: só o dono.
create or replace function public.pode_ver_fotos_paciente()
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
revoke execute on function public.pode_ver_fotos_paciente() from public, anon;
grant execute on function public.pode_ver_fotos_paciente() to authenticated, service_role;

-- 2. Autorização de uso de imagem do paciente.
alter table public.pacientes add column if not exists fotos_autorizadas_em timestamptz;
comment on column public.pacientes.fotos_autorizadas_em is
  'Quando o dono confirmou que o paciente autorizou o uso de imagem. Nulo: não autorizou, e nenhuma foto pode entrar.';

-- 3. Tabela das fotos.
create table if not exists public.paciente_fotos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  planejamento_id uuid references public.planejamentos(id) on delete set null,
  etapa text not null check (etapa in ('antes', 'imediato', 'd30', 'd60', 'd90')),
  area text check (area is null or length(area) <= 60),
  caminho text not null unique,
  miniatura text not null,
  largura int,
  altura int,
  tamanho_bytes int not null default 0,
  tirada_em date not null default public.hoje_local(),
  observacao text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists paciente_fotos_paciente_etapa_idx on public.paciente_fotos (paciente_id, etapa, tirada_em);
alter table public.paciente_fotos enable row level security;
drop policy if exists "paciente_fotos_select" on public.paciente_fotos;
create policy "paciente_fotos_select" on public.paciente_fotos for select
  using (public.pode_ver_fotos_paciente());
grant select on public.paciente_fotos to authenticated;
drop trigger if exists trg_somente_leitura on public.paciente_fotos;
create trigger trg_somente_leitura before insert or update or delete on public.paciente_fotos
  for each statement execute function public.bloquear_somente_leitura();
comment on table public.paciente_fotos is
  'Fotos dos pacientes do Planejador HIPRO por etapa (antes, imediato, d30, d60, d90) e área. Arquivos na pasta privada fotos-pacientes do Storage. Piloto só para o dono (pode_ver_fotos_paciente). Escrita só por registrar_foto_paciente e excluir_foto_paciente.';

-- 4. Funções.
create or replace function public.definir_autorizacao_fotos(p_paciente_id uuid, p_autorizado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if not pode_ver_fotos_paciente() then
    raise exception 'Sem permissão para as fotos dos pacientes.';
  end if;
  select nome into v_nome from pacientes where id = p_paciente_id;
  if not found then raise exception 'Paciente não encontrado.'; end if;
  if not coalesce(p_autorizado, false)
     and exists (select 1 from paciente_fotos where paciente_id = p_paciente_id) then
    raise exception 'Apague as fotos antes de tirar a autorização.';
  end if;
  update pacientes set
    fotos_autorizadas_em = case when coalesce(p_autorizado, false) then now() else null end,
    updated_at = now()
   where id = p_paciente_id;
  perform registrar_movimentacao('editado', 'paciente', p_paciente_id,
    case when coalesce(p_autorizado, false)
         then 'Uso de imagem autorizado: ' || v_nome
         else 'Autorização de uso de imagem retirada: ' || v_nome end,
    jsonb_build_object('fotos_autorizadas', coalesce(p_autorizado, false)));
end;
$$;
revoke execute on function public.definir_autorizacao_fotos(uuid, boolean) from public, anon;
grant execute on function public.definir_autorizacao_fotos(uuid, boolean) to authenticated, service_role;

create or replace function public.registrar_foto_paciente(
  p_paciente_id uuid,
  p_etapa text,
  p_area text,
  p_caminho text,
  p_miniatura text,
  p_largura int,
  p_altura int,
  p_tamanho_bytes int,
  p_tirada_em date default null,
  p_planejamento_id uuid default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pac pacientes%rowtype;
  v_prefixo text;
  v_area text := nullif(left(btrim(coalesce(p_area, '')), 60), '');
  v_id uuid;
begin
  if not pode_ver_fotos_paciente() then
    raise exception 'Sem permissão para as fotos dos pacientes.';
  end if;
  select * into v_pac from pacientes where id = p_paciente_id;
  if v_pac.id is null then raise exception 'Paciente não encontrado.'; end if;
  if v_pac.fotos_autorizadas_em is null then
    raise exception 'Marque primeiro que o paciente autorizou as fotos.';
  end if;
  if p_etapa is null or p_etapa not in ('antes', 'imediato', 'd30', 'd60', 'd90') then
    raise exception 'Etapa inválida.';
  end if;
  v_prefixo := 'p/' || p_paciente_id::text || '/';
  if p_caminho is null or left(p_caminho, length(v_prefixo)) <> v_prefixo
     or p_miniatura is null or left(p_miniatura, length(v_prefixo)) <> v_prefixo then
    raise exception 'Caminho da foto inválido.';
  end if;
  if p_planejamento_id is not null
     and not exists (select 1 from planejamentos where id = p_planejamento_id and paciente_id = p_paciente_id) then
    raise exception 'Este planejamento não é deste paciente.';
  end if;

  insert into paciente_fotos (paciente_id, planejamento_id, etapa, area, caminho, miniatura,
                              largura, altura, tamanho_bytes, tirada_em, observacao)
  values (p_paciente_id, p_planejamento_id, p_etapa, v_area, p_caminho, p_miniatura,
          p_largura, p_altura, greatest(coalesce(p_tamanho_bytes, 0), 0),
          coalesce(p_tirada_em, hoje_local()), nullif(btrim(left(p_observacao, 1000)), ''))
  returning id into v_id;
  perform registrar_movimentacao('criado', 'paciente_foto', v_id,
    'Foto do paciente ' || v_pac.nome || ' (' || p_etapa || coalesce(', ' || v_area, '') || ')',
    jsonb_build_object('paciente_id', p_paciente_id, 'etapa', p_etapa, 'planejamento_id', p_planejamento_id));
  return v_id;
end;
$$;
revoke execute on function public.registrar_foto_paciente(uuid, text, text, text, text, int, int, int, date, uuid, text) from public, anon;
grant execute on function public.registrar_foto_paciente(uuid, text, text, text, text, int, int, int, date, uuid, text) to authenticated, service_role;

create or replace function public.excluir_foto_paciente(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f paciente_fotos%rowtype;
  v_nome text;
begin
  if not pode_ver_fotos_paciente() then
    raise exception 'Sem permissão para as fotos dos pacientes.';
  end if;
  delete from paciente_fotos where id = p_id returning * into f;
  if f.id is null then raise exception 'Foto não encontrada.'; end if;
  select nome into v_nome from pacientes where id = f.paciente_id;
  perform registrar_movimentacao('excluido', 'paciente_foto', p_id,
    'Foto do paciente ' || coalesce(v_nome, '') || ' apagada (' || f.etapa || coalesce(', ' || f.area, '') || ')',
    jsonb_build_object('paciente_id', f.paciente_id, 'etapa', f.etapa));
  return jsonb_build_object('caminho', f.caminho, 'miniatura', f.miniatura);
end;
$$;
revoke execute on function public.excluir_foto_paciente(uuid) from public, anon;
grant execute on function public.excluir_foto_paciente(uuid) to authenticated, service_role;

create or replace function public.uso_fotos_pacientes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not pode_ver_fotos_paciente() then
    raise exception 'Sem permissão para as fotos dos pacientes.';
  end if;
  select jsonb_build_object('fotos', count(*), 'bytes', coalesce(sum(tamanho_bytes), 0))
    into v from paciente_fotos;
  return v;
end;
$$;
revoke execute on function public.uso_fotos_pacientes() from public, anon;
grant execute on function public.uso_fotos_pacientes() to authenticated, service_role;

-- 5. Excluir e juntar pacientes passam a cuidar das fotos.
create or replace function public.juntar_pacientes(p_manter uuid, p_juntar uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := cliente_do_usuario();
  m pacientes%rowtype;
  j pacientes%rowtype;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para juntar pacientes.';
  end if;
  if p_manter = p_juntar then raise exception 'Escolha outro paciente.'; end if;
  select * into m from pacientes where id = p_manter and (v_cliente is null or client_id = v_cliente);
  select * into j from pacientes where id = p_juntar and (v_cliente is null or client_id = v_cliente);
  if m.id is null or j.id is null then raise exception 'Paciente não encontrado.'; end if;
  if m.client_id is distinct from j.client_id then raise exception 'Os dois pacientes precisam ser da mesma cliente.'; end if;

  update planejamentos set paciente_id = m.id, paciente = m.nome, estado = estado || jsonb_build_object('paciente', m.nome, 'pacienteId', m.id::text)
   where paciente_id = j.id;
  -- As fotos vão para o paciente mantido (os arquivos continuam no caminho antigo).
  update paciente_fotos set paciente_id = m.id where paciente_id = j.id;
  update pacientes set
    whatsapp = coalesce(whatsapp, j.whatsapp),
    nascimento = coalesce(nascimento, j.nascimento),
    observacoes = case when j.observacoes is null then observacoes
                       when observacoes is null then j.observacoes
                       else observacoes || E'\n' || j.observacoes end,
    fotos_autorizadas_em = coalesce(fotos_autorizadas_em, j.fotos_autorizadas_em),
    updated_at = now()
   where id = m.id;
  delete from pacientes where id = j.id;
  perform registrar_movimentacao('editado', 'paciente', m.id,
    'Paciente ' || j.nome || ' juntado com ' || m.nome, jsonb_build_object('juntado', j.id));
end;
$$;
revoke execute on function public.juntar_pacientes(uuid, uuid) from public, anon;
grant execute on function public.juntar_pacientes(uuid, uuid) to authenticated, service_role;

create or replace function public.excluir_paciente(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := cliente_do_usuario();
  v_nome text;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para excluir pacientes.';
  end if;
  if exists (select 1 from planejamentos where paciente_id = p_id) then
    raise exception 'Este paciente tem planejamentos. Apague os planejamentos antes, ou junte com outro paciente.';
  end if;
  if exists (select 1 from paciente_fotos where paciente_id = p_id) then
    raise exception 'Este paciente tem fotos. Apague as fotos antes.';
  end if;
  delete from pacientes where id = p_id and (v_cliente is null or client_id = v_cliente) returning nome into v_nome;
  if not found then raise exception 'Paciente não encontrado.'; end if;
  perform registrar_movimentacao('excluido', 'paciente', p_id, 'Paciente excluído: ' || v_nome, '{}'::jsonb);
end;
$$;
revoke execute on function public.excluir_paciente(uuid) from public, anon;
grant execute on function public.excluir_paciente(uuid) to authenticated, service_role;

-- 6. Pasta privada "fotos-pacientes" no Storage, só para o dono.
-- As políticas restritivas gerais (somente_leitura_nao_envia/altera/apaga)
-- também barram quem é só de visualização.
do $fotospac$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sem Storage do Supabase: pasta de fotos dos pacientes não criada.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('fotos-pacientes', 'fotos-pacientes', false, 5242880, array['image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "fotos_pacientes_ler" on storage.objects;
  drop policy if exists "fotos_pacientes_enviar" on storage.objects;
  drop policy if exists "fotos_pacientes_apagar" on storage.objects;

  create policy "fotos_pacientes_ler" on storage.objects for select to authenticated
    using (bucket_id = 'fotos-pacientes' and public.pode_ver_fotos_paciente());
  create policy "fotos_pacientes_enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'fotos-pacientes' and public.pode_ver_fotos_paciente());
  create policy "fotos_pacientes_apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'fotos-pacientes' and public.pode_ver_fotos_paciente());
end
$fotospac$;
