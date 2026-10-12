-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 13/10/2026, pelo dono, e conferida por consulta de leitura (colunas, categorias pessoais, 23 tabelas protegidas, funções; anon sem acesso).
--
-- Cartão de crédito com fatura.
--   1. cartoes: cada cartão é de um lado (scope harmonize ou pessoal), com
--      dia de fechamento, dia de vencimento e limite opcional.
--   2. Compra no cartão (registrar_compra_cartao): vira uma saída por
--      parcela, cada uma no mês dela (data da compra + n meses), com a
--      fatura em que cai (fatura_ref = mês do vencimento, 'AAAA-MM').
--      Conta como gasto no mês da parcela, mas não tira dinheiro da conta.
--   3. Pagamento da fatura (pagar_fatura_cartao): saída "Pagamento de
--      fatura" que tira o dinheiro da conta e não conta como gasto (as
--      compras já contaram).
--   4. View faturas_cartao: total de compras, pago e vencimento por fatura.
-- ============================================================

create table if not exists public.cartoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  scope scope_type not null,
  dia_fechamento smallint not null check (dia_fechamento between 1 and 31),
  dia_vencimento smallint not null check (dia_vencimento between 1 and 31),
  limite numeric(12,2) check (limite is null or limite > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.cartoes is
  'Cartões de crédito. Cada um é da Harmonize ou pessoal (scope). Escrito só por salvar_cartao.';

alter table public.cartoes enable row level security;
drop policy if exists "cartoes_select" on public.cartoes;
create policy "cartoes_select" on public.cartoes for select
  using ((scope = 'harmonize' and has_module_permission('financeiro')) or (scope = 'pessoal' and has_module_permission('pessoal')));

drop trigger if exists trg_somente_leitura on public.cartoes;
create trigger trg_somente_leitura before insert or update or delete on public.cartoes
  for each statement execute function public.bloquear_somente_leitura();

alter table public.transactions add column if not exists cartao_id uuid references public.cartoes(id);
alter table public.transactions add column if not exists cartao_mov text check (cartao_mov in ('compra', 'pagamento'));
alter table public.transactions add column if not exists fatura_ref text check (fatura_ref ~ '^\d{4}-\d{2}$');
alter table public.transactions add column if not exists parcela_num smallint;
alter table public.transactions add column if not exists parcelas_total smallint;
alter table public.transactions add column if not exists compra_grupo uuid;
comment on column public.transactions.cartao_mov is
  'compra = gasto no cartão (conta no resultado, não tira dinheiro da conta); pagamento = pagamento da fatura (tira dinheiro, fora do resultado).';
comment on column public.transactions.fatura_ref is 'Fatura do cartão, pelo mês do vencimento (AAAA-MM).';

create index if not exists transactions_cartao_fatura_idx on public.transactions (cartao_id, fatura_ref) where cartao_id is not null;

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

insert into public.categories (name, type, scope, is_default)
select 'Pagamento de fatura', 'saida', s.scope::scope_type, true
from (values ('harmonize'), ('pessoal')) as s(scope)
where not exists (
  select 1 from public.categories c where c.name = 'Pagamento de fatura' and c.scope = s.scope::scope_type and c.type = 'saida'
);

-- Dia do mês limitado ao último dia daquele mês (fechamento dia 31 em fevereiro = dia 28/29).
create or replace function public.dia_no_mes(p_ano int, p_mes int, p_dia int)
returns date
language sql
immutable
set search_path = public
as $$
  select make_date(p_ano, p_mes, least(p_dia, extract(day from (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day'))::int));
$$;

-- Fatura (mês do vencimento, 'AAAA-MM') em que cai uma compra feita em p_data.
create or replace function public.fatura_da_compra(p_data date, p_fechamento int, p_vencimento int)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_fecha date := public.dia_no_mes(extract(year from p_data)::int, extract(month from p_data)::int, p_fechamento);
  v_mes_fecha date;
begin
  -- Compra depois do fechamento entra na fatura que fecha no mês seguinte.
  v_mes_fecha := date_trunc('month', p_data)::date + case when p_data > v_fecha then interval '1 month' else interval '0' end;
  -- Vencimento depois do fechamento no mesmo mês; senão, no mês seguinte.
  if p_vencimento <= p_fechamento then
    v_mes_fecha := v_mes_fecha + interval '1 month';
  end if;
  return to_char(v_mes_fecha, 'YYYY-MM');
end;
$$;

create or replace function public.salvar_cartao(
  p_id uuid,
  p_nome text,
  p_scope scope_type,
  p_dia_fechamento int,
  p_dia_vencimento int,
  p_limite numeric default null,
  p_ativo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if (p_scope = 'harmonize' and not has_module_permission('financeiro'))
     or (p_scope = 'pessoal' and not has_module_permission('pessoal')) then
    raise exception 'Sem permissão para mexer nos cartões.';
  end if;
  if nullif(trim(p_nome), '') is null then
    raise exception 'Dê um nome ao cartão.';
  end if;
  if p_dia_fechamento not between 1 and 31 or p_dia_vencimento not between 1 and 31 then
    raise exception 'Dia de fechamento e de vencimento vão de 1 a 31.';
  end if;

  if p_id is null then
    insert into cartoes (nome, scope, dia_fechamento, dia_vencimento, limite, ativo)
    values (trim(p_nome), p_scope, p_dia_fechamento, p_dia_vencimento, p_limite, coalesce(p_ativo, true))
    returning id into v_id;
    perform public.registrar_movimentacao('criado', 'cartoes', v_id, 'Cartão ' || trim(p_nome), '{}'::jsonb);
  else
    update cartoes
       set nome = trim(p_nome), dia_fechamento = p_dia_fechamento, dia_vencimento = p_dia_vencimento,
           limite = p_limite, ativo = coalesce(p_ativo, true)
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Cartão não encontrado.';
    end if;
    perform public.registrar_movimentacao('editado', 'cartoes', v_id, 'Cartão ' || trim(p_nome), '{}'::jsonb);
  end if;
  return v_id;
end;
$$;

-- Compra no cartão: uma saída por parcela, cada uma no mês dela.
create or replace function public.registrar_compra_cartao(
  p_cartao_id uuid,
  p_category_id uuid,
  p_valor_total numeric,
  p_parcelas int,
  p_data date,
  p_descricao text,
  p_client_id uuid default null,
  p_rental_id uuid default null,
  p_calendar_event_id uuid default null,
  p_conta_no_lucro boolean default false,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cartao record;
  v_grupo uuid := gen_random_uuid();
  v_parcela numeric;
  v_ultima numeric;
  v_data date;
  v_desc text := coalesce(nullif(trim(p_descricao), ''), 'Compra no cartão');
  i int;
begin
  select * into v_cartao from cartoes where id = p_cartao_id;
  if v_cartao.id is null then
    raise exception 'Cartão não encontrado.';
  end if;
  if (v_cartao.scope = 'harmonize' and not has_module_permission('financeiro'))
     or (v_cartao.scope = 'pessoal' and not has_module_permission('pessoal')) then
    raise exception 'Sem permissão para lançar neste cartão.';
  end if;
  if p_valor_total is null or p_valor_total <= 0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;
  if p_parcelas is null or p_parcelas < 1 or p_parcelas > 48 then
    raise exception 'Parcelas de 1 a 48.';
  end if;

  v_parcela := round(p_valor_total / p_parcelas, 2);
  v_ultima := p_valor_total - v_parcela * (p_parcelas - 1);

  for i in 1..p_parcelas loop
    v_data := (p_data + make_interval(months => i - 1))::date;
    insert into transactions (
      type, category_id, description, amount, payment_method, date, scope, client_id, rental_id,
      calendar_event_id, notes, created_by, conta_no_lucro,
      cartao_id, cartao_mov, fatura_ref, parcela_num, parcelas_total, compra_grupo
    ) values (
      'saida', p_category_id,
      v_desc || case when p_parcelas > 1 then ' (' || i || '/' || p_parcelas || ')' else '' end,
      case when i = p_parcelas then v_ultima else v_parcela end,
      'credito', v_data, v_cartao.scope, p_client_id,
      -- Todas as parcelas ficam presas à locação/reserva: o custo dela é o valor cheio.
      p_rental_id, p_calendar_event_id,
      p_notes, auth.uid(), coalesce(p_conta_no_lucro, false) and v_cartao.scope = 'pessoal',
      p_cartao_id, 'compra', public.fatura_da_compra(v_data, v_cartao.dia_fechamento, v_cartao.dia_vencimento),
      case when p_parcelas > 1 then i end, case when p_parcelas > 1 then p_parcelas end, v_grupo
    );
  end loop;

  perform public.registrar_movimentacao(
    'criado', 'cartoes', p_cartao_id, 'Compra no cartão ' || v_cartao.nome,
    jsonb_build_object('descricao', v_desc, 'valor', p_valor_total, 'parcelas', p_parcelas)
  );
  return v_grupo;
end;
$$;

-- Pagamento da fatura: tira o dinheiro da conta, fora do resultado.
create or replace function public.pagar_fatura_cartao(
  p_cartao_id uuid,
  p_fatura_ref text,
  p_valor numeric,
  p_data date default public.hoje_local(),
  p_forma payment_method_type default 'pix'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cartao record;
  v_cat uuid;
  v_id uuid;
begin
  select * into v_cartao from cartoes where id = p_cartao_id;
  if v_cartao.id is null then
    raise exception 'Cartão não encontrado.';
  end if;
  if (v_cartao.scope = 'harmonize' and not has_module_permission('financeiro'))
     or (v_cartao.scope = 'pessoal' and not has_module_permission('pessoal')) then
    raise exception 'Sem permissão para pagar esta fatura.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;
  if p_fatura_ref !~ '^\d{4}-\d{2}$' then
    raise exception 'Fatura inválida.';
  end if;
  select id into v_cat from categories where name = 'Pagamento de fatura' and scope = v_cartao.scope and type = 'saida' limit 1;

  insert into transactions (type, category_id, description, amount, payment_method, date, scope, created_by, cartao_id, cartao_mov, fatura_ref)
  values ('saida', v_cat, 'Fatura ' || v_cartao.nome || ' ' || substr(p_fatura_ref, 6, 2) || '/' || substr(p_fatura_ref, 1, 4),
          p_valor, p_forma, p_data, v_cartao.scope, auth.uid(), p_cartao_id, 'pagamento', p_fatura_ref)
  returning id into v_id;

  perform public.registrar_movimentacao(
    'pago', 'cartoes', p_cartao_id, 'Fatura ' || v_cartao.nome || ' ' || p_fatura_ref,
    jsonb_build_object('valor', p_valor)
  );
  return v_id;
end;
$$;

-- Apaga uma compra inteira (todas as parcelas).
create or replace function public.excluir_compra_cartao(p_compra_grupo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope scope_type;
  v_desc text;
begin
  select scope, description into v_scope, v_desc from transactions where compra_grupo = p_compra_grupo and cartao_mov = 'compra' limit 1;
  if v_scope is null then
    raise exception 'Compra não encontrada.';
  end if;
  if (v_scope = 'harmonize' and not has_module_permission('financeiro'))
     or (v_scope = 'pessoal' and not has_module_permission('pessoal')) then
    raise exception 'Sem permissão para apagar esta compra.';
  end if;
  delete from transactions where compra_grupo = p_compra_grupo and cartao_mov = 'compra';
  perform public.registrar_movimentacao('excluido', 'transactions', null, 'Compra no cartão: ' || v_desc, '{}'::jsonb);
end;
$$;

-- Faturas: compras, pagamentos e datas de cada uma.
create or replace view public.faturas_cartao
with (security_invoker = true) as
with refs as (
  select distinct cartao_id, fatura_ref from public.transactions
  where cartao_id is not null and fatura_ref is not null and is_test = false
)
select
  c.id as cartao_id,
  c.nome,
  c.scope,
  r.fatura_ref,
  public.dia_no_mes(split_part(r.fatura_ref, '-', 1)::int, split_part(r.fatura_ref, '-', 2)::int, c.dia_vencimento) as vencimento,
  case when c.dia_vencimento > c.dia_fechamento
       then public.dia_no_mes(split_part(r.fatura_ref, '-', 1)::int, split_part(r.fatura_ref, '-', 2)::int, c.dia_fechamento)
       else public.dia_no_mes(extract(year from (to_date(r.fatura_ref, 'YYYY-MM') - interval '1 month'))::int,
                              extract(month from (to_date(r.fatura_ref, 'YYYY-MM') - interval '1 month'))::int, c.dia_fechamento)
  end as fechamento,
  coalesce((select sum(t.amount) from public.transactions t
             where t.cartao_id = c.id and t.fatura_ref = r.fatura_ref and t.cartao_mov = 'compra' and t.is_test = false), 0) as total_compras,
  coalesce((select sum(t.amount) from public.transactions t
             where t.cartao_id = c.id and t.fatura_ref = r.fatura_ref and t.cartao_mov = 'pagamento' and t.is_test = false), 0) as total_pago
from refs r
join public.cartoes c on c.id = r.cartao_id;

comment on view public.faturas_cartao is
  'Uma linha por cartão e fatura (mês do vencimento): compras, pago, fechamento e vencimento.';

revoke execute on function public.dia_no_mes(int, int, int) from public, anon;
revoke execute on function public.fatura_da_compra(date, int, int) from public, anon;
revoke execute on function public.salvar_cartao(uuid, text, scope_type, int, int, numeric, boolean) from public, anon;
revoke execute on function public.registrar_compra_cartao(uuid, uuid, numeric, int, date, text, uuid, uuid, uuid, boolean, text) from public, anon;
revoke execute on function public.pagar_fatura_cartao(uuid, text, numeric, date, payment_method_type) from public, anon;
revoke execute on function public.excluir_compra_cartao(uuid) from public, anon;
grant execute on function public.dia_no_mes(int, int, int) to authenticated, service_role;
grant execute on function public.fatura_da_compra(date, int, int) to authenticated, service_role;
grant execute on function public.salvar_cartao(uuid, text, scope_type, int, int, numeric, boolean) to authenticated, service_role;
grant execute on function public.registrar_compra_cartao(uuid, uuid, numeric, int, date, text, uuid, uuid, uuid, boolean, text) to authenticated, service_role;
grant execute on function public.pagar_fatura_cartao(uuid, text, numeric, date, payment_method_type) to authenticated, service_role;
grant execute on function public.excluir_compra_cartao(uuid) to authenticated, service_role;

revoke all on public.cartoes, public.faturas_cartao from anon;
grant select on public.cartoes, public.faturas_cartao to authenticated, service_role;
