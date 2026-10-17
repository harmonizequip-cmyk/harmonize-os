-- Importar fatura do cartão (18/10/2026): lê o arquivo OFX do banco no app e grava
-- as compras de uma vez. Cada linha leva uma chave (importacao_chave) para o mesmo
-- arquivo, ou a fatura seguinte, nunca duplicar compra nem parcela.
-- Não altera nem apaga nada que já existe: só acrescenta a coluna e a função.

alter table public.transactions add column if not exists importacao_chave text;

create unique index if not exists transactions_importacao_uk
  on public.transactions (cartao_id, importacao_chave)
  where importacao_chave is not null;

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

-- Grava de uma vez as compras lidas da fatura. Cada item:
--   chave, grupo, data, valor, descricao, fatura_ref ('AAAA-MM'),
--   parcela_num e parcelas_total (opcionais), category_id (opcional).
-- Item cuja chave já existe no cartão é pulado. Parcelas da mesma compra
-- (mesmo grupo) ficam juntas, para "Apagar compra" apagar todas.
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
  v_n int;
  v_cat uuid;
  v_valor numeric;
  v_data date;
  v_desc text;
  v_pn int;
  v_pt int;
begin
  select * into v_cartao from cartoes where id = p_cartao_id;
  if v_cartao.id is null then
    raise exception 'Cartão não encontrado.';
  end if;
  if (v_cartao.scope = 'harmonize' and not has_module_permission('financeiro'))
     or (v_cartao.scope = 'pessoal' and not has_module_permission('pessoal')) then
    raise exception 'Sem permissão para lançar neste cartão.';
  end if;
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
    if v_cat is not null and not exists (select 1 from categories c where c.id = v_cat and c.scope = v_cartao.scope) then
      raise exception 'Categoria que não é deste lado, na linha %.', v_desc;
    end if;

    insert into transactions (
      type, category_id, description, amount, payment_method, date, scope, notes, created_by,
      cartao_id, cartao_mov, fatura_ref, parcela_num, parcelas_total, compra_grupo, importacao_chave
    ) values (
      'saida', v_cat, v_desc, v_valor, 'credito', v_data, v_cartao.scope, 'Importado da fatura', auth.uid(),
      p_cartao_id, 'compra', v_item->>'fatura_ref', v_pn, v_pt,
      md5(p_cartao_id::text || '|' || (v_item->>'grupo'))::uuid, v_item->>'chave'
    )
    on conflict (cartao_id, importacao_chave) where importacao_chave is not null do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then v_ins := v_ins + 1; else v_rep := v_rep + 1; end if;
  end loop;

  perform public.registrar_movimentacao(
    'criado', 'cartoes', p_cartao_id, 'Importação de fatura no cartão ' || v_cartao.nome,
    jsonb_build_object('inseridos', v_ins, 'repetidos', v_rep)
  );
  return jsonb_build_object('inseridos', v_ins, 'repetidos', v_rep);
end;
$$;

revoke execute on function public.importar_compras_cartao(uuid, jsonb) from public, anon;
grant execute on function public.importar_compras_cartao(uuid, jsonb) to authenticated, service_role;
