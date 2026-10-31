-- Empréstimos também no espaço Pessoal e categorias do importador no Pessoal (31/10/2026).
--
-- Pedido do dono: "Tudo que fizemos no Harmonize quero que esteja disponível no
-- Pessoal também." Sobre compra da Laser Dream no cartão pessoal: "pode ser que
-- aconteça", então entra.
--
-- O que muda no banco:
--   1. emprestimos ganha `scope` ('harmonize' ou 'pessoal', padrão 'harmonize').
--      As linhas que já existem ficam 'harmonize'. O saldo de cada devedor passa
--      a ser contado por espaço: devolução no Pessoal abate o que foi emprestado
--      do Pessoal, e na Harmonize o da Harmonize (hoje tudo é Harmonize, então
--      nada muda nos saldos atuais).
--   2. Leitura (RLS): Harmonize com a permissão financeiro (como sempre),
--      Pessoal com a permissão pessoal.
--   3. Categorias do Pessoal: "Empréstimo concedido" (saída) e "Devolução de
--      empréstimo" (entrada), do sistema; "Juros e encargos do cartão" e
--      "Hospedagem" (saída, comuns), para o importador de fatura sugerir no
--      cartão pessoal. Só cria o que falta (nome único por espaço e tipo).
--   4. Funções de empréstimo aceitam o espaço:
--      - registrar_emprestimo ganha p_scope (último parâmetro, padrão
--        'harmonize'): chamada antiga, sem p_scope, continua igual.
--      - editar_emprestimo e remover_emprestimo (mesma assinatura) usam o espaço
--        da linha (permissão, categoria e scope do lançamento do caixa).
--      - marcar_compra_emprestimo / desmarcar_compra_emprestimo (mesma
--        assinatura) aceitam compra de cartão pessoal; o empréstimo nasce com o
--        espaço da compra e a parcela vai para "Empréstimo concedido" do mesmo
--        espaço.
--      - categoria_emprestimo_concedido passa a receber o espaço (padrão
--        'harmonize'); a versão sem parâmetro sai (só as funções daqui a usam).
--      - Gatilhos: a parcela perde o empréstimo quando muda de espaço em relação
--        ao empréstimo (antes: quando deixava de ser da Harmonize); parcela nova
--        de compra marcada nasce marcada em qualquer espaço.
--
-- Não altera nem apaga dado existente (só cria categorias que faltam).
-- Pode rodar mais de uma vez.

-- ------------------------------------------------------------
-- 1. Coluna scope
-- ------------------------------------------------------------
alter table public.emprestimos add column if not exists scope text not null default 'harmonize';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'emprestimos_scope_check') then
    alter table public.emprestimos
      add constraint emprestimos_scope_check check (scope in ('harmonize', 'pessoal'));
  end if;
end;
$$;

comment on column public.emprestimos.scope is
  'Espaço do empréstimo: harmonize (caixa e cartões da Harmonize) ou pessoal (conta e cartões pessoais). O saldo de cada devedor é contado por espaço.';

create index if not exists emprestimos_scope_devedor_idx on public.emprestimos (scope, devedor);

-- ------------------------------------------------------------
-- 2. Leitura por espaço
-- ------------------------------------------------------------
drop policy if exists "emprestimos_select" on public.emprestimos;
create policy "emprestimos_select" on public.emprestimos for select
  using ((scope = 'harmonize' and has_module_permission('financeiro'))
      or (scope = 'pessoal' and has_module_permission('pessoal')));

-- ------------------------------------------------------------
-- 3. Categorias do Pessoal
-- ------------------------------------------------------------
insert into public.categories (name, type, scope, is_default, sistema, arquivada, ordem)
select s.name, s.type::entry_type, 'pessoal'::scope_type, s.sistema, s.sistema, false, 0
  from (values
    ('Empréstimo concedido', 'saida', true),
    ('Devolução de empréstimo', 'entrada', true),
    ('Juros e encargos do cartão', 'saida', false),
    ('Hospedagem', 'saida', false)
  ) as s(name, type, sistema)
 where not exists (
   select 1 from public.categories c
    where c.scope::text = 'pessoal' and c.type::text = s.type
      and lower(btrim(c.name)) = lower(s.name)
 );

