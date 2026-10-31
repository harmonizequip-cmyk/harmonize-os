-- Compra no cartão da Harmonize que é da Laser Dream vira empréstimo (31/10/2026).
--
-- Pedido do dono: muita coisa no cartão de crédito é paga pela Harmonize mas
-- pertence à Laser Dream; isso também é empréstimo. Decisões dele:
--   - Cada parcela vira um empréstimo no mês em que a fatura dela vence
--     (emprestimos.data = transactions.date, que o gatilho do cartão já põe no
--     vencimento da fatura).
--   - Resultado e lucro da Harmonize continuam sem empréstimo: a parcela marcada
--     passa para a categoria "Empréstimo concedido", que as telas já deixam fora
--     de Entradas/Saídas/Resultado. A compra continua no cartão e na fatura (o
--     dinheiro sai quando a fatura é paga), então o saldo do caixa não muda.
--
-- O que muda no banco:
--   1. emprestimos ganha `origem` ('manual' = lançado em Empréstimos ou no Novo
--      lançamento, como sempre; 'cartao' = parcela de compra no cartão) e
--      `categoria_anterior` (categoria que a parcela tinha antes, para desfazer).
--      Índice único: uma linha de empréstimo por parcela de cartão.
--   2. marcar_compra_emprestimo(compra, devedor, todas_parcelas): marca a compra
--      (todas as parcelas do mesmo compra_grupo, ou só aquela). Idempotente:
--      parcela já marcada só troca o devedor, se for outro.
--   3. desmarcar_compra_emprestimo(compra, todas_parcelas): devolve a categoria
--      anterior e apaga os empréstimos ligados.
--   4. Gatilhos em transactions mantêm tudo junto:
--      - mudou valor, data (reimportação, edição, vencimento do cartão) ou
--        descrição da parcela: o empréstimo acompanha;
--      - a parcela deixou de ser compra da Harmonize ou saiu da categoria
--        "Empréstimo concedido": o empréstimo ligado sai (equivale a desmarcar);
--      - parcela apagada (Apagar compra, Desfazer importação): o empréstimo some;
--      - parcela nova de uma compra já marcada (importação da fatura seguinte):
--        já nasce marcada, com o mesmo devedor.
--   5. editar_emprestimo e remover_emprestimo recusam linha de origem cartão
--      (desfaz no cartão, com "Não é da Laser Dream"), nunca apagam a compra.
--
-- Pode rodar mais de uma vez.

