-- ============================================================
-- PORTAL DA CLIENTE: VALIDADE DE 60 DIAS
--
-- STATUS: AGUARDANDO O DONO
--
-- Regra do dono (16/10/2026): ao liberar o acesso, a cliente ganha 60 dias;
-- cada agendamento de HIPRO (locação ou reserva não cancelada, fora teste)
-- prorroga até 45 dias depois da data do atendimento (reserva futura já
-- conta). Vale o maior prazo. Passou, trava sozinho: ela vê o aviso para
-- falar com a Harmonize. O dono também libera à mão na ficha ("Liberar por
-- mais 60 dias" = clients.portal_liberado_ate). Os planejamentos continuam
-- guardados; só ficam escondidos enquanto travado.
-- ============================================================

alter table public.clients add column if not exists portal_liberado_ate date;
comment on column public.clients.portal_liberado_ate is
  'Portal do Planejador liberado até esta data (60 dias ao criar o acesso ou pelo botão; além de 45 dias depois de cada atendimento).';

-- Último dia com atendimento de HIPRO da cliente (locação ou reserva não cancelada; a futura também).
create or replace function public.portal_ultimo_atendimento(p_client_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select max(d) from (
    select coalesce(r.event_date_end, r.event_date) as d
      from rentals r
     where r.client_id = p_client_id and r.status::text <> 'cancelada' and not coalesce(r.is_test, false)
    union all
    select coalesce(ce.date_end, ce.date_start)
      from calendar_events ce
     where ce.client_id = p_client_id and ce.status::text <> 'cancelada' and not coalesce(ce.is_test, false)
       and ce.event_type::text in ('hipro_1', 'hipro_2')
  ) x;
$$;

-- Até quando o portal fica aberto: último atendimento + 45 dias ou a liberação (60 dias), o que for maior.
create or replace function public.portal_valido_ate(p_client_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select nullif(greatest(
    coalesce(portal_ultimo_atendimento(p_client_id) + 45, '-infinity'::date),
    coalesce((select portal_liberado_ate from clients where id = p_client_id), '-infinity'::date)
  ), '-infinity'::date);
$$;

-- Cliente do login, só quando o portal está dentro da validade (vale para a
-- política de leitura e para salvar/excluir planejamentos).
create or replace function public.cliente_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.cliente_id from profiles p
   where p.id = auth.uid() and p.active and p.cliente_id is not null
     and coalesce(portal_valido_ate(p.cliente_id) >= hoje_local(), false);
$$;

-- Situação do portal para a tela da própria cliente (mesmo travada).
create or replace function public.portal_situacao()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'ativo', p.active and coalesce(portal_valido_ate(p.cliente_id) >= hoje_local(), false),
           'desligado', not p.active,
           'ultimo_atendimento', portal_ultimo_atendimento(p.cliente_id),
           'valido_ate', portal_valido_ate(p.cliente_id))
    from profiles p
   where p.id = auth.uid() and p.cliente_id is not null;
$$;

-- Para a ficha (dono): último atendimento, liberação manual e validade.
create or replace function public.portal_validade_cliente(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão.';
  end if;
  return jsonb_build_object(
    'ultimo_atendimento', portal_ultimo_atendimento(p_client_id),
    'liberado_ate', (select portal_liberado_ate from clients where id = p_client_id),
    'valido_ate', portal_valido_ate(p_client_id),
    'ativo', coalesce(portal_valido_ate(p_client_id) >= hoje_local(), false));
end;
$$;

create or replace function public.liberar_portal_cliente(p_client_id uuid, p_dias integer default 60)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ate date := hoje_local() + greatest(1, least(coalesce(p_dias, 60), 365));
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Só o administrador libera acessos.';
  end if;
  update clients set portal_liberado_ate = v_ate where id = p_client_id;
  if not found then raise exception 'Cliente não encontrada.'; end if;
  perform registrar_movimentacao('editado', 'cliente', p_client_id, descrever_registro('clients', p_client_id),
    jsonb_build_object('acao_detalhada', 'Acesso ao Planejador liberado até ' || to_char(v_ate, 'DD/MM/YYYY')));
  return v_ate;
end;
$$;

-- Criar o acesso já dá os primeiros 60 dias.
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

  -- Primeiros 60 dias contados da liberação (depois, cada agendamento prorroga 45).
  update clients set portal_liberado_ate = greatest(coalesce(portal_liberado_ate, hoje_local()), hoje_local() + 60) where id = p_client_id;

  perform registrar_movimentacao('editado', 'cliente', p_client_id, 'Acesso ao Planejador liberado (' || v_email || ')',
    jsonb_build_object('usuario_id', v_id));
  return v_id;
end;
$$;

revoke execute on function public.portal_ultimo_atendimento(uuid) from public, anon;
grant execute on function public.portal_ultimo_atendimento(uuid) to authenticated, service_role;
revoke execute on function public.portal_valido_ate(uuid) from public, anon;
grant execute on function public.portal_valido_ate(uuid) to authenticated, service_role;
revoke execute on function public.cliente_do_usuario() from public, anon;
grant execute on function public.cliente_do_usuario() to authenticated, service_role;
revoke execute on function public.portal_situacao() from public, anon;
grant execute on function public.portal_situacao() to authenticated, service_role;
revoke execute on function public.portal_validade_cliente(uuid) from public, anon;
grant execute on function public.portal_validade_cliente(uuid) to authenticated, service_role;
revoke execute on function public.liberar_portal_cliente(uuid, integer) from public, anon;
grant execute on function public.liberar_portal_cliente(uuid, integer) to authenticated, service_role;
revoke execute on function public.liberar_acesso_planejador(text, uuid) from public, anon;
grant execute on function public.liberar_acesso_planejador(text, uuid) to authenticated, service_role;
