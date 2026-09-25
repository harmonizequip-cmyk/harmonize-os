-- ============================================================
-- LEVA P.2 — corrigir o cliente de uma locação já lançada
-- ============================================================
--
-- Até aqui não existia NENHUM jeito de corrigir o cliente de uma
-- locação: EditarLocacaoModal edita equipamento/data/disparos/
-- valor/forma/status, mas não tem campo de cliente, e a tela de evento
-- da Agenda bloqueia totalmente a edição quando o evento veio de uma
-- locação ("Para editar (...) isso é feito na própria locação"),
-- sobrando só "Ir para a locação" — que também não deixa trocar o
-- cliente. Resultado: uma locação lançada no cliente errado (ex:
-- confundiu duas pessoas na agenda) ficava presa lá para sempre, sem
-- opção de correção, só cancelar e recriar do zero.
--
-- client_id aparece em três tabelas para a mesma locação: rentals,
-- calendar_events (o evento de agenda ligado por rental_id) e
-- transactions (o(s) lançamento(s) financeiro(s) ligados por
-- rental_id) — os três precisam trocar juntos, senão financeiro e
-- agenda saem do cliente certo enquanto a locação em si mostra outro.
create or replace function public.transferir_cliente_locacao(
  p_rental_id uuid,
  p_novo_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_client_id uuid;
  v_old_client_name text;
  v_new_client_name text;
  v_descricao text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar locações.';
  end if;

  select client_id into v_old_client_id from rentals where id = p_rental_id;
  if v_old_client_id is null then
    raise exception 'Locação não encontrada.';
  end if;

  select name into v_new_client_name from clients where id = p_novo_client_id;
  if v_new_client_name is null then
    raise exception 'Cliente novo não encontrado.';
  end if;

  if v_old_client_id = p_novo_client_id then
    return; -- já é o mesmo cliente, nada a fazer
  end if;

  select name into v_old_client_name from clients where id = v_old_client_id;
  v_descricao := public.descrever_registro('rentals', p_rental_id);

  update rentals set client_id = p_novo_client_id where id = p_rental_id;
  update calendar_events set client_id = p_novo_client_id where rental_id = p_rental_id;
  update transactions set client_id = p_novo_client_id where rental_id = p_rental_id;

  -- Promove o cliente novo pra etapa "Cliente" do funil, mesma regra de
  -- create_rental/finalize_rental_reservation; não mexe na etapa do
  -- cliente antigo (ele pode ter outras locações legítimas).
  update clients set stage = 'cliente' where id = p_novo_client_id and stage <> 'cliente';

  perform public.registrar_movimentacao(
    'editado', 'rentals', p_rental_id, v_descricao,
    jsonb_build_object(
      'acao_detalhada', 'cliente da locação corrigido',
      'cliente_antigo', coalesce(v_old_client_name, v_old_client_id::text),
      'cliente_novo', v_new_client_name
    )
  );
end;
$$;

grant execute on function public.transferir_cliente_locacao(uuid, uuid) to authenticated;
