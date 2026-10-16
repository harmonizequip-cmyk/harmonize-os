-- ============================================================
-- ACESSO DA CLIENTE AO PLANEJADOR (tela /portal)
--
-- STATUS: AGUARDANDO O DONO
--
-- A cliente (profissional que aluga o HIPRO) ganha login próprio e vê só o
-- Planejador dela: os planejamentos com o client_id dela, que ela cria e
-- edita. Perfil de cliente = profiles.cliente_id preenchido. A trava fica no
-- banco: has_module_permission é sempre falso para ela (nenhuma tela da
-- Harmonize abre), a leitura de planejamentos tem política própria e
-- salvar/excluir forçam o client_id dela.
-- Liberado pelo dono (configuracoes) com liberar_acesso_planejador.
-- ============================================================

alter table public.profiles add column if not exists cliente_id uuid references public.clients(id) on delete set null;
create index if not exists profiles_cliente_idx on public.profiles (cliente_id) where cliente_id is not null;
comment on column public.profiles.cliente_id is
  'Login de cliente (acesso só ao Planejador dela, /portal). Preenchido: has_module_permission é sempre falso e ela só lê/grava planejamentos com este client_id.';

-- Ninguém troca o próprio cliente_id (senão leria os planejamentos de outra).
create or replace function public.profiles_lock_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('configuracoes') then
    new.is_admin := old.is_admin;
    new.active := old.active;
    new.permissions := old.permissions;
    new.somente_leitura := old.somente_leitura;
    new.cliente_id := old.cliente_id;
  end if;
  return new;
end;
$$;

-- Login de cliente nunca tem módulo da Harmonize, mesmo com permissions preenchido.
create or replace function public.has_module_permission(module text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select active and cliente_id is null and (is_admin or coalesce((permissions ->> module)::boolean, false))
       from profiles where id = auth.uid()),
    false
  );
$function$;

-- Cliente do login (nulo para quem não é login de cliente ou está desligado).
create or replace function public.cliente_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cliente_id from profiles where id = auth.uid() and active;
$$;

create policy "planejamentos_select_cliente" on public.planejamentos for select
  using (client_id is not null and client_id = public.cliente_do_usuario());

