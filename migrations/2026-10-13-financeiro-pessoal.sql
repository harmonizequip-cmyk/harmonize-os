-- ============================================================
-- STATUS: ainda NÃO aplicada. Rodar no Supabase (projeto vidnlzbxaxjlmzncqhxw) com o aval do dono.
--
-- Financeiro pessoal e acesso só de visualização.
--   1. Acesso só de visualização (para a esposa do dono): profiles ganha
--      somente_leitura. Um gatilho em toda tabela do schema public recusa
--      qualquer gravação de quem é só de visualização, inclusive pelas
--      funções do sistema; no Storage, uma política restritiva faz o mesmo.
--      liberar_acesso_visualizacao (só administrador) cria o perfil a partir
--      de um login já existente; remover_acesso_visualizacao desliga.
--   2. Financeiro pessoal: os lançamentos com scope = 'pessoal' passam a
--      valer pela permissão "pessoal" (o dono, por ser administrador, e quem
--      tiver a permissão). Categorias pessoais padrão.
--   3. Retirada: lançar uma saída "Retiradas" no caixa da Harmonize cria
--      sozinha a entrada "Retirada da Harmonize" no pessoal (vinculo_id).
--      Mudar ou apagar a retirada muda ou apaga a entrada.
--   4. Despesa paga com dinheiro pessoal numa reserva/locação
--      (registrar_despesa_reserva, p_pessoal): 'custo' = custo do
--      atendimento pago do bolso (conta no lucro da locação, sai do
--      pessoal); 'meu' = gasto pessoal durante o atendimento (só pessoal,
--      não mexe no lucro). transactions.conta_no_lucro marca o primeiro caso.
-- ============================================================

-- 1. ACESSO SÓ DE VISUALIZAÇÃO ---------------------------------------------

alter table public.profiles add column if not exists somente_leitura boolean not null default false;
comment on column public.profiles.somente_leitura is
  'Acesso só de visualização: vê o que as permissões liberam, mas nenhuma gravação passa (gatilho trg_somente_leitura em toda tabela).';

-- A trava de campos privilegiados passa a cobrir somente_leitura também.
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
  end if;
  return new;
end;
$$;

create or replace function public.eh_somente_leitura()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select somente_leitura from profiles where id = auth.uid()), false);
$$;

create or replace function public.bloquear_somente_leitura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.eh_somente_leitura() then
    raise exception 'Acesso só de visualização: este usuário não pode alterar dados.';
  end if;
  return null;
end;
$$;

-- Em toda tabela do schema public (tabela nova precisa receber o mesmo gatilho).
do $sl$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop trigger if exists trg_somente_leitura on public.%I', t.tablename);
    execute format(
      'create trigger trg_somente_leitura before insert or update or delete on public.%I for each statement execute function public.bloquear_somente_leitura()',
      t.tablename);
  end loop;
end
$sl$;

-- Storage (comprovantes etc.): só existe no Supabase.
do $st$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  drop policy if exists "somente_leitura_nao_envia" on storage.objects;
  drop policy if exists "somente_leitura_nao_altera" on storage.objects;
  drop policy if exists "somente_leitura_nao_apaga" on storage.objects;
  create policy "somente_leitura_nao_envia" on storage.objects as restrictive for insert to authenticated
    with check (not public.eh_somente_leitura());
  create policy "somente_leitura_nao_altera" on storage.objects as restrictive for update to authenticated
    using (not public.eh_somente_leitura());
  create policy "somente_leitura_nao_apaga" on storage.objects as restrictive for delete to authenticated
    using (not public.eh_somente_leitura());
end
$st$;

-- Libera (ou religa) o acesso de visualização para um login que já existe.
create or replace function public.liberar_acesso_visualizacao(p_email text, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Só o administrador libera acessos.';
  end if;
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    raise exception 'Não achei um login com o e-mail %. Crie o login primeiro.', v_email;
  end if;
  if v_id = auth.uid() then
    raise exception 'Esse é o seu próprio login.';
  end if;
  if exists (select 1 from profiles where id = v_id and not somente_leitura and active) then
    raise exception 'Esse login já tem acesso completo. Não vou rebaixar por aqui.';
  end if;

  insert into profiles (id, name, email, is_admin, active, somente_leitura, permissions)
  values (
    v_id, coalesce(nullif(trim(p_nome), ''), v_email), v_email, false, true, true,
    '{"dashboard": true, "financeiro": true, "clientes": true, "agenda": true, "equipamentos": true,
      "relatorios": true, "exportacao": true, "configuracoes": false, "pessoal": true}'::jsonb
  )
  on conflict (id) do update
    set name = excluded.name, email = excluded.email, is_admin = false, active = true,
        somente_leitura = true, permissions = excluded.permissions;

  perform public.registrar_movimentacao(
    'editado', 'profiles', v_id, 'Usuário ' || v_email,
    jsonb_build_object('acao_detalhada', 'Acesso só de visualização liberado')
  );
  return v_id;
end;
$$;

