-- ============================================================
-- STATUS: ESCRITA, AINDA NÃO APLICADA (aguarda o dono rodar ou liberar).
--
-- Guardar a contagem inicial do equipamento na reserva, sem fechar a conta.
--
-- Uso: no dia em que deixa o equipamento com o cliente, o dono digita a
-- contagem inicial na reserva. No dia de buscar, a calculadora já abre com
-- esse valor preenchido e só falta a contagem final para calcular os disparos.
--
-- A contagem fica na reserva (calendar_events), que já é o registro que
-- sobrevive à finalização (passa a apontar para a locação via rental_id).
-- Não mexe em rentals, então as views rentals_contabilizaveis e
-- transactions_contabilizaveis não precisam ser recriadas.
-- ============================================================

alter table public.calendar_events
  add column if not exists contagem_inicial bigint
    check (contagem_inicial is null or contagem_inicial >= 0),
  add column if not exists contagem_inicial_em timestamptz;

comment on column public.calendar_events.contagem_inicial is
  'Contagem do equipamento no dia em que foi entregue ao cliente. Nula = ainda não registrada. Na finalização, a calculadora usa como contagem inicial.';
comment on column public.calendar_events.contagem_inicial_em is
  'Quando a contagem inicial foi registrada ou alterada pela última vez.';

-- p_contagem nulo apaga a contagem registrada.
create or replace function public.definir_contagem_inicial_reserva(p_event_id uuid, p_contagem bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status event_status_type;
  v_rental uuid;
  v_equip uuid;
  v_antes bigint;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar agendamentos.';
  end if;
  if p_contagem is not null and p_contagem < 0 then
    raise exception 'A contagem não pode ser negativa.';
  end if;

  select status, rental_id, equipment_id, contagem_inicial
    into v_status, v_rental, v_equip, v_antes
    from calendar_events where id = p_event_id;

  if v_status is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_equip is null then
    raise exception 'Só reservas de equipamento têm contagem.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento está cancelado.';
  end if;
  if v_rental is not null then
    raise exception 'Esta reserva já foi finalizada: a contagem ficou registrada na locação.';
  end if;

  update calendar_events
     set contagem_inicial = p_contagem,
         contagem_inicial_em = case when p_contagem is null then null else now() end
   where id = p_event_id;

  perform public.registrar_movimentacao(
    'contagem_inicial_registrada',
    'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('contagem_inicial', p_contagem, 'antes', v_antes)
  );
end;
$$;

revoke execute on function public.definir_contagem_inicial_reserva(uuid, bigint) from public, anon;
grant execute on function public.definir_contagem_inicial_reserva(uuid, bigint) to authenticated, service_role;
