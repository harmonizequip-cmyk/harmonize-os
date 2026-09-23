-- ============================================================
-- LEVA C1: o ciclo de status do agendamento
--
-- O pedido descreve quatro ações na ficha do lead: confirmado,
-- reagendado, realizado e cancelado. Esta migração cria as funções que
-- fazem cada uma delas de forma atômica e registrada. A interface vem
-- na C2, e pagamento e taxa de compromisso vêm na C3.
--
-- MAPA DOS ESTADOS
-- O banco já tinha dois eixos sem usá-los assim. Esta migração não
-- inventa estado novo, passa a usar o que existe com nome claro:
--
--   Agendado   = evento existe, confirmed = false
--                (cliente marcou, mas ainda não confirmou a data)
--   Confirmado = confirmed = true
--                (cliente respondeu que está tudo certo)
--   Realizado  = status = 'realizada'
--                (o procedimento aconteceu; não diz nada sobre pagamento)
--   Cancelado  = status = 'cancelada'
--
-- Reagendado não é um estado, é uma transição: a data muda e o fato
-- fica marcado em rentals.rescheduled e no histórico, com a data antiga
-- e a nova, que é o que o item 4 da auditoria pede.
--
-- A TRAVA DO REAGENDAMENTO
-- Já existe uma constraint de exclusão chamada no_equipment_double_booking
-- que impede dois eventos não cancelados ocuparem o mesmo equipamento em
-- datas que se sobrepõem. Reagendar para uma data ocupada esbarra nela e
-- o Postgres recusa a transação inteira. A função abaixo captura esse
-- erro específico e devolve uma mensagem que diz quem está na data, em
-- vez do código cru do banco.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Novas ações no histórico
--
-- O check do acao foi escrito na Leva B com as ações que existiam
-- então. Realizar e desfazer realização são novas, e as da C3
-- (pagamento e taxa) já entram aqui para a C3 não precisar mexer de
-- novo nesta constraint.
-- ------------------------------------------------------------
alter table public.movimentacoes drop constraint if exists movimentacoes_acao_check;
alter table public.movimentacoes add constraint movimentacoes_acao_check
  check (acao in (
    'criado', 'editado', 'confirmado', 'desconfirmado',
    'reagendado', 'cancelado', 'excluido',
    'realizado', 'realizacao_desfeita',
    'pago', 'pagamento_desfeito',
    'taxa_paga', 'taxa_perdida', 'taxa_isenta'
  ));

-- ------------------------------------------------------------
-- 2) Confirmar ou desconfirmar um agendamento
--
-- Confirmar é o cliente respondendo que a data está de pé. Mantém na
-- agenda, só muda a marca. Desconfirmar existe para desfazer engano.
-- ------------------------------------------------------------
create or replace function public.confirmar_agendamento(
  p_event_id uuid,
  p_confirmado boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status event_status_type;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar agendamentos.';
  end if;

  select status into v_status from calendar_events where id = p_event_id;

  if v_status is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento está cancelado. Reative-o antes de confirmar.';
  end if;

  update calendar_events set confirmed = p_confirmado where id = p_event_id;

  perform public.registrar_movimentacao(
    case when p_confirmado then 'confirmado' else 'desconfirmado' end,
    'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.confirmar_agendamento to authenticated;

-- ------------------------------------------------------------
-- 3) Reagendar: tira da data antiga e põe na nova
--
-- Move o evento e, se houver locação vinculada, move ela junto, para
-- agenda e financeiro não divergirem. Tudo na mesma transação: se a
-- data nova estiver ocupada, nada muda.
-- ------------------------------------------------------------
create or replace function public.reagendar_agendamento(
  p_event_id uuid,
  p_nova_data date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data_antiga date;
  v_equipment_id uuid;
  v_rental_id uuid;
  v_status event_status_type;
  v_ocupante text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para reagendar.';
  end if;

  select date_start, equipment_id, rental_id, status
    into v_data_antiga, v_equipment_id, v_rental_id, v_status
    from calendar_events where id = p_event_id;

  if v_data_antiga is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento está cancelado e não pode ser reagendado.';
  end if;
  if p_nova_data = v_data_antiga then
    raise exception 'A data nova é igual à atual.';
  end if;

  -- Checagem amigável antes de tentar: assim a mensagem diz de quem é a
  -- data, em vez de devolver o código de conflito do Postgres. A
  -- constraint continua valendo como rede de segurança logo abaixo, para
  -- o caso de duas pessoas reagendarem ao mesmo tempo.
  if v_equipment_id is not null then
    select coalesce(c.name, ev.title) into v_ocupante
      from calendar_events ev
      left join clients c on c.id = ev.client_id
     where ev.equipment_id = v_equipment_id
       and ev.status <> 'cancelada'
       and ev.id <> p_event_id
       and daterange(ev.date_start, ev.date_end, '[]') && daterange(p_nova_data, p_nova_data, '[]')
     limit 1;

    if v_ocupante is not null then
      raise exception 'O equipamento já está reservado em % para %.',
        to_char(p_nova_data, 'DD/MM/YYYY'), v_ocupante;
    end if;
  end if;

  update calendar_events
     set date_start = p_nova_data,
         date_end   = p_nova_data
   where id = p_event_id;

  if v_rental_id is not null then
    update rentals
       set event_date = p_nova_data,
           rescheduled = true
     where id = v_rental_id;

    -- O lançamento financeiro, quando existir, acompanha a data da
    -- locação, senão o caixa fica com a receita no mês errado.
    update transactions
       set date = p_nova_data
     where rental_id = v_rental_id;
  end if;

  perform public.registrar_movimentacao(
    'reagendado', 'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object(
      'data_antiga', to_char(v_data_antiga, 'DD/MM/YYYY'),
      'data_nova',   to_char(p_nova_data, 'DD/MM/YYYY')
    )
  );

exception
  when exclusion_violation then
    raise exception 'O equipamento já está reservado em %.', to_char(p_nova_data, 'DD/MM/YYYY');
end;
$$;

grant execute on function public.reagendar_agendamento to authenticated;

-- ------------------------------------------------------------
-- 4) Marcar como realizado, e desfazer
--
-- Realizado diz que o procedimento aconteceu. Não diz nada sobre
-- pagamento: essa é a separação que a C3 completa. Uma locação pode
-- ficar realizada e não paga, e é assim que ela vira "a receber".
-- ------------------------------------------------------------
create or replace function public.marcar_realizada(
  p_rental_id uuid,
  p_realizada boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status event_status_type;
  v_data date;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar locações.';
  end if;

  select status, event_date into v_status, v_data from rentals where id = p_rental_id;

  if v_status is null then
    raise exception 'Locação não encontrada.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Esta locação está cancelada.';
  end if;

  if p_realizada and v_data > current_date then
    raise exception 'Esta locação é do dia %. Não dá para marcar como realizada antes de acontecer.',
      to_char(v_data, 'DD/MM/YYYY');
  end if;

  update rentals
     set status = case when p_realizada then 'realizada' else 'confirmada' end::event_status_type
   where id = p_rental_id;

  update calendar_events
     set status = case when p_realizada then 'realizada' else 'confirmada' end::event_status_type
   where rental_id = p_rental_id;

  perform public.registrar_movimentacao(
    case when p_realizada then 'realizado' else 'realizacao_desfeita' end,
    'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object('status_novo', case when p_realizada then 'realizada' else 'confirmada' end)
  );
end;
$$;

grant execute on function public.marcar_realizada to authenticated;

-- ------------------------------------------------------------
-- 5) Cancelar um agendamento
--
-- Sai da agenda (a constraint de conflito ignora cancelados, então a
-- data fica livre na hora) e deixa de contar valor. Não apaga nada:
-- cancelar é diferente de excluir, e o registro continua visível no
-- histórico do cliente com a etiqueta de cancelado.
-- ------------------------------------------------------------
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
  v_descricao text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para cancelar agendamentos.';
  end if;

  select rental_id, status into v_rental_id, v_status
    from calendar_events where id = p_event_id;

  if v_status is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Este agendamento já está cancelado.';
  end if;

  -- Descrição calculada antes, para o histórico guardar como o registro
  -- era no momento do cancelamento.
  v_descricao := public.descrever_registro('calendar_events', p_event_id);

  update calendar_events set status = 'cancelada' where id = p_event_id;

  if v_rental_id is not null then
    update rentals set status = 'cancelada' where id = v_rental_id;
  end if;

  perform public.registrar_movimentacao(
    'cancelado', 'calendar_events', p_event_id, v_descricao,
    jsonb_build_object('motivo', coalesce(nullif(trim(p_motivo), ''), 'não informado'))
  );
