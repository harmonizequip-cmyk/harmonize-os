-- Fotos dos pacientes no portal, só para quem o dono liberar (02/11/2026).
--
-- Até aqui só o dono via e enviava fotos. Agora cada cliente pode ganhar a
-- permissão de ver, enviar e apagar as fotos DOS PACIENTES DELA no portal
-- (clients.portal_fotos, desligada para todas). O resto não muda: só entra foto
-- de paciente que autorizou, o acesso de visualização não vê nada e a conta do
-- uso (uso_fotos_pacientes) continua só do dono.

-- 1. A chave por cliente.
alter table public.clients add column if not exists portal_fotos boolean not null default false;
comment on column public.clients.portal_fotos is
  'Liberada pelo dono (tela Acessos ao Planejador): o login desta cliente no portal vê, envia e apaga as fotos dos pacientes dela.';

-- 2. Pode mexer nas fotos DESTE paciente? O dono sempre; a cliente do portal só
--    nos pacientes dela, com o portal válido e a chave ligada.
create or replace function public.pode_fotos_do_paciente(p_paciente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pode_ver_fotos_paciente()
      or exists (
        select 1
          from pacientes pa
          join clients c on c.id = pa.client_id
         where pa.id = p_paciente_id
           and c.portal_fotos
           and pa.client_id = public.cliente_do_usuario()
      );
$$;
revoke execute on function public.pode_fotos_do_paciente(uuid) from public, anon;
grant execute on function public.pode_fotos_do_paciente(uuid) to authenticated, service_role;

-- Paciente pelo caminho do arquivo (p/<paciente_id>/<etapa>/<id>.jpg); nulo se não for desse jeito.
create or replace function public.paciente_do_caminho_foto(p_nome text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if split_part(coalesce(p_nome, ''), '/', 1) <> 'p' then return null; end if;
  return split_part(p_nome, '/', 2)::uuid;
exception when others then
  return null;
end;
$$;
revoke execute on function public.paciente_do_caminho_foto(text) from public, anon;
grant execute on function public.paciente_do_caminho_foto(text) to authenticated, service_role;

-- Para a tela do portal: a cliente logada pode usar as fotos?
create or replace function public.portal_fotos_liberadas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select c.portal_fotos from clients c where c.id = public.cliente_do_usuario()), false);
$$;
revoke execute on function public.portal_fotos_liberadas() from public, anon;
grant execute on function public.portal_fotos_liberadas() to authenticated, service_role;

-- 3. O dono liga e desliga.
create or replace function public.definir_fotos_portal(p_client_id uuid, p_liberado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Só o administrador libera as fotos.';
  end if;
  update clients set portal_fotos = coalesce(p_liberado, false) where id = p_client_id;
  if not found then raise exception 'Cliente não encontrada.'; end if;
  perform registrar_movimentacao('editado', 'cliente', p_client_id, descrever_registro('clients', p_client_id),
    jsonb_build_object('acao_detalhada', case when coalesce(p_liberado, false)
      then 'Fotos dos pacientes liberadas no portal' else 'Fotos dos pacientes retiradas do portal' end));
end;
$$;
revoke execute on function public.definir_fotos_portal(uuid, boolean) from public, anon;
grant execute on function public.definir_fotos_portal(uuid, boolean) to authenticated, service_role;

-- 4. Leitura da lista de fotos.
drop policy if exists "paciente_fotos_select" on public.paciente_fotos;
create policy "paciente_fotos_select" on public.paciente_fotos for select
  using (public.pode_fotos_do_paciente(paciente_id));

-- 5. Funções de escrita: mesma regra, por paciente.
create or replace function public.definir_autorizacao_fotos(p_paciente_id uuid, p_autorizado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if not pode_fotos_do_paciente(p_paciente_id) then
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
  if not pode_fotos_do_paciente(p_paciente_id) then
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
  select * into f from paciente_fotos where id = p_id;
  if f.id is null then raise exception 'Foto não encontrada.'; end if;
  if not pode_fotos_do_paciente(f.paciente_id) then
    raise exception 'Sem permissão para as fotos dos pacientes.';
  end if;
  delete from paciente_fotos where id = p_id;
  select nome into v_nome from pacientes where id = f.paciente_id;
  perform registrar_movimentacao('excluido', 'paciente_foto', p_id,
    'Foto do paciente ' || coalesce(v_nome, '') || ' apagada (' || f.etapa || coalesce(', ' || f.area, '') || ')',
    jsonb_build_object('paciente_id', f.paciente_id, 'etapa', f.etapa));
  return jsonb_build_object('caminho', f.caminho, 'miniatura', f.miniatura);
end;
$$;
revoke execute on function public.excluir_foto_paciente(uuid) from public, anon;
grant execute on function public.excluir_foto_paciente(uuid) to authenticated, service_role;

-- 6. Arquivos da pasta privada: o paciente vem do caminho.
do $fotosportal$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;
  drop policy if exists "fotos_pacientes_ler" on storage.objects;
  drop policy if exists "fotos_pacientes_enviar" on storage.objects;
  drop policy if exists "fotos_pacientes_apagar" on storage.objects;
  create policy "fotos_pacientes_ler" on storage.objects for select to authenticated
    using (bucket_id = 'fotos-pacientes' and public.pode_fotos_do_paciente(public.paciente_do_caminho_foto(name)));
  create policy "fotos_pacientes_enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'fotos-pacientes' and public.pode_fotos_do_paciente(public.paciente_do_caminho_foto(name)));
  create policy "fotos_pacientes_apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'fotos-pacientes' and public.pode_fotos_do_paciente(public.paciente_do_caminho_foto(name)));
end
$fotosportal$;