-- ------------------------------------------------------------
-- 1. Colunas e índice
-- ------------------------------------------------------------
alter table public.emprestimos add column if not exists origem text not null default 'manual';
alter table public.emprestimos add column if not exists categoria_anterior uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'emprestimos_origem_check') then
    alter table public.emprestimos
      add constraint emprestimos_origem_check check (origem in ('manual', 'cartao'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'emprestimos_categoria_anterior_fkey') then
    alter table public.emprestimos
      add constraint emprestimos_categoria_anterior_fkey
      foreign key (categoria_anterior) references public.categories(id) on delete set null;
  end if;
end;
$$;

comment on column public.emprestimos.origem is
  'De onde veio: manual (Empréstimos ou Novo lançamento, com ou sem lançamento no caixa) ou cartao (parcela de compra no cartão da Harmonize marcada como da Laser Dream; transaction_id é a parcela).';
comment on column public.emprestimos.categoria_anterior is
  'Origem cartão: categoria que a parcela tinha antes de virar "Empréstimo concedido". Desmarcar devolve esta categoria.';

create unique index if not exists emprestimos_cartao_transacao_uidx
  on public.emprestimos (transaction_id) where origem = 'cartao';

-- A categoria de sempre precisa existir (a migration de 06/10 já cria).
insert into public.categories (name, type, scope, is_default, sistema)
select 'Empréstimo concedido', 'saida', 'harmonize', true, true
 where not exists (
   select 1 from public.categories
    where name = 'Empréstimo concedido' and type = 'saida' and scope = 'harmonize'
 );

-- ------------------------------------------------------------
-- 2. Peças internas (sem EXECUTE para quem está logado)
-- ------------------------------------------------------------

-- Descrição do empréstimo: "Loja X · parcela 2/3 · cartão NUBANK".
create or replace function public.emprestimo_cartao_descricao(
  p_descricao text, p_parcela int, p_parcelas int, p_cartao_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select left(
    coalesce(nullif(trim(regexp_replace(coalesce(p_descricao, ''), '\s*\(\d+/\d+\)\s*$', '')), ''), 'Compra no cartão')
    || case when coalesce(p_parcelas, 1) > 1 then ' · parcela ' || p_parcela || '/' || p_parcelas else '' end
    || coalesce(' · cartão ' || (select nome from cartoes where id = p_cartao_id), ''),
    300
  );
$$;

revoke execute on function public.emprestimo_cartao_descricao(text, int, int, uuid) from public, anon, authenticated;

create or replace function public.categoria_emprestimo_concedido()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from categories
   where name = 'Empréstimo concedido' and type = 'saida' and scope = 'harmonize'
   order by created_at
   limit 1;
$$;

revoke execute on function public.categoria_emprestimo_concedido() from public, anon, authenticated;

-- Marca uma parcela. Devolve true quando criou ou mudou o devedor.
create or replace function public.marcar_parcela_emprestimo(p_transaction_id uuid, p_devedor text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t transactions%rowtype;
  v_cat uuid := public.categoria_emprestimo_concedido();
  v_existente emprestimos%rowtype;
begin
  if v_cat is null then
    raise exception 'Falta a categoria "Empréstimo concedido" da Harmonize.';
  end if;
  select * into v_t from transactions where id = p_transaction_id;
  if v_t.id is null or v_t.cartao_mov is distinct from 'compra' or v_t.scope <> 'harmonize' then
    return false;
  end if;

  select * into v_existente from emprestimos where transaction_id = p_transaction_id and origem = 'cartao';
  if v_existente.id is not null then
    if v_existente.devedor <> p_devedor then
      update emprestimos set devedor = p_devedor where id = v_existente.id;
      return true;
    end if;
    -- Já marcada: só garante a categoria.
    if v_t.category_id is distinct from v_cat then
      update transactions set category_id = v_cat where id = p_transaction_id;
    end if;
    return false;
  end if;

  insert into emprestimos (devedor, tipo, valor, data, descricao, transaction_id, is_test, created_by, origem, categoria_anterior)
  values (
    p_devedor, 'concedido', v_t.amount, v_t.date,
    public.emprestimo_cartao_descricao(v_t.description, v_t.parcela_num, v_t.parcelas_total, v_t.cartao_id),
    v_t.id, v_t.is_test, auth.uid(), 'cartao',
    case when v_t.category_id is distinct from v_cat then v_t.category_id end
  );
  if v_t.category_id is distinct from v_cat then
    update transactions set category_id = v_cat where id = p_transaction_id;
  end if;
  return true;
end;
$$;

revoke execute on function public.marcar_parcela_emprestimo(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Funções chamadas pela tela Cartões
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
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para lançar empréstimos.';
  end if;
  if v_devedor = '' then
    raise exception 'Informe para quem foi o empréstimo.';
  end if;
  select * into v_t from transactions where id = p_transaction_id;
  if v_t.id is null then
    raise exception 'Compra não encontrada.';
  end if;
  if v_t.cartao_mov is distinct from 'compra' then
    raise exception 'Só compra no cartão pode virar empréstimo por aqui.';
  end if;
  if v_t.scope <> 'harmonize' then
    raise exception 'Só compra num cartão da Harmonize vira empréstimo.';
  end if;

  for v_parcela in
    select id, amount from transactions
     where cartao_mov = 'compra' and scope = 'harmonize'
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
      'Compra no cartão vira empréstimo para ' || v_devedor || ': '
        || public.emprestimo_cartao_descricao(v_t.description, null, null, v_t.cartao_id)
        || ' (' || v_qtd || case when v_qtd = 1 then ' parcela, ' else ' parcelas, ' end
        || public.formatar_reais(v_total) || ')',
      jsonb_build_object('transaction_id', v_t.id, 'compra_grupo', v_t.compra_grupo, 'devedor', v_devedor,
                         'parcelas', v_qtd, 'total', v_total)
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
  v_saldo numeric;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para alterar empréstimos.';
  end if;
  select * into v_t from transactions where id = p_transaction_id;
  if v_t.id is null then
    raise exception 'Compra não encontrada.';
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

  -- Nenhum devedor pode ficar devolvendo mais do que pegou.
  foreach v_devedor in array v_devedores loop
    select coalesce(sum(case when tipo = 'concedido' then valor else -valor end), 0) into v_saldo
      from emprestimos where devedor = v_devedor;
    if round(v_saldo, 2) < 0 then
      raise exception 'Com isso, % teria devolvido mais do que pegou emprestado. Ajuste a devolução em Empréstimos antes.', v_devedor;
    end if;
  end loop;

  perform public.registrar_movimentacao(
    'excluido', 'emprestimos', null,
    'Compra no cartão deixou de ser empréstimo: '
      || public.emprestimo_cartao_descricao(v_t.description, null, null, v_t.cartao_id)
      || ' (' || v_qtd || case when v_qtd = 1 then ' parcela, ' else ' parcelas, ' end
      || public.formatar_reais(v_total) || ')',
    jsonb_build_object('transaction_id', v_t.id, 'compra_grupo', v_t.compra_grupo, 'devedores', to_jsonb(v_devedores),
                       'parcelas', v_qtd, 'total', v_total)
  );
  return v_qtd;
end;
$$;

revoke execute on function public.desmarcar_compra_emprestimo(uuid, boolean) from public, anon;
grant execute on function public.desmarcar_compra_emprestimo(uuid, boolean) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. Gatilhos em transactions
-- ------------------------------------------------------------

-- Parcela mudou: o empréstimo acompanha (ou sai, se ela deixou de ser empréstimo).
create or replace function public.emprestimo_cartao_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from emprestimos where transaction_id = new.id and origem = 'cartao';
  if v_id is null then
    return null;
  end if;
  if new.cartao_mov is distinct from 'compra' or new.scope <> 'harmonize'
     or new.category_id is distinct from public.categoria_emprestimo_concedido() then
    delete from emprestimos where id = v_id;
    return null;
  end if;
  update emprestimos
     set valor = new.amount,
         data = new.date,
         is_test = new.is_test,
         descricao = public.emprestimo_cartao_descricao(new.description, new.parcela_num, new.parcelas_total, new.cartao_id)
   where id = v_id
     and (valor is distinct from new.amount or data is distinct from new.date or is_test is distinct from new.is_test
          or descricao is distinct from public.emprestimo_cartao_descricao(new.description, new.parcela_num, new.parcelas_total, new.cartao_id));
  return null;
end;
$$;

revoke execute on function public.emprestimo_cartao_sincronizar() from public, anon, authenticated;

drop trigger if exists trg_emprestimo_cartao_sincronizar on public.transactions;
-- Sem lista de colunas de propósito: a data muda pelo gatilho do cartão quando
-- só fatura_ref está no SET (salvar_cartao), e lista de colunas não vê isso.
create trigger trg_emprestimo_cartao_sincronizar
  after update on public.transactions
  for each row
  when (old.amount is distinct from new.amount or old.date is distinct from new.date
        or old.description is distinct from new.description or old.category_id is distinct from new.category_id
        or old.scope is distinct from new.scope or old.cartao_mov is distinct from new.cartao_mov
        or old.cartao_id is distinct from new.cartao_id or old.parcela_num is distinct from new.parcela_num
        or old.parcelas_total is distinct from new.parcelas_total or old.is_test is distinct from new.is_test)
  execute function public.emprestimo_cartao_sincronizar();

-- Parcela apagada (Apagar compra, Desfazer importação): o empréstimo some junto.
create or replace function public.emprestimo_cartao_apagar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from emprestimos where transaction_id = old.id and origem = 'cartao';
  return old;
end;
$$;

revoke execute on function public.emprestimo_cartao_apagar() from public, anon, authenticated;

drop trigger if exists trg_emprestimo_cartao_apagar on public.transactions;
create trigger trg_emprestimo_cartao_apagar
  before delete on public.transactions
  for each row execute function public.emprestimo_cartao_apagar();

-- Parcela nova de uma compra já marcada (importação da fatura seguinte): nasce marcada.
create or replace function public.emprestimo_cartao_parcela_nova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devedor text;
begin
  if new.cartao_mov is distinct from 'compra' or new.scope <> 'harmonize' or new.compra_grupo is null then
    return null;
  end if;
  select e.devedor into v_devedor
    from emprestimos e
    join transactions t on t.id = e.transaction_id
   where e.origem = 'cartao'
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

drop trigger if exists trg_emprestimo_cartao_parcela_nova on public.transactions;
create trigger trg_emprestimo_cartao_parcela_nova
  after insert on public.transactions
  for each row execute function public.emprestimo_cartao_parcela_nova();

-- ------------------------------------------------------------
-- 5. Editar e apagar empréstimo: origem cartão se desfaz no cartão
-- ------------------------------------------------------------
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
      || ' (' || public.formatar_reais(v_linha.valor) || ')',
    jsonb_build_object('tipo', v_linha.tipo, 'valor', v_linha.valor, 'data', v_linha.data)
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
  v_saldo numeric;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para alterar empréstimos.';
  end if;
  select * into v_antes from emprestimos where id = p_id;
  if not found then
    raise exception 'Lançamento de empréstimo não encontrado.';
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

  -- Nenhum devedor pode ficar devolvendo mais do que pegou.
  select coalesce(sum(case when tipo = 'concedido' then valor else -valor end), 0) into v_saldo
    from emprestimos where devedor = v_devedor;
  if round(v_saldo, 2) < 0 then
    raise exception 'Com essa mudança, % teria devolvido mais do que pegou emprestado.', v_devedor;
  end if;
  if v_antes.devedor <> v_devedor then
    select coalesce(sum(case when tipo = 'concedido' then valor else -valor end), 0) into v_saldo
      from emprestimos where devedor = v_antes.devedor;
    if round(v_saldo, 2) < 0 then
      raise exception 'Com essa mudança, % teria devolvido mais do que pegou emprestado.', v_antes.devedor;
    end if;
  end if;

  -- Só a pendência: tira o lançamento do caixa.
  if coalesce(p_sem_caixa, false) and v_antes.transaction_id is not null then
    update emprestimos set transaction_id = null where id = p_id;
    delete from transactions where id = v_antes.transaction_id;
    v_antes.transaction_id := null;
  end if;
  -- Voltou a mexer no caixa: cria o lançamento.
  if p_sem_caixa is false and v_antes.transaction_id is null then
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, notes, created_by)
    values (
      case when v_antes.tipo = 'concedido' then 'saida' else 'entrada' end::entry_type,
      (select id from categories where scope = 'harmonize'
          and name = case when v_antes.tipo = 'concedido' then 'Empréstimo concedido' else 'Devolução de empréstimo' end limit 1),
      case when v_antes.tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de empréstimo - ' end || v_devedor,
      p_valor, p_forma, p_data, 'harmonize', nullif(trim(p_descricao), ''), auth.uid()
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
      || ' (' || public.formatar_reais(p_valor) || ')',
    jsonb_build_object('antes', jsonb_build_object('devedor', v_antes.devedor, 'valor', v_antes.valor, 'data', v_antes.data),
                       'depois', jsonb_build_object('devedor', v_devedor, 'valor', round(p_valor, 2), 'data', p_data))
  );
end;
$$;

revoke execute on function public.editar_emprestimo(uuid, text, numeric, payment_method_type, date, text, boolean) from public, anon;
grant execute on function public.editar_emprestimo(uuid, text, numeric, payment_method_type, date, text, boolean) to authenticated, service_role;