-- Nome e "Profissional" (tratamento + nome) da cliente logada, para o portal.
create or replace function public.portal_cliente()
returns table (client_id uuid, nome text, profissional text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         coalesce(nullif(btrim(c.display_name), ''), c.name),
         btrim(concat_ws(' ', nullif(btrim(c.treatment), ''), coalesce(nullif(btrim(c.display_name), ''), c.name)))
    from clients c
   where c.id = public.cliente_do_usuario();
$$;

-- Cria (p_id nulo) ou atualiza. Login de cliente: client_id é sempre o dela,
-- só mexe nos dela e não muda o atendimento ligado pelo dono.
create or replace function public.salvar_planejamento(
  p_id uuid,
  p_client_id uuid,
  p_calendar_event_id uuid,
  p_estado jsonb,
  p_total integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_e jsonb := coalesce(p_estado, '{}'::jsonb);
  v_data date;
  v_retorno date;
  v_saldo integer;
  v_cliente uuid := cliente_do_usuario();
  v_client_id uuid := p_client_id;
  v_evento uuid := p_calendar_event_id;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para salvar planejamentos.';
  end if;
  if v_cliente is not null then
    v_client_id := v_cliente;
    if v_id is null then
      v_evento := null;
    else
      select calendar_event_id into v_evento from planejamentos where id = v_id and client_id = v_cliente;
      if not found then raise exception 'Planejamento não encontrado.'; end if;
    end if;
  end if;
  if jsonb_typeof(v_e) <> 'object' then
    raise exception 'Planejamento inválido.';
  end if;
  if pg_column_size(v_e) > 2000000 then
    raise exception 'Planejamento grande demais.';
  end if;
  begin v_data := nullif(v_e ->> 'data', '')::date; exception when others then v_data := null; end;
  begin v_retorno := nullif(v_e ->> 'dataRetorno', '')::date; exception when others then v_retorno := null; end;
  begin v_saldo := coalesce(nullif(v_e ->> 'saldoTotal', '')::integer, 0); exception when others then v_saldo := 0; end;

  if v_id is null then
    insert into planejamentos (client_id, calendar_event_id, paciente, data, data_retorno, procedimento, saldo_total, total_disparos, estado)
    values (v_client_id, v_evento, nullif(btrim(v_e ->> 'paciente'), ''), coalesce(v_data, hoje_local()), v_retorno,
            nullif(btrim(v_e ->> 'procNome'), ''), v_saldo, greatest(coalesce(p_total, 0), 0), v_e)
    returning id into v_id;
    perform registrar_movimentacao('criado', 'planejamento', v_id,
      'Planejamento HIPRO criado' || coalesce(' para ' || nullif(btrim(v_e ->> 'paciente'), ''), '')
        || case when v_cliente is not null then ' (pela cliente)' else '' end,
      jsonb_build_object('client_id', v_client_id, 'calendar_event_id', v_evento));
  else
    update planejamentos set
      client_id = v_client_id,
      calendar_event_id = v_evento,
      paciente = nullif(btrim(v_e ->> 'paciente'), ''),
      data = coalesce(v_data, data),
      data_retorno = v_retorno,
      procedimento = nullif(btrim(v_e ->> 'procNome'), ''),
      saldo_total = v_saldo,
      total_disparos = greatest(coalesce(p_total, 0), 0),
      estado = v_e,
      updated_at = now()
    where id = v_id and (v_cliente is null or client_id = v_cliente);
    if not found then raise exception 'Planejamento não encontrado.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.excluir_planejamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente text;
  v_cliente uuid := cliente_do_usuario();
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para excluir planejamentos.';
  end if;
  delete from planejamentos where id = p_id and (v_cliente is null or client_id = v_cliente) returning paciente into v_paciente;
  if not found then raise exception 'Planejamento não encontrado.'; end if;
  perform registrar_movimentacao('excluido', 'planejamento', p_id,
    'Planejamento HIPRO excluído' || coalesce(' (' || v_paciente || ')', '')
      || case when v_cliente is not null then ' pela cliente' else '' end, '{}'::jsonb);
end;
$$;

-- O dono libera o login (já criado no Auth) para o Planejador de uma cliente.
create or replace function public.liberar_acesso_planejador(p_email text, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
  v_nome text;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Só o administrador libera acessos.';
  end if;
  select coalesce(nullif(btrim(display_name), ''), name) into v_nome from clients where id = p_client_id;
  if v_nome is null then
    raise exception 'Cliente não encontrada.';
  end if;
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    raise exception 'Não achei um login com o e-mail %. Crie o login primeiro.', v_email;
  end if;
  if v_id = auth.uid() then
    raise exception 'Esse é o seu próprio login.';
  end if;
  if exists (select 1 from profiles where id = v_id and cliente_id is null and active) then
    raise exception 'Esse login já tem acesso ao sistema da Harmonize. Use outro e-mail para a cliente.';
  end if;

  insert into profiles (id, name, email, is_admin, active, somente_leitura, permissions, cliente_id)
  values (v_id, v_nome, v_email, false, true, false, '{}'::jsonb, p_client_id)
  on conflict (id) do update
    set name = excluded.name, email = excluded.email, is_admin = false, active = true,
        somente_leitura = false, permissions = '{}'::jsonb, cliente_id = excluded.cliente_id;

  perform registrar_movimentacao('editado', 'cliente', p_client_id, 'Acesso ao Planejador liberado (' || v_email || ')',
    jsonb_build_object('usuario_id', v_id));
  return v_id;
end;
$$;

create or replace function public.remover_acesso_planejador(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_cliente uuid;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Só o administrador remove acessos.';
  end if;
  update profiles set active = false where id = p_user_id and cliente_id is not null returning email, cliente_id into v_email, v_cliente;
  if v_email is null then
    raise exception 'Acesso de cliente não encontrado.';
  end if;
  perform registrar_movimentacao('editado', 'cliente', v_cliente, 'Acesso ao Planejador removido (' || v_email || ')',
    jsonb_build_object('usuario_id', p_user_id));
end;
$$;

revoke execute on function public.cliente_do_usuario() from public, anon;
grant execute on function public.cliente_do_usuario() to authenticated, service_role;
revoke execute on function public.portal_cliente() from public, anon;
grant execute on function public.portal_cliente() to authenticated, service_role;
revoke execute on function public.liberar_acesso_planejador(text, uuid) from public, anon;
grant execute on function public.liberar_acesso_planejador(text, uuid) to authenticated, service_role;
revoke execute on function public.remover_acesso_planejador(uuid) from public, anon;
grant execute on function public.remover_acesso_planejador(uuid) to authenticated, service_role;
revoke execute on function public.salvar_planejamento(uuid, uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.salvar_planejamento(uuid, uuid, uuid, jsonb, integer) to authenticated, service_role;
revoke execute on function public.excluir_planejamento(uuid) from public, anon;
grant execute on function public.excluir_planejamento(uuid) to authenticated, service_role;
