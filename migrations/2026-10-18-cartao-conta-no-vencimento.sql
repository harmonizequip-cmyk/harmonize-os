-- Compra no cartão conta no mês em que a fatura vence (decisão do dono, 18/10/2026).
-- A data (transactions.date) de cada compra/parcela passa a ser o vencimento da fatura
-- dela; o dia da compra fica em transactions.data_compra. Assim todas as telas que somam
-- por data (Lançamentos, Início, Relatórios, Dashboard, orçamentos) contam o cartão no
-- mês em que ele é pago, e a lista de Lançamentos mostra uma linha por fatura.
-- Vale para os cartões da Harmonize e do pessoal. Pagamento de fatura não muda.

alter table public.transactions add column if not exists data_compra date;

comment on column public.transactions.data_compra is
  'Compra no cartão: dia da compra (ou da parcela). A coluna date guarda o vencimento da fatura, que é quando o gasto conta.';

-- Gatilho: em compra de cartão, date = vencimento da fatura (fatura_ref + dia de vencimento
-- do cartão). Na inclusão, a data informada vira data_compra. Na edição, mudar a data
-- (sem mexer em data_compra) é mudar o dia da compra.
create or replace function public.transactions_data_do_cartao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venc int;
begin
  if new.cartao_mov is distinct from 'compra' or new.cartao_id is null
     or coalesce(new.fatura_ref, '') !~ '^\d{4}-\d{2}$' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.data_compra := coalesce(new.data_compra, new.date);
  elsif new.data_compra is not distinct from old.data_compra and new.date is distinct from old.date then
    new.data_compra := new.date;
  end if;
  new.data_compra := coalesce(new.data_compra, new.date);
  select dia_vencimento into v_venc from cartoes where id = new.cartao_id;
  if v_venc is not null then
    new.date := public.dia_no_mes(split_part(new.fatura_ref, '-', 1)::int, split_part(new.fatura_ref, '-', 2)::int, v_venc);
  end if;
  return new;
end;
$$;

revoke execute on function public.transactions_data_do_cartao() from public, anon, authenticated;

drop trigger if exists trg_transactions_data_do_cartao on public.transactions;
create trigger trg_transactions_data_do_cartao
  before insert or update on public.transactions
  for each row execute function public.transactions_data_do_cartao();

-- Compras que já existem: guarda o dia da compra e passa a data para o vencimento.
update public.transactions
   set data_compra = date
 where cartao_mov = 'compra' and cartao_id is not null and data_compra is null;

-- transactions_contabilizaveis usa select *: recriar para trazer a coluna nova.
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

-- Cartão: mudar o dia de vencimento leva as compras para o novo dia.
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
  v_venc_antes int;
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
    select dia_vencimento into v_venc_antes from cartoes where id = p_id;
    update cartoes
       set nome = trim(p_nome), dia_fechamento = p_dia_fechamento, dia_vencimento = p_dia_vencimento,
           limite = p_limite, ativo = coalesce(p_ativo, true)
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Cartão não encontrado.';
    end if;
    if v_venc_antes is distinct from p_dia_vencimento then
      -- O gatilho trg_transactions_data_do_cartao refaz a data de cada compra.
      update transactions set fatura_ref = fatura_ref where cartao_id = v_id and cartao_mov = 'compra';
    end if;
    perform public.registrar_movimentacao('editado', 'cartoes', v_id, 'Cartão ' || trim(p_nome), '{}'::jsonb);
  end if;
  return v_id;
end;
$$;

