-- ============================================================
-- LEVA E (parte 2): reativar devolvia o status errado
--
-- O PROBLEMA, achado testando o fluxo completo de ponta a ponta
-- cancelar_agendamento aceita cancelar qualquer agendamento que não
-- esteja já cancelado — inclusive um já realizado (é assim de propósito:
-- cancelar por engano uma locação que já aconteceu tem que ser possível
-- de desfazer). Mas reativar_agendamento sempre devolvia o status fixo
-- 'confirmada', não importa o que era antes. Resultado: cancelar uma
-- locação realizada e reativar em seguida (desfazendo o engano) fazia
-- ela voltar como "confirmada" — como se a data ainda estivesse por
-- vir, quando na verdade já aconteceu e já foi contabilizada.
--
-- Reproduzido localmente: locação com data no passado, marcada como
-- realizada, cancelada e reativada. Antes desta correção, saía como
-- "confirmada"; devia sair como "realizada" de novo.
--
-- A CORREÇÃO
-- cancelar_agendamento passa a guardar o status de antes de cancelar
-- dentro do próprio registro de movimentação (detalhes.status_anterior).
-- reativar_agendamento lê esse valor da movimentação de cancelamento
-- mais recente daquele agendamento e devolve exatamente esse status, em
-- vez do valor fixo. Um agendamento cancelado antes desta migração não
-- tem esse dado guardado — nesse caso cai no mesmo 'confirmada' de
-- sempre, sem quebrar nada que já estava cancelado.
--
-- PODE RODAR MAIS DE UMA VEZ: create or replace function.
-- ============================================================

create or replace function public.cancelar_agendamento(
  p_event_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_status event_status_type;
  v_taxa text;
  v_descricao text;
  v_pago boolean;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para cancelar agendamentos.';
  end if;

  select rental_id, status, taxa_status into v_rental_id, v_status, v_taxa
    from calendar_events where id = p_event_id;

  if v_status is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento já está cancelado.';
  end if;

  if v_rental_id is not null then
    select pago into v_pago from rentals where id = v_rental_id;
    if v_pago then
      raise exception 'Esta locação já foi paga. Desfaça o pagamento antes de cancelar, para o caixa não ficar com receita de algo cancelado.';
    end if;
  end if;

  v_descricao := public.descrever_registro('calendar_events', p_event_id);

  update calendar_events set status = 'cancelada' where id = p_event_id;
  if v_rental_id is not null then
    update rentals set status = 'cancelada' where id = v_rental_id;
  end if;

  -- Taxa paga vira perdida: o valor fica com a casa e não gera crédito.
  if v_taxa = 'paga' then
    update calendar_events set taxa_status = 'perdida' where id = p_event_id;
    perform public.registrar_movimentacao(
      'taxa_perdida', 'calendar_events', p_event_id, v_descricao,
      jsonb_build_object('motivo', 'agendamento cancelado após a taxa ter sido paga')
    );
  end if;

  -- status_anterior é o que reativar_agendamento vai ler para saber para
  -- onde voltar. Sem isto, reativar não tem como saber se o agendamento
  -- era "confirmada" ou "realizada" antes do cancelamento.
  perform public.registrar_movimentacao(
    'cancelado', 'calendar_events', p_event_id, v_descricao,
    jsonb_build_object(
      'motivo', coalesce(nullif(trim(p_motivo), ''), 'não informado'),
      'taxa', coalesce(v_taxa, 'nao_aplica'),
      'status_anterior', v_status
    )
  );
end;
$$;

grant execute on function public.cancelar_agendamento to authenticated;

create or replace function public.reativar_agendamento(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_equipment_id uuid;
  v_data date;
  v_ocupante text;
  v_taxa text;
  v_taxa_transacao uuid;
  v_status_anterior event_status_type;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para reativar agendamentos.';
  end if;

  select rental_id, equipment_id, date_start, taxa_status, taxa_transaction_id
    into v_rental_id, v_equipment_id, v_data, v_taxa, v_taxa_transacao
    from calendar_events where id = p_event_id and status = 'cancelada';

  if v_data is null then
    raise exception 'Agendamento não encontrado ou não está cancelado.';
  end if;

  if v_equipment_id is not null then
    select coalesce(c.name, ev.title) into v_ocupante
      from calendar_events ev
      left join clients c on c.id = ev.client_id
     where ev.equipment_id = v_equipment_id
       and ev.status <> 'cancelada'
       and ev.id <> p_event_id
       and daterange(ev.date_start, ev.date_end, '[]') && daterange(v_data, v_data, '[]')
     limit 1;

    if v_ocupante is not null then
      raise exception 'Não dá para reativar: o equipamento já foi reservado em % para %. Reagende para outra data.',
        to_char(v_data, 'DD/MM/YYYY'), v_ocupante;
    end if;
  end if;

  -- Busca o status de antes do cancelamento na movimentação mais recente
  -- que cancelou este agendamento. Um cancelamento anterior a esta
  -- migração não guardou isso — nesse caso cai em 'confirmada', igual
  -- ao comportamento de sempre.
  select (detalhes->>'status_anterior')::event_status_type
    into v_status_anterior
    from movimentacoes
   where entidade = 'calendar_events' and entidade_id = p_event_id and acao = 'cancelado'
   order by ocorrido_em desc
   limit 1;

  if v_status_anterior is null or v_status_anterior = 'cancelada' then
    v_status_anterior := 'confirmada';
  end if;

  update calendar_events set status = v_status_anterior, confirmed = false where id = p_event_id;
  if v_rental_id is not null then
    update rentals set status = v_status_anterior where id = v_rental_id;
  end if;

  -- Só volta para paga se o lançamento da taxa ainda existe. Se alguém
  -- apagou aquele lançamento no meio do caminho, o dinheiro não está
  -- mais no caixa e dizer que está pago seria invenção.
  if v_taxa = 'perdida' and v_taxa_transacao is not null then
    update calendar_events set taxa_status = 'paga' where id = p_event_id;
    perform public.registrar_movimentacao(
      'taxa_paga', 'calendar_events', p_event_id,
      public.descrever_registro('calendar_events', p_event_id),
      jsonb_build_object('motivo', 'agendamento reativado; a taxa paga volta a valer como crédito')
    );
  end if;

  perform public.registrar_movimentacao(
    'editado', 'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('acao_detalhada', 'agendamento reativado', 'status_restaurado', v_status_anterior)
  );
end;
$$;

grant execute on function public.reativar_agendamento to authenticated;
