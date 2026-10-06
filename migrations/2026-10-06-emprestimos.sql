-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 06/10/2026, pelo dono, e conferida por consulta de leitura.
--
-- Controle de empréstimos que o dono faz a terceiros (LASER DREAM CAMPINA
-- GRANDE, LASER DREAM MIRAMAR). Empréstimo não é despesa nem receita: é
-- dinheiro que sai do caixa e deve voltar.
--   - Cada movimento (empréstimo ou devolução) vira uma linha em
--     emprestimos e um lançamento no Financeiro, para o saldo do caixa
--     continuar certo.
--   - Os lançamentos usam as categorias "Empréstimo concedido" (saída) e
--     "Devolução de empréstimo" (entrada), que as telas deixam fora do
--     Resultado e dos relatórios de faturamento.
--   - O lançamento não leva client_id de propósito: a view
--     transactions_contabilizaveis esconde lançamento de cliente marcado
--     excluir_financeiro, e o dinheiro do empréstimo saiu do caixa de verdade.
-- ============================================================

insert into public.categories (name, type, scope, is_default)
select v.name, v.type::entry_type, 'harmonize', true
  from (values ('Empréstimo concedido', 'saida'), ('Devolução de empréstimo', 'entrada')) v(name, type)
 where not exists (
   select 1 from public.categories c
    where c.name = v.name and c.type = v.type::entry_type and c.scope = 'harmonize'
 );

create table if not exists public.emprestimos (
  id uuid primary key default gen_random_uuid(),
  devedor text not null check (length(trim(devedor)) > 0),
  tipo text not null check (tipo in ('concedido', 'devolucao')),
  valor numeric(12,2) not null check (valor > 0),
  data date not null default public.hoje_local(),
  descricao text,
  transaction_id uuid references public.transactions(id) on delete set null,
  is_test boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.emprestimos is
  'Empréstimos que o dono faz a terceiros e as devoluções. Saldo por devedor = concedido - devolvido. Cada linha tem um lançamento espelho em transactions (categorias Empréstimo concedido / Devolução de empréstimo).';

create index if not exists emprestimos_devedor_idx on public.emprestimos (devedor);

alter table public.emprestimos enable row level security;

drop policy if exists "emprestimos_select" on public.emprestimos;
create policy "emprestimos_select" on public.emprestimos for select using (has_module_permission('financeiro'));
-- Sem insert/update/delete direto: só pelas funções abaixo, que mantêm o
-- lançamento do Financeiro junto.

drop trigger if exists emprestimos_apply_test_mode on public.emprestimos;
create trigger emprestimos_apply_test_mode
  before insert on public.emprestimos
  for each row execute function public.apply_test_mode();

create or replace function public.registrar_emprestimo(
  p_devedor text,
  p_tipo text,
  p_valor numeric,
  p_forma payment_method_type,
  p_data date default public.hoje_local(),
  p_descricao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devedor text := upper(trim(coalesce(p_devedor, '')));
  v_categoria uuid;
  v_transacao uuid;
  v_id uuid;
  v_saldo numeric;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para lançar empréstimos.';
  end if;
  if v_devedor = '' then
    raise exception 'Informe para quem foi o empréstimo.';
  end if;
  if p_tipo not in ('concedido', 'devolucao') then
    raise exception 'Tipo inválido.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;

  if p_tipo = 'devolucao' then
    select coalesce(sum(case when tipo = 'concedido' then valor else -valor end), 0)
      into v_saldo
      from emprestimos where devedor = v_devedor;
    if round(p_valor, 2) > round(v_saldo, 2) then
      raise exception 'A devolução (%) é maior que o saldo devido por % (%).',
        public.formatar_reais(p_valor), v_devedor, public.formatar_reais(v_saldo);
    end if;
  end if;

  select id into v_categoria
    from categories
   where scope = 'harmonize'
     and name = case when p_tipo = 'concedido' then 'Empréstimo concedido' else 'Devolução de empréstimo' end
   limit 1;

  insert into transactions (type, category_id, description, amount, payment_method, date, scope, notes, created_by)
  values (
    case when p_tipo = 'concedido' then 'saida' else 'entrada' end::entry_type,
    v_categoria,
    case when p_tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de empréstimo - ' end || v_devedor,
    p_valor, p_forma, coalesce(p_data, hoje_local()), 'harmonize', nullif(trim(p_descricao), ''), auth.uid()
  )
  returning id into v_transacao;

  insert into emprestimos (devedor, tipo, valor, data, descricao, transaction_id, created_by)
  values (v_devedor, p_tipo, p_valor, coalesce(p_data, hoje_local()), nullif(trim(p_descricao), ''), v_transacao, auth.uid())
  returning id into v_id;

  perform public.registrar_movimentacao(
    'criado', 'emprestimos', v_id,
    case when p_tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de ' end || v_devedor
      || ' (' || public.formatar_reais(p_valor) || ')',
    jsonb_build_object('tipo', p_tipo, 'valor', round(p_valor, 2), 'devedor', v_devedor)
  );

  return v_id;
end;
$$;

create or replace function public.remover_emprestimo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha emprestimos%rowtype;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para alterar empréstimos.';
  end if;

  select * into v_linha from emprestimos where id = p_id;
  if not found then
    raise exception 'Lançamento de empréstimo não encontrado.';
  end if;

  delete from emprestimos where id = p_id;
  if v_linha.transaction_id is not null then
    delete from transactions where id = v_linha.transaction_id;
  end if;

  perform public.registrar_movimentacao(
    'excluido', 'emprestimos', p_id,
    case when v_linha.tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de ' end || v_linha.devedor
      || ' (' || public.formatar_reais(v_linha.valor) || ')',
    jsonb_build_object('tipo', v_linha.tipo, 'valor', v_linha.valor, 'data', v_linha.data)
  );
end;
$$;

revoke execute on function public.registrar_emprestimo(text, text, numeric, payment_method_type, date, text) from public, anon;
grant execute on function public.registrar_emprestimo(text, text, numeric, payment_method_type, date, text) to authenticated, service_role;
revoke execute on function public.remover_emprestimo(uuid) from public, anon;
grant execute on function public.remover_emprestimo(uuid) to authenticated, service_role;
