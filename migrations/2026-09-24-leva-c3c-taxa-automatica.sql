-- ============================================================
-- LEVA C3c: a taxa de compromisso nasce sozinha
--
-- O PROBLEMA
-- A C3a ensinou o create_rental a nascer com a taxa pendente, mas o
-- "Reservar HIPRO Day" não passa por ele: grava o evento direto na
-- agenda. E é justamente esse o caminho de travar uma data futura, que
-- é a razão de a taxa existir. Resultado: toda reserva feita por ali
-- nascia sem taxa, e alguém teria de lembrar de cobrar na mão, toda vez.
--
-- POR QUE A REGRA VEM PARA O BANCO
-- Consertar no modal consertaria um caminho. Já existem pelo menos três
-- que criam evento de equipamento, e a próxima tela que alguém escrever
-- seria o quarto. Num gatilho a regra vale para todos, inclusive para os
-- que ainda não existem.
--
-- A REGRA
-- Evento de equipamento, para data futura, de cliente que não é
-- parceiro, nasce com a taxa pendente no valor configurado. Qualquer
-- uma dessas condições faltando, nasce em nao_aplica:
--   sem equipamento  -> mentoria e compromisso avulso não têm taxa
--   data no passado  -> não há mais data a garantir
--   parceiro         -> reserva sem pagar, que é o combinado com ele
--
-- Nada disso é definitivo. definir_taxa_agendamento muda o estado
-- depois, e a tela do cliente tem os botões para isso.
--
-- CONVIVÊNCIA COM O create_rental
-- O create_rental já grava a taxa explicitamente. Nos casos em que ele
-- grava nao_aplica (parceiro, ou data que já passou), o gatilho chega às
-- mesmas condições e também não mexe. Os dois concordam, então não
-- brigam.
-- ============================================================

create or replace function public.definir_taxa_ao_criar_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parceiro boolean;
begin
  -- Quem já chegou com taxa decidida passa direto. É o caso do
  -- create_rental, e de qualquer importação que queira mandar o estado.
  if new.taxa_status is distinct from 'nao_aplica' then
    return new;
  end if;

  if new.equipment_id is null then
    return new;
  end if;

  -- current_date no servidor do Supabase é UTC. Às 21h em Brasília já é
  -- o dia seguinte lá, e uma reserva feita à noite para o dia seguinte
  -- seria lida como "hoje" e nasceria sem taxa. Por isso a comparação é
  -- feita contra a data de Brasília, o mesmo calendário que as telas
  -- usam desde a correção de fuso do lib/period.
  if new.date_start <= (now() at time zone 'America/Sao_Paulo')::date then
    return new;
  end if;

  select parceiro into v_parceiro from clients where id = new.client_id;
  if coalesce(v_parceiro, false) then
    return new;
  end if;

  new.taxa_status := 'pendente';
  new.taxa_valor := public.valor_taxa_atual();
  return new;
end;
$$;

drop trigger if exists calendar_events_definir_taxa on public.calendar_events;
create trigger calendar_events_definir_taxa
  before insert on public.calendar_events
  for each row execute function public.definir_taxa_ao_criar_evento();

comment on function public.definir_taxa_ao_criar_evento is
  'Faz a taxa de compromisso nascer pendente em reserva de equipamento para data futura de cliente que não é parceiro, por qualquer caminho que crie o evento.';

-- ------------------------------------------------------------
-- Acerto dos que já existiam
--
-- Os agendamentos criados antes da C3a nasceram todos em nao_aplica,
-- porque a coluna não existia. Os que ainda são futuros deveriam estar
-- pendentes pela mesma regra acima. Sem isto, você teria de clicar em
-- "Cobrar taxa" um a um nos agendamentos que já estão na agenda.
--
-- Só mexe em quem está em nao_aplica: taxa já paga, pendente ou perdida
-- fica como está.
-- ------------------------------------------------------------
update public.calendar_events ev
   set taxa_status = 'pendente',
       taxa_valor = public.valor_taxa_atual()
 where ev.taxa_status = 'nao_aplica'
   and ev.equipment_id is not null
   and ev.status <> 'cancelada'
   and ev.date_start > (now() at time zone 'America/Sao_Paulo')::date
   and not exists (
     select 1 from public.clients c where c.id = ev.client_id and c.parceiro
   );

-- Confere: mostra como ficou a taxa dos agendamentos futuros.
select coalesce(ev.taxa_status, 'sem taxa') as taxa,
       count(*) as quantos
  from public.calendar_events ev
 where ev.equipment_id is not null
   and ev.date_start > (now() at time zone 'America/Sao_Paulo')::date
   and ev.status <> 'cancelada'
 group by 1
 order by 1;
