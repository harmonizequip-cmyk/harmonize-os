-- Importar fatura do cartão: melhorias pedidas pelo dono (31/10/2026).
--
-- Mesma assinatura de antes (importar_compras_cartao(uuid, jsonb)); a tela
-- antiga, que não manda a marca "real", continua funcionando como antes.
--
-- 1. Fatura real manda: a linha marcada com "real": true (está de verdade no
--    arquivo da fatura, não é parcela futura gerada pela tela) e que já existe
--    no cartão com a mesma chave e na MESMA fatura passa a ter o valor, a
--    descrição e o dia da compra do arquivo (o banco muda centavos entre
--    parcelas e o dono renomeia compras). A categoria não muda. Parcela futura
--    gerada pela tela nunca sobrescreve a que já existe.
--    Continua valendo: parcela antecipada (a mesma chave numa fatura anterior)
--    é movida para a fatura anterior com o valor novo.
-- 2. Pagamento repetido: pagamento importado não entra se o cartão já tem um
--    pagamento de fatura (cartao_mov = 'pagamento') com a mesma data e o mesmo
--    valor, seja importado, seja do "Pagar fatura". Exceção: dois pagamentos
--    iguais no mesmo dia vindos do mesmo arquivo (chave "...#2"). Também não
--    entra a parte ("...|parte1", "...|parte2") de um pagamento que já foi
--    lançado inteiro com a chave de antes, nem o inteiro de um já dividido.
--
-- Devolve também "atualizados" (linhas reais com valor, descrição ou data
-- novos) e "pagamentos_repetidos".

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
  v_atu int := 0;
  v_pag_rep int := 0;
  v_novo boolean;
  v_cat uuid;
  v_valor numeric;
  v_data date;
  v_desc text;
  v_pn int;
  v_pt int;
  v_pag boolean;
  v_real boolean;
  v_chave text;
  v_familia text;
  v_ref text;
  v_ref_antes text;
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
    -- Sem a marca (tela antiga), nada é atualizado: igual a antes.
    v_real := coalesce(v_item->>'real', 'false') = 'true';
    v_chave := nullif(v_item->>'chave', '');
    v_ref := v_item->>'fatura_ref';
    if v_pag then
      -- Pagamento de fatura feito no banco: igual ao "Pagar fatura" (sai do saldo, fora do resultado).
      v_desc := 'Fatura ' || v_cartao.nome || ' ' || substr(coalesce(v_ref, ''), 6, 2) || '/' || substr(coalesce(v_ref, ''), 1, 4);
      v_cat := v_cat_pag;
    end if;

    if v_valor is null or v_valor <= 0 then
      raise exception 'Valor inválido na linha %.', coalesce(v_desc, '?');
    end if;
    if v_desc is null then
      raise exception 'Linha sem descrição.';
    end if;
    if coalesce(v_ref, '') !~ '^\d{4}-\d{2}$' then
      raise exception 'Fatura inválida na linha %.', v_desc;
    end if;
    if v_chave is null or nullif(v_item->>'grupo', '') is null then
      raise exception 'Linha sem chave: %.', v_desc;
    end if;
    if not v_pag and v_cat is not null and not exists (select 1 from categories c where c.id = v_cat and c.scope = v_cartao.scope) then
      raise exception 'Categoria que não é deste lado, na linha %.', v_desc;
    end if;

    -- Pagamento que já está lançado no cartão (mesma data e mesmo valor) não entra de novo.
    if v_pag then
      v_familia := regexp_replace(v_chave, '#\d+$', '');
      if exists (
        select 1 from transactions t
         where t.cartao_id = p_cartao_id
           and t.cartao_mov = 'pagamento'
           and t.date = v_data
           and t.amount = v_valor
           and t.importacao_chave is distinct from v_chave
           -- O "#2" do mesmo arquivo é outro pagamento igual no mesmo dia, não repetição.
           and (t.importacao_chave is null or regexp_replace(t.importacao_chave, '#\d+$', '') <> v_familia)
      ) or exists (
        -- O mesmo pagamento já lançado inteiro (antes da divisão do rotativo) ou já dividido.
        select 1 from transactions t
         where t.cartao_id = p_cartao_id
           and t.cartao_mov = 'pagamento'
           and ((v_chave ~ '\|parte\d+$' and t.importacao_chave = regexp_replace(v_chave, '\|parte\d+$', ''))
                or (v_chave !~ '\|parte\d+$' and t.importacao_chave like replace(replace(v_chave, '%', '\%'), '_', '\_') || '|parte%'))
      ) then
        v_pag_rep := v_pag_rep + 1;
        continue;
      end if;
    end if;

    select fatura_ref into v_ref_antes
      from transactions
     where cartao_id = p_cartao_id and importacao_chave = v_chave;

    insert into transactions (
      type, category_id, description, amount, payment_method, date, scope, notes, created_by,
      cartao_id, cartao_mov, fatura_ref, parcela_num, parcelas_total, compra_grupo, importacao_chave
    ) values (
      'saida', v_cat, v_desc, v_valor, case when v_pag then 'pix'::payment_method_type else 'credito'::payment_method_type end,
      v_data, v_cartao.scope, 'Importado da fatura', auth.uid(),
      p_cartao_id, case when v_pag then 'pagamento' else 'compra' end, v_ref, v_pn, v_pt,
      case when v_pag then null else md5(p_cartao_id::text || '|' || (v_item->>'grupo'))::uuid end, v_chave
    )
    on conflict (cartao_id, importacao_chave) where importacao_chave is not null do update
      set fatura_ref = excluded.fatura_ref,
          amount = excluded.amount,
          data_compra = excluded.data_compra,
          -- Só a linha real da mesma fatura troca a descrição; a antecipada mantém a sua.
          description = case when excluded.fatura_ref = transactions.fatura_ref then excluded.description else transactions.description end
      where excluded.fatura_ref < transactions.fatura_ref
         or (v_real and not v_pag
             and transactions.cartao_mov = 'compra'
             and excluded.fatura_ref = transactions.fatura_ref
             and (transactions.amount is distinct from excluded.amount
                  or transactions.description is distinct from excluded.description
                  or transactions.data_compra is distinct from excluded.data_compra))
    returning (xmax = 0) into v_novo;
    if v_novo is null then
      v_rep := v_rep + 1;
    elsif v_novo then
      v_ins := v_ins + 1;
    elsif v_ref_antes is not null and v_ref < v_ref_antes then
      v_mov := v_mov + 1;
    else
      v_atu := v_atu + 1;
    end if;
  end loop;

  perform public.registrar_movimentacao(
    'criado', 'cartoes', p_cartao_id, 'Importação de fatura no cartão ' || v_cartao.nome,
    jsonb_build_object('inseridos', v_ins, 'repetidos', v_rep, 'movidos', v_mov, 'atualizados', v_atu, 'pagamentos_repetidos', v_pag_rep)
  );
  return jsonb_build_object('inseridos', v_ins, 'repetidos', v_rep, 'movidos', v_mov, 'atualizados', v_atu, 'pagamentos_repetidos', v_pag_rep);
end;
$$;

revoke execute on function public.importar_compras_cartao(uuid, jsonb) from public, anon;
grant execute on function public.importar_compras_cartao(uuid, jsonb) to authenticated, service_role;