end;
$$;

grant execute on function public.cancelar_agendamento to authenticated;

-- ------------------------------------------------------------
-- 6) Reativar um agendamento cancelado
--
-- Cancelar por engano acontece. Sem isto, a única saída seria criar
-- tudo de novo. A data precisa estar livre para reativar, pela mesma
-- regra de conflito de qualquer agendamento.
-- ------------------------------------------------------------
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
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para reativar agendamentos.';
  end if;

  select rental_id, equipment_id, date_start into v_rental_id, v_equipment_id, v_data
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

  update calendar_events set status = 'confirmada', confirmed = false where id = p_event_id;
  if v_rental_id is not null then
    update rentals set status = 'confirmada' where id = v_rental_id;
  end if;

  perform public.registrar_movimentacao(
    'editado', 'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('acao_detalhada', 'agendamento reativado')
  );
end;
$$;

grant execute on function public.reativar_agendamento to authenticated;

-- ------------------------------------------------------------
-- 7) Agendamentos de um cliente, para a ficha do lead
--
-- Devolve tudo que a ficha precisa para desenhar os botões: o estado
-- atual de cada agendamento e se ele tem locação por trás. Uma função
-- só, para a tela não precisar montar três consultas e correr o risco
-- de elas discordarem entre si.
-- ------------------------------------------------------------
create or replace function public.agendamentos_do_cliente(p_client_id uuid)
returns table (
  event_id uuid,
  rental_id uuid,
  equipamento text,
  data date,
  status text,
  confirmado boolean,
  valor numeric,
  disparos integer,
  situacao text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ev.id,
    ev.rental_id,
    coalesce(eq.name, ev.title),
    ev.date_start,
    ev.status::text,
    ev.confirmed,
    coalesce(r.calculated_value, ev.value),
    r.shots,
    -- "situacao" é o rótulo único que a tela mostra, já resolvido aqui
    -- para os dois eixos não serem recombinados de formas diferentes em
    -- cada lugar da interface.
    case
      when ev.status = 'cancelada'  then 'cancelado'
      when ev.status = 'realizada'  then 'realizado'
      when ev.confirmed             then 'confirmado'
      else 'agendado'
    end
  from calendar_events ev
  left join equipments eq on eq.id = ev.equipment_id
  left join rentals r on r.id = ev.rental_id
  where ev.client_id = p_client_id
  order by ev.date_start desc;
$$;

grant execute on function public.agendamentos_do_cliente to authenticated;