-- As duas de empréstimo são do sistema (as funções procuram pelo nome).
update public.categories set sistema = true
 where scope = 'pessoal' and sistema is distinct from true
   and ((name = 'Empréstimo concedido' and type = 'saida') or (name = 'Devolução de empréstimo' and type = 'entrada'));

-- ------------------------------------------------------------
-- 4. Peças internas (sem EXECUTE para quem está logado)
-- ------------------------------------------------------------

-- Permissão para mexer em empréstimo do espaço.
create or replace function public.pode_mexer_emprestimo(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when p_scope = 'pessoal' then has_module_permission('pessoal') else has_module_permission('financeiro') end;
$$;

revoke execute on function public.pode_mexer_emprestimo(text) from public, anon, authenticated;

-- Categoria de empréstimo/devolução do espaço.
create or replace function public.categoria_de_emprestimo(p_scope text, p_tipo text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from categories
   where scope::text = coalesce(p_scope, 'harmonize')
     and type::text = case when p_tipo = 'concedido' then 'saida' else 'entrada' end
     and name = case when p_tipo = 'concedido' then 'Empréstimo concedido' else 'Devolução de empréstimo' end
   order by created_at
   limit 1;
$$;

revoke execute on function public.categoria_de_emprestimo(text, text) from public, anon, authenticated;

-- A versão sem parâmetro sai: a nova tem o espaço com padrão 'harmonize'
-- (manter as duas deixaria a chamada sem argumento ambígua).
drop function if exists public.categoria_emprestimo_concedido();
create or replace function public.categoria_emprestimo_concedido(p_scope text default 'harmonize')
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.categoria_de_emprestimo(p_scope, 'concedido');
$$;

revoke execute on function public.categoria_emprestimo_concedido(text) from public, anon, authenticated;

-- Saldo de um devedor num espaço (concedido menos devolvido).
create or replace function public.saldo_emprestimo_devedor(p_devedor text, p_scope text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case when tipo = 'concedido' then valor else -valor end), 0)
    from emprestimos where devedor = p_devedor and scope = coalesce(p_scope, 'harmonize');
$$;

revoke execute on function public.saldo_emprestimo_devedor(text, text) from public, anon, authenticated;

-- Marca uma parcela. Devolve true quando criou ou mudou o devedor.
create or replace function public.marcar_parcela_emprestimo(p_transaction_id uuid, p_devedor text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t transactions%rowtype;
  v_cat uuid;
  v_existente emprestimos%rowtype;
begin
  select * into v_t from transactions where id = p_transaction_id;
  if v_t.id is null or v_t.cartao_mov is distinct from 'compra' then
    return false;
  end if;
  v_cat := public.categoria_emprestimo_concedido(v_t.scope::text);
  if v_cat is null then
    raise exception 'Falta a categoria "Empréstimo concedido" do espaço %.',
      case when v_t.scope::text = 'pessoal' then 'Pessoal' else 'Harmonize' end;
  end if;

  select * into v_existente from emprestimos where transaction_id = p_transaction_id and origem = 'cartao';
  if v_existente.id is not null then
    if v_existente.devedor <> p_devedor or v_existente.scope <> v_t.scope::text then
      update emprestimos set devedor = p_devedor, scope = v_t.scope::text where id = v_existente.id;
      if v_t.category_id is distinct from v_cat then
        update transactions set category_id = v_cat where id = p_transaction_id;
      end if;
      return true;
    end if;
    -- Já marcada: só garante a categoria.
    if v_t.category_id is distinct from v_cat then
      update transactions set category_id = v_cat where id = p_transaction_id;
    end if;
    return false;
  end if;

  insert into emprestimos (devedor, tipo, valor, data, descricao, transaction_id, is_test, created_by, origem, categoria_anterior, scope)
  values (
    p_devedor, 'concedido', v_t.amount, v_t.date,
    public.emprestimo_cartao_descricao(v_t.description, v_t.parcela_num, v_t.parcelas_total, v_t.cartao_id),
    v_t.id, v_t.is_test, auth.uid(), 'cartao',
    case when v_t.category_id is distinct from v_cat then v_t.category_id end,
    v_t.scope::text
  );
  if v_t.category_id is distinct from v_cat then
    update transactions set category_id = v_cat where id = p_transaction_id;
  end if;
  return true;
end;
$$;

revoke execute on function public.marcar_parcela_emprestimo(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Funções chamadas pela tela Cartões (mesma assinatura)
-- ------------------------------------------------------------
create or replace function public.marcar_compra_emprestimo(
  p_transaction_id uuid,
  p_devedor text,
  p_todas_parcelas boolean default true
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t transactions%rowtype;
  v_devedor text := upper(trim(coalesce(p_devedor, '')));
  v_parcela record;
  v_qtd int := 0;
  v_total numeric := 0;
  v_primeiro uuid;
begin
  select * into v_t from transactions where id = p_transaction_id;
  if v_t.id is null then
    if not has_module_permission('financeiro') and not has_module_permission('pessoal') then
      raise exception 'Sem permissão para lançar empréstimos.';
    end if;
    raise exception 'Compra não encontrada.';
  end if;
  if not public.pode_mexer_emprestimo(v_t.scope::text) then
    raise exception 'Sem permissão para lançar empréstimos.';
  end if;
  if v_devedor = '' then
    raise exception 'Informe para quem foi o empréstimo.';
  end if;
  if v_t.cartao_mov is distinct from 'compra' then
    raise exception 'Só compra no cartão pode virar empréstimo por aqui.';
  end if;

  for v_parcela in
    select id, amount from transactions
     where cartao_mov = 'compra' and scope = v_t.scope
       and (id = v_t.id
            or (coalesce(p_todas_parcelas, true) and v_t.compra_grupo is not null
                and compra_grupo = v_t.compra_grupo and cartao_id = v_t.cartao_id))
     order by parcela_num nulls first, date
  loop
    if public.marcar_parcela_emprestimo(v_parcela.id, v_devedor) then
      v_qtd := v_qtd + 1;
      v_total := v_total + v_parcela.amount;
    end if;
  end loop;

  if v_qtd > 0 then
    select id into v_primeiro from emprestimos where transaction_id = v_t.id and origem = 'cartao';
    perform public.registrar_movimentacao(
      'criado', 'emprestimos', v_primeiro,
      'Compra no cartão ' || case when v_t.scope::text = 'pessoal' then '(Pessoal) ' else '' end
        || 'vira empréstimo para ' || v_devedor || ': '
        || public.emprestimo_cartao_descricao(v_t.description, null, null, v_t.cartao_id)
        || ' (' || v_qtd || case when v_qtd = 1 then ' parcela, ' else ' parcelas, ' end
        || public.formatar_reais(v_total) || ')',
      jsonb_build_object('transaction_id', v_t.id, 'compra_grupo', v_t.compra_grupo, 'devedor', v_devedor,
                         'parcelas', v_qtd, 'total', v_total, 'escopo', v_t.scope)
    );
  end if;
  return v_qtd;
end;
$$;

revoke execute on function public.marcar_compra_emprestimo(uuid, text, boolean) from public, anon;
grant execute on function public.marcar_compra_emprestimo(uuid, text, boolean) to authenticated, service_role;

create or replace function public.desmarcar_compra_emprestimo(
  p_transaction_id uuid,
  p_todas_parcelas boolean default true
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t transactions%rowtype;
  v_linha record;
  v_qtd int := 0;
  v_total numeric := 0;
  v_devedores text[] := '{}';
  v_devedor text;
begin
  select * into v_t from transactions where id = p_transaction_id;
  if v_t.id is null then
    if not has_module_permission('financeiro') and not has_module_permission('pessoal') then
      raise exception 'Sem permissão para alterar empréstimos.';
    end if;
    raise exception 'Compra não encontrada.';
  end if;
  if not public.pode_mexer_emprestimo(v_t.scope::text) then
    raise exception 'Sem permissão para alterar empréstimos.';
  end if;

  for v_linha in
    select e.id, e.devedor, e.valor, e.categoria_anterior, t.id as tid
      from emprestimos e
      join transactions t on t.id = e.transaction_id
     where e.origem = 'cartao'
       and (t.id = v_t.id
            or (coalesce(p_todas_parcelas, true) and v_t.compra_grupo is not null
                and t.compra_grupo = v_t.compra_grupo and t.cartao_id = v_t.cartao_id))
  loop
    delete from emprestimos where id = v_linha.id;
    -- Volta para a categoria de antes (nula se a parcela não tinha categoria).
    update transactions set category_id = v_linha.categoria_anterior where id = v_linha.tid;
    v_qtd := v_qtd + 1;
    v_total := v_total + v_linha.valor;
    if not v_linha.devedor = any (v_devedores) then
      v_devedores := v_devedores || v_linha.devedor;
    end if;
  end loop;

  if v_qtd = 0 then
    return 0;
  end if;

  -- Nenhum devedor pode ficar devolvendo mais do que pegou (no espaço da compra).
  foreach v_devedor in array v_devedores loop
    if round(public.saldo_emprestimo_devedor(v_devedor, v_t.scope::text), 2) < 0 then
      raise exception 'Com isso, % teria devolvido mais do que pegou emprestado. Ajuste a devolução em Empréstimos antes.', v_devedor;
    end if;
  end loop;

  perform public.registrar_movimentacao(
    'excluido', 'emprestimos', null,
    'Compra no cartão ' || case when v_t.scope::text = 'pessoal' then '(Pessoal) ' else '' end
      || 'deixou de ser empréstimo: '
      || public.emprestimo_cartao_descricao(v_t.description, null, null, v_t.cartao_id)
      || ' (' || v_qtd || case when v_qtd = 1 then ' parcela, ' else ' parcelas, ' end
      || public.formatar_reais(v_total) || ')',
    jsonb_build_object('transaction_id', v_t.id, 'compra_grupo', v_t.compra_grupo, 'devedores', to_jsonb(v_devedores),
                       'parcelas', v_qtd, 'total', v_total, 'escopo', v_t.scope)
  );
  return v_qtd;
end;
$$;

revoke execute on function public.desmarcar_compra_emprestimo(uuid, boolean) from public, anon;
grant execute on function public.desmarcar_compra_emprestimo(uuid, boolean) to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. Gatilhos em transactions (os gatilhos continuam os mesmos; muda a função)
-- ------------------------------------------------------------

-- Parcela mudou: o empréstimo acompanha (ou sai, se ela deixou de ser empréstimo
-- ou mudou de espaço em relação ao empréstimo).
create or replace function public.emprestimo_cartao_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e emprestimos%rowtype;
begin
  select * into v_e from emprestimos where transaction_id = new.id and origem = 'cartao';
  if v_e.id is null then
    return null;
  end if;
  if new.cartao_mov is distinct from 'compra' or new.scope::text <> v_e.scope
     or new.category_id is distinct from public.categoria_emprestimo_concedido(v_e.scope) then
    delete from emprestimos where id = v_e.id;
    return null;
  end if;
  update emprestimos
     set valor = new.amount,
         data = new.date,
         is_test = new.is_test,
         descricao = public.emprestimo_cartao_descricao(new.description, new.parcela_num, new.parcelas_total, new.cartao_id)
   where id = v_e.id
     and (valor is distinct from new.amount or data is distinct from new.date or is_test is distinct from new.is_test
          or descricao is distinct from public.emprestimo_cartao_descricao(new.description, new.parcela_num, new.parcelas_total, new.cartao_id));
  return null;
end;
$$;

revoke execute on function public.emprestimo_cartao_sincronizar() from public, anon, authenticated;

-- Parcela nova de uma compra já marcada (importação da fatura seguinte): nasce
-- marcada, em qualquer espaço (o empréstimo leva o espaço da parcela).
create or replace function public.emprestimo_cartao_parcela_nova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devedor text;
begin
  if new.cartao_mov is distinct from 'compra' or new.compra_grupo is null then
    return null;
  end if;
  select e.devedor into v_devedor
    from emprestimos e
    join transactions t on t.id = e.transaction_id
   where e.origem = 'cartao'
     and e.scope = new.scope::text
     and t.compra_grupo = new.compra_grupo
     and t.cartao_id = new.cartao_id
     and t.id <> new.id
   order by e.created_at desc
   limit 1;
  if v_devedor is not null then
    perform public.marcar_parcela_emprestimo(new.id, v_devedor);
  end if;
  return null;
end;
$$;

revoke execute on function public.emprestimo_cartao_parcela_nova() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7. Registrar, editar e apagar empréstimo pelo espaço
-- ------------------------------------------------------------

-- registrar_emprestimo ganha p_scope no fim (padrão 'harmonize'). Sai a de 7
-- parâmetros: com as duas, a chamada sem p_scope ficaria ambígua.
drop function if exists public.registrar_emprestimo(text, text, numeric, payment_method_type, date, text, boolean);
create or replace function public.registrar_emprestimo(
  p_devedor text,
  p_tipo text,
  p_valor numeric,
  p_forma payment_method_type,
  p_data date default public.hoje_local(),
  p_descricao text default null,
  p_sem_caixa boolean default false,
  p_scope text default 'harmonize'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devedor text := upper(trim(coalesce(p_devedor, '')));
  v_scope text := coalesce(nullif(trim(p_scope), ''), 'harmonize');
  v_categoria uuid;
  v_transacao uuid;
  v_id uuid;
  v_saldo numeric;
begin
  if v_scope not in ('harmonize', 'pessoal') then
    raise exception 'Espaço inválido.';
  end if;
  if not public.pode_mexer_emprestimo(v_scope) then
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
    v_saldo := public.saldo_emprestimo_devedor(v_devedor, v_scope);
    if round(p_valor, 2) > round(v_saldo, 2) then
      raise exception 'A devolução (%) é maior que o saldo devido por % (%).',
        public.formatar_reais(p_valor), v_devedor, public.formatar_reais(v_saldo);
    end if;
  end if;

  v_categoria := public.categoria_de_emprestimo(v_scope, p_tipo);

  -- Só a pendência: empréstimo antigo, registra quem deve sem mexer no caixa.
  if not coalesce(p_sem_caixa, false) then
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, notes, created_by)
    values (
      case when p_tipo = 'concedido' then 'saida' else 'entrada' end::entry_type,
      v_categoria,
      case when p_tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de empréstimo - ' end || v_devedor,
      p_valor, p_forma, coalesce(p_data, hoje_local()), v_scope::scope_type, nullif(trim(p_descricao), ''), auth.uid()
    )
    returning id into v_transacao;
  end if;

  insert into emprestimos (devedor, tipo, valor, data, descricao, transaction_id, created_by, scope)
  values (v_devedor, p_tipo, p_valor, coalesce(p_data, hoje_local()), nullif(trim(p_descricao), ''), v_transacao, auth.uid(), v_scope)
  returning id into v_id;

  perform public.registrar_movimentacao(
    'criado', 'emprestimos', v_id,
    case when p_tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de ' end || v_devedor
      || ' (' || public.formatar_reais(p_valor) || ')'
      || case when v_scope = 'pessoal' then ' · Pessoal' else '' end,
    jsonb_build_object('tipo', p_tipo, 'valor', round(p_valor, 2), 'devedor', v_devedor, 'escopo', v_scope)
  );

  return v_id;
end;
$$;

revoke execute on function public.registrar_emprestimo(text, text, numeric, payment_method_type, date, text, boolean, text) from public, anon;
grant execute on function public.registrar_emprestimo(text, text, numeric, payment_method_type, date, text, boolean, text) to authenticated, service_role;

create or replace function public.remover_emprestimo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha emprestimos%rowtype;
begin
  select * into v_linha from emprestimos where id = p_id;
  if not found then
    if not has_module_permission('financeiro') and not has_module_permission('pessoal') then
      raise exception 'Sem permissão para alterar empréstimos.';
    end if;
    raise exception 'Lançamento de empréstimo não encontrado.';
  end if;
  if not public.pode_mexer_emprestimo(v_linha.scope) then
    raise exception 'Sem permissão para alterar empréstimos.';
  end if;
  if v_linha.origem = 'cartao' then
    raise exception 'Este empréstimo é uma compra no cartão. Para desfazer, abra a compra em Cartões e toque em "Não é da Laser Dream".';
  end if;

  delete from emprestimos where id = p_id;
  if v_linha.transaction_id is not null then
    delete from transactions where id = v_linha.transaction_id;
  end if;

  perform public.registrar_movimentacao(
    'excluido', 'emprestimos', p_id,
    case when v_linha.tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de ' end || v_linha.devedor
      || ' (' || public.formatar_reais(v_linha.valor) || ')'
      || case when v_linha.scope = 'pessoal' then ' · Pessoal' else '' end,
    jsonb_build_object('tipo', v_linha.tipo, 'valor', v_linha.valor, 'data', v_linha.data, 'escopo', v_linha.scope)
  );
end;
$$;

revoke execute on function public.remover_emprestimo(uuid) from public, anon;
grant execute on function public.remover_emprestimo(uuid) to authenticated, service_role;

create or replace function public.editar_emprestimo(
  p_id uuid,
  p_devedor text,
  p_valor numeric,
  p_forma payment_method_type,
  p_data date,
  p_descricao text default null,
  p_sem_caixa boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes emprestimos%rowtype;
  v_devedor text := upper(trim(coalesce(p_devedor, '')));
begin
  select * into v_antes from emprestimos where id = p_id;
  if not found then
    if not has_module_permission('financeiro') and not has_module_permission('pessoal') then
      raise exception 'Sem permissão para alterar empréstimos.';
    end if;
    raise exception 'Lançamento de empréstimo não encontrado.';
  end if;
  if not public.pode_mexer_emprestimo(v_antes.scope) then
    raise exception 'Sem permissão para alterar empréstimos.';
  end if;
  if v_antes.origem = 'cartao' then
    raise exception 'Este empréstimo é uma compra no cartão: valor e data vêm da fatura. Para mudar, abra a compra em Cartões (lá também tem "Não é da Laser Dream").';
  end if;
  if v_devedor = '' then
    raise exception 'Informe para quem foi o empréstimo.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;
  if p_data is null then
    raise exception 'Informe a data.';
  end if;

  update emprestimos
     set devedor = v_devedor, valor = p_valor, data = p_data, descricao = nullif(trim(p_descricao), '')
   where id = p_id;

  -- Nenhum devedor pode ficar devolvendo mais do que pegou (no mesmo espaço).
  if round(public.saldo_emprestimo_devedor(v_devedor, v_antes.scope), 2) < 0 then
    raise exception 'Com essa mudança, % teria devolvido mais do que pegou emprestado.', v_devedor;
  end if;
  if v_antes.devedor <> v_devedor
     and round(public.saldo_emprestimo_devedor(v_antes.devedor, v_antes.scope), 2) < 0 then
    raise exception 'Com essa mudança, % teria devolvido mais do que pegou emprestado.', v_antes.devedor;
  end if;

  -- Só a pendência: tira o lançamento do caixa.
  if coalesce(p_sem_caixa, false) and v_antes.transaction_id is not null then
    update emprestimos set transaction_id = null where id = p_id;
    delete from transactions where id = v_antes.transaction_id;
    v_antes.transaction_id := null;
  end if;
  -- Voltou a mexer no caixa: cria o lançamento (no espaço do empréstimo).
  if p_sem_caixa is false and v_antes.transaction_id is null then
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, notes, created_by)
    values (
      case when v_antes.tipo = 'concedido' then 'saida' else 'entrada' end::entry_type,
      public.categoria_de_emprestimo(v_antes.scope, v_antes.tipo),
      case when v_antes.tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de empréstimo - ' end || v_devedor,
      p_valor, p_forma, p_data, v_antes.scope::scope_type, nullif(trim(p_descricao), ''), auth.uid()
    )
    returning id into v_antes.transaction_id;
    update emprestimos set transaction_id = v_antes.transaction_id where id = p_id;
  elsif v_antes.transaction_id is not null then
    update transactions
       set amount = p_valor, date = p_data, payment_method = p_forma, notes = nullif(trim(p_descricao), ''),
           description = case when v_antes.tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de empréstimo - ' end || v_devedor
     where id = v_antes.transaction_id;
  end if;

  perform public.registrar_movimentacao(
    'editado', 'emprestimos', p_id,
    case when v_antes.tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de ' end || v_devedor
      || ' (' || public.formatar_reais(p_valor) || ')'
      || case when v_antes.scope = 'pessoal' then ' · Pessoal' else '' end,
    jsonb_build_object('antes', jsonb_build_object('devedor', v_antes.devedor, 'valor', v_antes.valor, 'data', v_antes.data),
                       'depois', jsonb_build_object('devedor', v_devedor, 'valor', round(p_valor, 2), 'data', p_data),
                       'escopo', v_antes.scope)
  );
end;
$$;

revoke execute on function public.editar_emprestimo(uuid, text, numeric, payment_method_type, date, text, boolean) from public, anon;
grant execute on function public.editar_emprestimo(uuid, text, numeric, payment_method_type, date, text, boolean) to authenticated, service_role;
