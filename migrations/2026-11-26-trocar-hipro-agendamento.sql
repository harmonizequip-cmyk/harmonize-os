-- Trocar o HIPRO de um agendamento (26/11/2026, pedido do dono): na Agenda,
-- passar uma reserva ou locação do HIPRO 1 para o HIPRO 2 (e vice-versa).
-- Caso do dono: a cliente precisa do mesmo HIPRO nos dias 15 e 16, mas no
-- dia 16 ele está com outra pessoa; troca-se o HIPRO dessa outra pessoa, e
-- se o outro HIPRO também estiver ocupado naquele dia, os dois atendimentos
-- trocam de aparelho entre si (p_trocar_com).
-- Muda o tipo e o equipamento do evento juntos (o gatilho
-- validar_equipamento_coerente exige que batam) e, se já virou locação, o
-- equipamento da locação também. Recusa se o destino estiver ocupado por
-- outro atendimento, se cair num bloqueio (gatilho do bloqueio) ou
-- manutenção (gatilho do equipamento), e se a contagem de disparos já
-- começou (a ponteira registrada é a montada no HIPRO atual).

-- Confere um atendimento antes da troca (interna).
create or replace function public.conferir_troca_hipro(p_event_id uuid)
returns calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev calendar_events%rowtype;
begin
  select * into v_ev from calendar_events where id = p_event_id for update;
  if not found then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_ev.event_type not in ('hipro_1', 'hipro_2') then
    raise exception 'Só reservas de HIPRO podem trocar de aparelho.';
  end if;
  if v_ev.status = 'cancelada' then
    raise exception 'Este agendamento está cancelado.';
  end if;
  if v_ev.contagem_inicial is not null
     or exists (select 1 from reserva_contagens where calendar_event_id = p_event_id) then
    raise exception 'A contagem de disparos de % já começou no HIPRO atual. Desfaça a contagem antes de trocar o aparelho.', v_ev.title;
  end if;
  return v_ev;
end;
$$;
revoke execute on function public.conferir_troca_hipro(uuid) from public, anon, authenticated;
grant execute on function public.conferir_troca_hipro(uuid) to service_role;

-- Primeiro atendimento que ocupa o equipamento no período, fora os ignorados (interna).
create or replace function public.ocupante_hipro(p_equip uuid, p_de date, p_ate date, p_is_test boolean, p_ignorar uuid[])
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.name, ev.title) || ' (' || to_char(ev.date_start, 'DD/MM') ||
         case when ev.date_end > ev.date_start then ' a ' || to_char(ev.date_end, 'DD/MM') else '' end || ')'
    from calendar_events ev
    left join clients c on c.id = ev.client_id
   where ev.equipment_id = p_equip
     and ev.status <> 'cancelada'
     and ev.is_test = p_is_test
     and not (ev.id = any (p_ignorar))
     and daterange(ev.date_start, ev.date_end, '[]') && daterange(p_de, p_ate, '[]')
   order by ev.date_start
   limit 1;
