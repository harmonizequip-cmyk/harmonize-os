-- ============================================================
-- STATUS: ainda NÃO aplicada. Rodar no Supabase (projeto vidnlzbxaxjlmzncqhxw) com o aval do dono.
--
-- Editar um lançamento de empréstimo (Laser Dream João Pessoa / Campina Grande).
--   editar_emprestimo muda devedor, valor, data, forma e descrição do
--   empréstimo e do lançamento do Financeiro ligado a ele, juntos. Recusa se
--   a mudança deixar algum devedor com devolução maior que o emprestado.
-- ============================================================

create or replace function public.editar_emprestimo(
  p_id uuid,
  p_devedor text,
  p_valor numeric,
  p_forma payment_method_type,
  p_data date,
  p_descricao text default null
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

  if v_antes.transaction_id is not null then
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

revoke execute on function public.editar_emprestimo(uuid, text, numeric, payment_method_type, date, text) from public, anon;
grant execute on function public.editar_emprestimo(uuid, text, numeric, payment_method_type, date, text) to authenticated, service_role;