create or replace function public.remover_acesso_visualizacao(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Só o administrador remove acessos.';
  end if;
  update profiles set active = false where id = p_user_id and somente_leitura returning email into v_email;
  if v_email is null then
    raise exception 'Acesso de visualização não encontrado.';
  end if;
  perform public.registrar_movimentacao(
    'editado', 'profiles', p_user_id, 'Usuário ' || v_email,
    jsonb_build_object('acao_detalhada', 'Acesso só de visualização removido')
  );
end;
$$;

-- 2. FINANCEIRO PESSOAL ------------------------------------------------------

drop policy if exists "transactions_select_pessoal" on public.transactions;
drop policy if exists "transactions_insert_pessoal" on public.transactions;
drop policy if exists "transactions_update_pessoal" on public.transactions;
create policy "transactions_select_pessoal" on public.transactions for select
  using (scope = 'pessoal' and has_module_permission('pessoal'));
create policy "transactions_insert_pessoal" on public.transactions for insert
  with check (scope = 'pessoal' and has_module_permission('pessoal'));
create policy "transactions_update_pessoal" on public.transactions for update
  using (scope = 'pessoal' and has_module_permission('pessoal'))
  with check (scope = 'pessoal' and has_module_permission('pessoal'));

-- Limites pessoais estavam abertos para qualquer login.
drop policy if exists "limits_rw_pessoal" on public.expense_limits;
create policy "limits_rw_pessoal" on public.expense_limits for all
  using (scope = 'pessoal' and has_module_permission('pessoal'))
  with check (scope = 'pessoal' and has_module_permission('pessoal'));

insert into public.categories (name, type, scope, is_default)
select v.name, v.type::entry_type, 'pessoal', true
from (values
  ('Retirada da Harmonize', 'entrada'), ('Salário', 'entrada'), ('Saldo inicial', 'entrada'), ('Outros', 'entrada'),
  ('Moradia', 'saida'), ('Contas da casa', 'saida'), ('Mercado', 'saida'), ('Alimentação', 'saida'),
  ('Transporte', 'saida'), ('Saúde', 'saida'), ('Educação', 'saida'), ('Lazer', 'saida'),
  ('Compras', 'saida'), ('Gasto em atendimento', 'saida'), ('Outros', 'saida')
) as v(name, type)
where not exists (
  select 1 from public.categories c where c.scope = 'pessoal' and c.name = v.name and c.type = v.type::entry_type
);

-- 3 e 4. COLUNAS NOVAS EM TRANSACTIONS ---------------------------------------

alter table public.transactions add column if not exists vinculo_id uuid references public.transactions(id) on delete cascade;
alter table public.transactions add column if not exists conta_no_lucro boolean not null default false;
-- Lançamento feito pela tela passa a guardar quem lançou (o pessoal depende disso para editar).
alter table public.transactions alter column created_by set default auth.uid();
comment on column public.transactions.vinculo_id is
  'Lançamento de origem de um espelho automático (ex.: a entrada pessoal "Retirada da Harmonize" aponta para a saída "Retiradas" do caixa). Apagar a origem apaga o espelho.';
comment on column public.transactions.conta_no_lucro is
  'Despesa pessoal que é custo de um atendimento pago do bolso: entra no lucro da locação (rentals_lucro), mas o dinheiro saiu da conta pessoal.';

-- transactions_contabilizaveis usa select *: recriar para trazer as colunas novas.
create or replace view public.transactions_contabilizaveis
with (security_invoker = true) as
select t.*
from public.transactions t
where t.is_test = false
  and (
    t.client_id is null
    or not exists (
      select 1 from public.clients c
      where c.id = t.client_id and c.excluir_financeiro
    )
  )
  and (
    t.rental_id is null
    or exists (
      select 1
      from public.rentals r
      where r.id = t.rental_id
        and r.status <> 'cancelada'
    )
  );

-- Lucro da locação: despesa pessoal só conta quando é custo do atendimento.
create or replace view public.rentals_lucro
with (security_invoker = true) as
select
  r.id as rental_id,
  r.client_id,
  c.name as cliente,
  r.event_date,
  r.calculated_value,
  r.valor_deslocamento,
  coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0) as total_pago,
  coalesce((select sum(t.amount) from transactions t
             where t.rental_id = r.id and t.type = 'saida' and (t.scope = 'harmonize' or t.conta_no_lucro)), 0) as total_despesas,
  r.calculated_value - coalesce((select sum(t.amount) from transactions t
             where t.rental_id = r.id and t.type = 'saida' and (t.scope = 'harmonize' or t.conta_no_lucro)), 0) as lucro_liquido
from rentals r
left join clients c on c.id = r.client_id
where r.status <> 'cancelada' and r.is_test = false;

-- Retirada do caixa vira entrada no pessoal.
create or replace function public.espelhar_retirada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eh_retirada boolean;
  v_cat_pessoal uuid;
  v_espelho uuid;