$$;
revoke execute on function public.ocupante_hipro(uuid, date, date, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.ocupante_hipro(uuid, date, date, boolean, uuid[]) to service_role;

drop function if exists public.trocar_hipro_agendamento(uuid);
create or replace function public.trocar_hipro_agendamento(p_event_id uuid, p_trocar_com uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a calendar_events%rowtype;
  v_b calendar_events%rowtype;
  v_tipo_a calendar_event_type;
  v_tipo_b calendar_event_type;
  v_equip_a uuid;
  v_equip_b uuid;
  v_ocupante text;
  v_rot_a text;
  v_rot_b text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para mudar o agendamento.';
  end if;

  v_a := conferir_troca_hipro(p_event_id);
  v_tipo_a := v_a.event_type;
  v_tipo_b := case when v_tipo_a = 'hipro_1' then 'hipro_2' else 'hipro_1' end;
  v_rot_a := case when v_tipo_a = 'hipro_1' then 'HIPRO 1' else 'HIPRO 2' end;
  v_rot_b := case when v_tipo_b = 'hipro_1' then 'HIPRO 1' else 'HIPRO 2' end;
  v_equip_a := v_a.equipment_id;
  select id into v_equip_b from equipments where code::text = v_tipo_b::text;
  if v_equip_b is null then
    raise exception 'O % não está cadastrado.', v_rot_b;
  end if;

  if p_trocar_com is null then
    -- Troca simples: o outro HIPRO precisa estar livre no período.
    v_ocupante := ocupante_hipro(v_equip_b, v_a.date_start, v_a.date_end, v_a.is_test, array[p_event_id]);
    if v_ocupante is not null then
      raise exception 'O % já está com % nesse período.', v_rot_b, v_ocupante;
    end if;
    if v_a.rental_id is not null then
      update rentals set equipment_id = v_equip_b where id = v_a.rental_id;
    end if;
    update calendar_events set event_type = v_tipo_b, equipment_id = v_equip_b where id = p_event_id;
    perform registrar_movimentacao('editado', 'calendar_events', p_event_id,
      descrever_registro('calendar_events', p_event_id),
      jsonb_build_object('acao_detalhada', 'HIPRO trocado', 'de', v_rot_a, 'para', v_rot_b));
    return v_tipo_b::text;
  end if;

  -- Troca entre dois atendimentos: A vai para o HIPRO de B e B para o de A.
  if p_trocar_com = p_event_id then
    raise exception 'Escolha outro atendimento para trocar.';
  end if;
  v_b := conferir_troca_hipro(p_trocar_com);
  if v_b.event_type <> v_tipo_b then
    raise exception 'Os dois atendimentos já estão no mesmo HIPRO.';
  end if;
  if v_b.is_test <> v_a.is_test then
    raise exception 'Não dá para trocar um atendimento de teste com um de verdade.';
  end if;
  v_ocupante := ocupante_hipro(v_equip_b, v_a.date_start, v_a.date_end, v_a.is_test, array[p_event_id, p_trocar_com]);
  if v_ocupante is not null then
    raise exception 'O % também está com % nesse período.', v_rot_b, v_ocupante;
  end if;
  v_ocupante := ocupante_hipro(v_equip_a, v_b.date_start, v_b.date_end, v_b.is_test, array[p_event_id, p_trocar_com]);
  if v_ocupante is not null then
    raise exception 'O % também está com % no período do outro atendimento.', v_rot_a, v_ocupante;
  end if;

  -- A trava de dupla reserva não é adiável: A sai da frente marcado como
  -- teste por um instante (a trava separa teste de real), B muda, A muda e
  -- volta ao normal, tudo na mesma transação.
  update calendar_events set is_test = not v_a.is_test where id = p_event_id;
  update calendar_events set event_type = v_tipo_b, equipment_id = v_equip_b where id = p_event_id;
  update calendar_events set event_type = v_tipo_a, equipment_id = v_equip_a where id = p_trocar_com;
  update calendar_events set is_test = v_a.is_test where id = p_event_id;
  if v_a.rental_id is not null then
    update rentals set equipment_id = v_equip_b where id = v_a.rental_id;
  end if;
  if v_b.rental_id is not null then
    update rentals set equipment_id = v_equip_a where id = v_b.rental_id;
  end if;

  perform registrar_movimentacao('editado', 'calendar_events', p_event_id,
    descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('acao_detalhada', 'HIPRO trocado', 'de', v_rot_a, 'para', v_rot_b, 'trocado_com', p_trocar_com));
  perform registrar_movimentacao('editado', 'calendar_events', p_trocar_com,
    descrever_registro('calendar_events', p_trocar_com),
    jsonb_build_object('acao_detalhada', 'HIPRO trocado', 'de', v_rot_b, 'para', v_rot_a, 'trocado_com', p_event_id));
  return v_tipo_b::text;
exception
  when exclusion_violation then
    raise exception 'O HIPRO de destino já está reservado nesse período.';
end;
$$;
revoke execute on function public.trocar_hipro_agendamento(uuid, uuid) from public, anon;
grant execute on function public.trocar_hipro_agendamento(uuid, uuid) to authenticated, service_role;
