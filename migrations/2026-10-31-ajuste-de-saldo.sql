-- Ajuste de saldo (pedido do dono, 31/10/2026).
-- O saldo do app (tudo que entrou menos tudo que saiu, desde o primeiro
-- lançamento) pode ficar diferente do saldo real do banco. Esta migration cria
-- uma ferramenta reutilizável para acertar:
--   1. Categorias de sistema "Ajuste de saldo" (entrada e saída) nos espaços
--      harmonize e pessoal. As telas deixam essas categorias fora de
--      Entradas, Saídas, Resultado, gráficos e relatórios; elas só mexem no saldo.
--   2. Função ajustar_saldo(p_scope, p_saldo_real, p_observacao): calcula no
--      servidor o saldo com a mesma regra das telas e, se houver diferença,
--      lança UM lançamento de ajuste com a diferença.
-- Não apaga nem altera lançamentos existentes. Idempotente.

-- 1. Categorias -----------------------------------------------------------
insert into public.categories (name, type, scope, is_default, sistema, arquivada, ordem)
select 'Ajuste de saldo', s.type::entry_type, s.scope::scope_type, false, true, false, 0
  from (values ('harmonize', 'entrada'), ('harmonize', 'saida'), ('pessoal', 'entrada'), ('pessoal', 'saida')) as s(scope, type)
 where not exists (
   select 1 from public.categories c
    where c.scope::text = s.scope and c.type::text = s.type
      and lower(btrim(c.name)) = 'ajuste de saldo'
 );

-- Se o dono já tinha criado uma com esse nome, ela vira a do sistema (cadeado).
update public.categories
   set sistema = true, arquivada = false
 where lower(btrim(name)) = 'ajuste de saldo'
   and (not sistema or arquivada);

-- 2. Função -----------------------------------------------------------------
-- Saldo com a mesma regra das telas:
--   Harmonize (Dashboard "Saldo em caixa"): transactions_contabilizaveis do
--     scope harmonize (sem teste, sem cliente "excluir do financeiro", sem
--     lançamento de locação cancelada).
--   Pessoal (Início e Lançamentos): transactions do scope pessoal sem teste.
--   Nos dois, fora do saldo: compra no cartão (cartao_mov = 'compra', só sai
--   quando a fatura é paga) e permuta (payment_method = 'permuta').
create or replace function public.saldo_do_caixa(p_scope text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_saldo numeric;
begin
  if p_scope = 'harmonize' then
    if not has_module_permission('financeiro') then
      raise exception 'Sem permissão para ver o saldo da Harmonize.';
    end if;
    select coalesce(sum(case when t.type = 'entrada' then t.amount else -t.amount end), 0)
      into v_saldo
      from transactions_contabilizaveis t
     where t.scope = 'harmonize'
       and coalesce(t.cartao_mov, '') <> 'compra'
       and t.payment_method::text <> 'permuta';
  elsif p_scope = 'pessoal' then
    if not has_module_permission('pessoal') then
      raise exception 'Sem permissão para ver o saldo pessoal.';
    end if;
    select coalesce(sum(case when t.type = 'entrada' then t.amount else -t.amount end), 0)
      into v_saldo
      from transactions t
     where t.scope = 'pessoal'
       and t.is_test = false
       and coalesce(t.cartao_mov, '') <> 'compra'
       and t.payment_method::text <> 'permuta';
  else
    raise exception 'Espaço inválido (use harmonize ou pessoal).';
  end if;
  return round(v_saldo, 2);
end;
$$;

revoke execute on function public.saldo_do_caixa(text) from public, anon;
grant execute on function public.saldo_do_caixa(text) to authenticated, service_role;

create or replace function public.ajustar_saldo(
  p_scope text,
  p_saldo_real numeric,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := lower(btrim(coalesce(p_scope, '')));
  v_real numeric;
  v_anterior numeric;
  v_dif numeric;
  v_tipo entry_type;
  v_categoria uuid;
  v_id uuid;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  if v_scope = 'harmonize' then
    if not has_module_permission('financeiro') then
      raise exception 'Sem permissão para ajustar o saldo da Harmonize.';
    end if;
  elsif v_scope = 'pessoal' then
    if not has_module_permission('pessoal') then
      raise exception 'Sem permissão para ajustar o saldo pessoal.';
    end if;
  else
    raise exception 'Espaço inválido (use harmonize ou pessoal).';
  end if;
  if p_saldo_real is null then
    raise exception 'Informe o saldo real de hoje.';
  end if;
  if abs(p_saldo_real) >= 100000000 then
    raise exception 'Valor fora do esperado. Confira o saldo digitado.';
  end if;
  if v_obs is not null and length(v_obs) > 300 then
    raise exception 'Observação longa demais (máximo 300 caracteres).';
  end if;
  -- Com o modo teste ligado o lançamento nasceria como teste (gatilho
  -- apply_test_mode) e não mudaria o saldo: melhor avisar do que fingir.
  if coalesce((select s.test_mode from settings s limit 1), false) then
    raise exception 'O modo teste está ligado: o ajuste não mudaria o saldo. Desligue o modo teste e tente de novo.';
  end if;

  v_real := round(p_saldo_real, 2);
  v_anterior := public.saldo_do_caixa(v_scope);
  v_dif := round(v_real - v_anterior, 2);

  if v_dif <> 0 then
    v_tipo := case when v_dif > 0 then 'entrada' else 'saida' end;
    select id into v_categoria
      from categories
     where scope::text = v_scope and type = v_tipo and lower(btrim(name)) = 'ajuste de saldo'
     limit 1;
    if v_categoria is null then
      raise exception 'Categoria "Ajuste de saldo" não encontrada. Rode o SQL do ajuste de saldo.';
    end if;

    insert into transactions (type, category_id, description, amount, payment_method, date, scope, notes, created_by, is_test)
    values (
      v_tipo, v_categoria,
      'Ajuste de saldo: saldo informado ' || public.formatar_reais(v_real),
      abs(v_dif), 'outros', public.hoje_local(), v_scope::scope_type, v_obs, auth.uid(), false
    )
    returning id into v_id;

    perform public.registrar_movimentacao(
      'criado', 'transactions', v_id,
      'Ajuste de saldo (' || case when v_scope = 'pessoal' then 'Pessoal' else 'Harmonize' end || '): de '
        || public.formatar_reais(v_anterior) || ' para ' || public.formatar_reais(v_real),
      jsonb_build_object('escopo', v_scope, 'saldo_anterior', v_anterior, 'saldo_real', v_real,
                         'diferenca', v_dif, 'observacao', v_obs)
    );
  end if;

  return jsonb_build_object(
    'saldo_anterior', v_anterior,
    'saldo_real', v_real,
    'diferenca', v_dif,
    'transaction_id', v_id
  );
end;
$$;

revoke execute on function public.ajustar_saldo(text, numeric, text) from public, anon;
grant execute on function public.ajustar_saldo(text, numeric, text) to authenticated, service_role;