begin
  if new.scope <> 'harmonize' then
    return null;
  end if;
  select (c.name = 'Retiradas' and new.type = 'saida') into v_eh_retirada from categories c where c.id = new.category_id;
  v_eh_retirada := coalesce(v_eh_retirada, false);
  select id into v_espelho from transactions where vinculo_id = new.id limit 1;

  if v_eh_retirada and v_espelho is null then
    select id into v_cat_pessoal from categories where scope = 'pessoal' and type = 'entrada' and name = 'Retirada da Harmonize' limit 1;
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, created_by, is_test, vinculo_id)
    values ('entrada', v_cat_pessoal, 'Retirada da Harmonize' || coalesce(': ' || nullif(trim(new.description), ''), ''),
            new.amount, new.payment_method, new.date, 'pessoal', new.created_by, new.is_test, new.id);
  elsif v_eh_retirada then
    update transactions
       set amount = new.amount, date = new.date, payment_method = new.payment_method, is_test = new.is_test,
           description = 'Retirada da Harmonize' || coalesce(': ' || nullif(trim(new.description), ''), '')
     where id = v_espelho;
  elsif v_espelho is not null then
    delete from transactions where id = v_espelho;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_espelhar_retirada on public.transactions;
create trigger trg_espelhar_retirada
  after insert or update of amount, date, payment_method, category_id, type, description, is_test on public.transactions
  for each row execute function public.espelhar_retirada();

-- Despesa da reserva: p_pessoal = null (caixa da Harmonize), 'custo' (custo do
-- atendimento pago do bolso) ou 'meu' (gasto pessoal durante o atendimento).
drop function if exists public.registrar_despesa_reserva(uuid, uuid, numeric, payment_method_type, date, text, text);
create or replace function public.registrar_despesa_reserva(
  p_event_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_payment_method payment_method_type,
  p_date date default public.hoje_local(),
  p_description text default null,
  p_notes text default null,
  p_pessoal text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_rental_id uuid;
  v_status event_status_type;
  v_achou boolean;
  v_transaction_id uuid;
  v_scope scope_type := 'harmonize';
begin
  if p_pessoal is not null and p_pessoal not in ('custo', 'meu') then
    raise exception 'Tipo de despesa pessoal inválido.';
  end if;
  if p_pessoal is null and not has_module_permission('financeiro') then
    raise exception 'Sem permissão para lançar despesas.';
  end if;
  if p_pessoal is not null then
    if not has_module_permission('pessoal') then
      raise exception 'Sem permissão para lançar no financeiro pessoal.';
    end if;
    v_scope := 'pessoal';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor da despesa precisa ser maior que zero.';
  end if;

  select true, client_id, rental_id, status
    into v_achou, v_client_id, v_rental_id, v_status
    from calendar_events where id = p_event_id;
  if v_achou is not true then
    raise exception 'Reserva não encontrada.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Esta reserva está cancelada. Reative-a antes de lançar despesa.';
  end if;

  insert into transactions (
    type, category_id, description, amount, payment_method, date, scope,
    client_id, rental_id, calendar_event_id, notes, created_by, conta_no_lucro
  )
  values (
    'saida', p_category_id, coalesce(nullif(trim(p_description), ''), 'Despesa da reserva'),
    p_amount, p_payment_method, p_date, v_scope, v_client_id, v_rental_id, p_event_id, p_notes, auth.uid(),
    coalesce(p_pessoal = 'custo', false)
  )
  returning id into v_transaction_id;

  perform public.registrar_movimentacao(
    'criado', 'transactions', v_transaction_id,
    public.descrever_registro('transactions', v_transaction_id),
    jsonb_build_object('acao_detalhada',
      case p_pessoal when 'custo' then 'despesa da reserva paga com dinheiro pessoal'
                     when 'meu' then 'gasto pessoal durante o atendimento'
                     else 'despesa lançada na reserva' end,
      'calendar_event_id', p_event_id)
  );

  return v_transaction_id;
end;
$$;

-- Contas fixas pessoais saem do quadro da Harmonize (ficam no pessoal pelo tipo).
-- Nada a mudar no banco: settings.despesas_fixas já guarda o tipo.

revoke execute on function public.eh_somente_leitura() from public, anon;
revoke execute on function public.bloquear_somente_leitura() from public, anon;
revoke execute on function public.liberar_acesso_visualizacao(text, text) from public, anon;
revoke execute on function public.remover_acesso_visualizacao(uuid) from public, anon;
revoke execute on function public.espelhar_retirada() from public, anon;
revoke execute on function public.registrar_despesa_reserva(uuid, uuid, numeric, payment_method_type, date, text, text, text) from public, anon;
grant execute on function public.eh_somente_leitura() to authenticated, service_role;
grant execute on function public.liberar_acesso_visualizacao(text, text) to authenticated, service_role;
grant execute on function public.remover_acesso_visualizacao(uuid) to authenticated, service_role;
grant execute on function public.registrar_despesa_reserva(uuid, uuid, numeric, payment_method_type, date, text, text, text) to authenticated, service_role;
