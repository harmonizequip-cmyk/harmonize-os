-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 13/10/2026, pelo dono, e conferida por consulta de leitura (funções 2, registrar com 7 parâmetros, anon sem acesso).
--
-- Editar um lançamento de empréstimo (Laser Dream João Pessoa / Campina Grande).
--   editar_emprestimo muda devedor, valor, data, forma e descrição do
--   empréstimo e do lançamento do Financeiro ligado a ele, juntos. Recusa se
--   a mudança deixar algum devedor com devolução maior que o emprestado.
--   "Só a pendência" (p_sem_caixa): registra quem deve, sem lançamento no
--   Financeiro (para empréstimos antigos que não devem mexer no saldo). Na
--   edição, ligar apaga o lançamento do caixa; desligar cria.
-- ============================================================

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

-- Registrar empréstimo com a opção "só a pendência" (sem lançamento no caixa).
drop function if exists public.registrar_emprestimo(text, text, numeric, payment_method_type, date, text);
create or replace function public.registrar_emprestimo(
  p_devedor text,
  p_tipo text,
  p_valor numeric,
  p_forma payment_method_type,
  p_data date default public.hoje_local(),
  p_descricao text default null,
  p_sem_caixa boolean default false
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

  -- Só a pendência: empréstimo antigo, registra quem deve sem mexer no caixa.
  if not coalesce(p_sem_caixa, false) then
  insert into transactions (type, category_id, description, amount, payment_method, date, scope, notes, created_by)
  values (
    case when p_tipo = 'concedido' then 'saida' else 'entrada' end::entry_type,
    v_categoria,
    case when p_tipo = 'concedido' then 'Empréstimo para ' else 'Devolução de empréstimo - ' end || v_devedor,
    p_valor, p_forma, coalesce(p_data, hoje_local()), 'harmonize', nullif(trim(p_descricao), ''), auth.uid()
  )
  returning id into v_transacao;
  end if;

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

revoke execute on function public.registrar_emprestimo(text, text, numeric, payment_method_type, date, text, boolean) from public, anon;
grant execute on function public.registrar_emprestimo(text, text, numeric, payment_method_type, date, text, boolean) to authenticated, service_role;
