-- ============================================================
-- CADASTROS DO FORMULÁRIO (Google Forms "CADASTRO CONTOURLINE ACADEMY")
--
-- STATUS: AGUARDANDO O DONO
--
-- Cada resposta nova do formulário chega pela Edge Function
-- "cadastro-formulario" (chamada pelo Apps Script da planilha de respostas)
-- e fica em cadastros_recebidos até o dono revisar. Nada entra em clients
-- sem o toque em Confirmar:
--   - confirmar_cadastro_recebido(id, client_id, campos): cria lead novo
--     (client_id nulo) ou atualiza só os campos escolhidos de um cliente.
--   - descartar_cadastro_recebido(id).
-- O segredo que o Apps Script manda fica no cofre (formulario_cadastro_segredo)
-- e só a Edge Function (service_role) lê, por formulario_segredo().
-- ============================================================

create table if not exists public.cadastros_recebidos (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,               -- evita a mesma resposta duas vezes
  respondido_em timestamptz,                -- carimbo de data/hora do formulário
  recebido_em timestamptz not null default now(),
  nome text,
  profissao text,
  whatsapp text,
  email text,
  empresa text,
  estabelecimento text,
  cidade_estado text,
  dados jsonb not null default '{}'::jsonb, -- a linha inteira, como veio
  status text not null default 'pendente' check (status in ('pendente', 'importado', 'descartado')),
  client_id uuid references public.clients(id) on delete set null,
  resolvido_em timestamptz,
  resolvido_por uuid references public.profiles(id) on delete set null
);
create index if not exists cadastros_recebidos_status_idx on public.cadastros_recebidos (status, respondido_em);
alter table public.cadastros_recebidos enable row level security;
create policy "cadastros_recebidos_select" on public.cadastros_recebidos for select using (has_module_permission('clientes'));
grant select on public.cadastros_recebidos to authenticated;
create trigger trg_somente_leitura before insert or update or delete on public.cadastros_recebidos for each statement execute function public.bloquear_somente_leitura();

comment on table public.cadastros_recebidos is
  'Respostas do formulário de cadastro (Google Forms) esperando o dono revisar. Entram pela Edge Function cadastro-formulario; viram lead ou atualizam cliente só por confirmar_cadastro_recebido.';

-- Confirma: cria lead (p_client_id nulo) ou atualiza o cliente escolhido com os
-- campos que vierem em p_campos (name, treatment, display_name, whatsapp, email,
-- clinic_name, city, state; notes_add é acrescentado às observações).
create or replace function public.confirmar_cadastro_recebido(p_id uuid, p_client_id uuid, p_campos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cad cadastros_recebidos%rowtype;
  v_cliente uuid := p_client_id;
  v_c jsonb := coalesce(p_campos, '{}'::jsonb);
  v_nota text := nullif(btrim(v_c ->> 'notes_add'), '');
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para cadastrar clientes.';
  end if;

  select * into v_cad from cadastros_recebidos where id = p_id for update;
  if not found then raise exception 'Cadastro não encontrado.'; end if;
  if v_cad.status <> 'pendente' then raise exception 'Este cadastro já foi resolvido.'; end if;

  if v_cliente is null then
    if nullif(btrim(v_c ->> 'name'), '') is null then
      raise exception 'Informe o nome.';
    end if;
    insert into clients (name, treatment, display_name, whatsapp, email, clinic_name, city, state, notes, origem, stage, created_by)
    values (
      upper(btrim(v_c ->> 'name')),
      nullif(v_c ->> 'treatment', ''),
      nullif(btrim(v_c ->> 'display_name'), ''),
      nullif(btrim(v_c ->> 'whatsapp'), ''),
      nullif(lower(btrim(v_c ->> 'email')), ''),
      nullif(upper(btrim(v_c ->> 'clinic_name')), ''),
      nullif(upper(btrim(v_c ->> 'city')), ''),
      nullif(upper(btrim(v_c ->> 'state')), ''),
      v_nota,
      'formulario',
      'lead',
      auth.uid()
    )
    returning id into v_cliente;
    perform registrar_movimentacao('criado', 'cliente', v_cliente,
      'Lead criado pelo formulário de cadastro: ' || upper(btrim(v_c ->> 'name')), jsonb_build_object('cadastro_id', p_id));
  else
    if not exists (select 1 from clients where id = v_cliente) then
      raise exception 'Cliente não encontrado.';
    end if;
    update clients set
      name         = case when v_c ? 'name' and nullif(btrim(v_c ->> 'name'), '') is not null then upper(btrim(v_c ->> 'name')) else name end,
      treatment    = case when v_c ? 'treatment' then nullif(v_c ->> 'treatment', '') else treatment end,
      display_name = case when v_c ? 'display_name' then nullif(btrim(v_c ->> 'display_name'), '') else display_name end,
      whatsapp     = case when v_c ? 'whatsapp' then nullif(btrim(v_c ->> 'whatsapp'), '') else whatsapp end,
      email        = case when v_c ? 'email' then nullif(lower(btrim(v_c ->> 'email')), '') else email end,
      clinic_name  = case when v_c ? 'clinic_name' then nullif(upper(btrim(v_c ->> 'clinic_name')), '') else clinic_name end,
      city         = case when v_c ? 'city' then nullif(upper(btrim(v_c ->> 'city')), '') else city end,
      state        = case when v_c ? 'state' then nullif(upper(btrim(v_c ->> 'state')), '') else state end,
      notes        = case when v_nota is null then notes
                          when nullif(btrim(notes), '') is null then v_nota
                          else notes || E'\n' || v_nota end
    where id = v_cliente;
    perform registrar_movimentacao('editado', 'cliente', v_cliente,
      'Dados atualizados pelo formulário de cadastro', jsonb_build_object('cadastro_id', p_id, 'campos', v_c));
  end if;

  update cadastros_recebidos
     set status = 'importado', client_id = v_cliente, resolvido_em = now(), resolvido_por = auth.uid()
   where id = p_id;
  return v_cliente;
end;
$$;

create or replace function public.descartar_cadastro_recebido(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para cadastrar clientes.';
  end if;
  update cadastros_recebidos
     set status = 'descartado', resolvido_em = now(), resolvido_por = auth.uid()
   where id = p_id and status = 'pendente';
  if not found then raise exception 'Cadastro não encontrado ou já resolvido.'; end if;
end;
$$;

-- Segredo do Apps Script. plpgsql para o corpo só ser conferido na hora de
-- rodar (o schema.sql também carrega num Postgres sem o cofre).
create or replace function public.formulario_segredo()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return (select decrypted_secret from vault.decrypted_secrets where name = 'formulario_cadastro_segredo');
end;
$$;

revoke execute on function public.confirmar_cadastro_recebido(uuid, uuid, jsonb) from public, anon;
grant execute on function public.confirmar_cadastro_recebido(uuid, uuid, jsonb) to authenticated, service_role;
revoke execute on function public.descartar_cadastro_recebido(uuid) from public, anon;
grant execute on function public.descartar_cadastro_recebido(uuid) to authenticated, service_role;
revoke execute on function public.formulario_segredo() from public, anon, authenticated;
grant execute on function public.formulario_segredo() to service_role;

-- Cria o segredo no cofre (só no Supabase; num Postgres comum não faz nada).
do $segredo$
begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $q$
      select vault.create_secret(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'formulario_cadastro_segredo',
        'Senha que o Apps Script do formulário de cadastro manda para a Edge Function cadastro-formulario.')
       where not exists (select 1 from vault.secrets where name = 'formulario_cadastro_segredo')
    $q$;
  end if;
end;
$segredo$;
