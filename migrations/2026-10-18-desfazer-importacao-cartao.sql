-- Desfazer importação de fatura (18/10/2026): apaga, de um cartão, o que veio de importação
-- (compras, parcelas e pagamentos), de uma janela de horário ou de tudo. Lançamento feito à mão
-- não é tocado. Quem usa é a tela Cartões > "Desfazer importação".

create or replace function public.desfazer_importacao_cartao(
  p_cartao_id uuid,
  p_desde timestamptz default null,
  p_ate timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cartao record;
  v_qtd int;
  v_total numeric;
begin
  select * into v_cartao from cartoes where id = p_cartao_id;
  if v_cartao.id is null then
    raise exception 'Cartão não encontrado.';
  end if;
  if (v_cartao.scope = 'harmonize' and not has_module_permission('financeiro'))
     or (v_cartao.scope = 'pessoal' and not has_module_permission('pessoal')) then
    raise exception 'Sem permissão para mexer neste cartão.';
  end if;

  with apagadas as (
    delete from transactions
    where cartao_id = p_cartao_id
      and importacao_chave is not null
      and (p_desde is null or created_at >= p_desde)
      and (p_ate is null or created_at <= p_ate)
    returning amount
  )
  select count(*), coalesce(sum(amount), 0) into v_qtd, v_total from apagadas;

  perform public.registrar_movimentacao(
    'excluido', 'cartoes', p_cartao_id, 'Importação de fatura desfeita no cartão ' || v_cartao.nome,
    jsonb_build_object('lancamentos', v_qtd, 'total', v_total)
  );
  return jsonb_build_object('removidos', v_qtd, 'total', v_total);
end;
$$;

revoke execute on function public.desfazer_importacao_cartao(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.desfazer_importacao_cartao(uuid, timestamptz, timestamptz) to authenticated, service_role;