-- Importar fatura: parcela antecipada movida de fatura leva o dia da compra junto
-- (a data em si sai do gatilho, pelo vencimento da fatura nova).
create or replace function public.importar_compras_cartao(p_cartao_id uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cartao record;
  v_item jsonb;
  v_ins int := 0;
  v_rep int := 0;
  v_mov int := 0;
  v_novo boolean;
  v_cat uuid;
  v_valor numeric;
  v_data date;
  v_desc text;
  v_pn int;
  v_pt int;
  v_pag boolean;
  v_cat_pag uuid;
begin
  select * into v_cartao from cartoes where id = p_cartao_id;
  if v_cartao.id is null then
    raise exception 'Cartão não encontrado.';
  end if;
  if (v_cartao.scope = 'harmonize' and not has_module_permission('financeiro'))
     or (v_cartao.scope = 'pessoal' and not has_module_permission('pessoal')) then
    raise exception 'Sem permissão para lançar neste cartão.';
  end if;
  select id into v_cat_pag from categories where name = 'Pagamento de fatura' and scope = v_cartao.scope and type = 'saida' limit 1;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nada para importar.';
  end if;
  if jsonb_array_length(p_itens) > 800 then
    raise exception 'Muitas linhas de uma vez (máximo 800).';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_valor := (v_item->>'valor')::numeric;
    v_data := (v_item->>'data')::date;
    v_desc := left(nullif(trim(v_item->>'descricao'), ''), 200);
    v_cat := nullif(v_item->>'category_id', '')::uuid;
    v_pn := nullif(v_item->>'parcela_num', '')::int;
    v_pt := nullif(v_item->>'parcelas_total', '')::int;
    v_pag := coalesce(v_item->>'tipo', 'compra') = 'pagamento';
    if v_pag then
      -- Pagamento de fatura feito no banco: igual ao "Pagar fatura" (sai do saldo, fora do resultado).
      v_desc := 'Fatura ' || v_cartao.nome || ' ' || substr(coalesce(v_item->>'fatura_ref', ''), 6, 2) || '/' || substr(coalesce(v_item->>'fatura_ref', ''), 1, 4);
      v_cat := v_cat_pag;
    end if;

    if v_valor is null or v_valor <= 0 then
      raise exception 'Valor inválido na linha %.', coalesce(v_desc, '?');
    end if;
    if v_desc is null then
      raise exception 'Linha sem descrição.';
    end if;
    if coalesce(v_item->>'fatura_ref', '') !~ '^\d{4}-\d{2}$' then
      raise exception 'Fatura inválida na linha %.', v_desc;
    end if;
    if nullif(v_item->>'chave', '') is null or nullif(v_item->>'grupo', '') is null then
      raise exception 'Linha sem chave: %.', v_desc;
    end if;
    if not v_pag and v_cat is not null and not exists (select 1 from categories c where c.id = v_cat and c.scope = v_cartao.scope) then
      raise exception 'Categoria que não é deste lado, na linha %.', v_desc;
    end if;

    insert into transactions (
      type, category_id, description, amount, payment_method, date, scope, notes, created_by,
      cartao_id, cartao_mov, fatura_ref, parcela_num, parcelas_total, compra_grupo, importacao_chave
    ) values (
      'saida', v_cat, v_desc, v_valor, case when v_pag then 'pix'::payment_method_type else 'credito'::payment_method_type end,
      v_data, v_cartao.scope, 'Importado da fatura', auth.uid(),
      p_cartao_id, case when v_pag then 'pagamento' else 'compra' end, v_item->>'fatura_ref', v_pn, v_pt,
      case when v_pag then null else md5(p_cartao_id::text || '|' || (v_item->>'grupo'))::uuid end, v_item->>'chave'
    )
    on conflict (cartao_id, importacao_chave) where importacao_chave is not null do update
      set fatura_ref = excluded.fatura_ref, amount = excluded.amount, data_compra = excluded.data_compra
      where excluded.fatura_ref < transactions.fatura_ref
    returning (xmax = 0) into v_novo;
    if v_novo is null then
      v_rep := v_rep + 1;
    elsif v_novo then
      v_ins := v_ins + 1;
    else
      v_mov := v_mov + 1;
    end if;
  end loop;

  perform public.registrar_movimentacao(
    'criado', 'cartoes', p_cartao_id, 'Importação de fatura no cartão ' || v_cartao.nome,
    jsonb_build_object('inseridos', v_ins, 'repetidos', v_rep, 'movidos', v_mov)
  );
  return jsonb_build_object('inseridos', v_ins, 'repetidos', v_rep, 'movidos', v_mov);
end;
$$;

revoke execute on function public.salvar_cartao(uuid, text, scope_type, int, int, numeric, boolean) from public, anon;
grant execute on function public.salvar_cartao(uuid, text, scope_type, int, int, numeric, boolean) to authenticated, service_role;
revoke execute on function public.importar_compras_cartao(uuid, jsonb) from public, anon;
grant execute on function public.importar_compras_cartao(uuid, jsonb) to authenticated, service_role;
