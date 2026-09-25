-- ============================================================
-- RODAR TUDO: C3c + C4 num arquivo só
--
-- Junta as duas migrações de 24/09/2026 para serem executadas de uma
-- vez no SQL Editor do Supabase, na ordem certa.
--
-- C3c: faz a taxa de compromisso nascer sozinha em qualquer caminho que
--      reserve uma data futura, e acerta os agendamentos que já estavam
--      na agenda sem taxa.
-- C4:  cria a view clientes_taxas, que é de onde o Funil, a lista de
--      Clientes e os Relatórios passam a ler a taxa. Sem ela essas três
--      telas abrem com as etiquetas de taxa zeradas.
--
-- PODE RODAR MAIS DE UMA VEZ
-- Tudo aqui é "create or replace", "drop if exists" ou update que só
-- toca em quem está em nao_aplica. Rodar duas vezes dá o mesmo
-- resultado que rodar uma, então não precisa lembrar se já rodou.
--
-- SE DER ERRO
-- O SQL Editor roda tudo como uma transação: ou entra inteiro, ou nada
-- entra. Se aparecer mensagem vermelha, o banco ficou exatamente como
-- estava, e é só me mandar o texto do erro.
-- ============================================================

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

-- ============================================================
-- LEVA C4: a taxa do cliente passa a ser lida dos agendamentos
--
-- O QUE ESTÁ ERRADO HOJE
-- clients.reservation_fee_status guarda UMA taxa por cliente. Desde a
-- C3a a taxa pertence ao agendamento, porque ela garante uma data
-- específica: um cliente que aluga cinco vezes reserva cinco datas e
-- deve cinco taxas. Os dois campos convivem na mesma tela do funil, um
-- dizendo "Pendente" e o outro dizendo outra coisa, sem nada indicando
-- qual vale.
--
-- O QUE ESTA VIEW RESOLVE
-- Ela responde, por cliente, o que as telas precisam: quantas taxas
-- estão pendentes, quantas foram pagas e quanto isso dá em dinheiro.
-- Existe para as telas não escreverem cada uma a sua junção: foi
-- exatamente assim que o faturamento passou a ter cinco consultas
-- diferentes e a divergir em R$ 39.581,97.
--
-- O QUE FICA NO CLIENTE
-- Só parceiro, que é de cliente mesmo: é uma característica da relação,
-- não de uma data. A coluna antiga continua existindo por enquanto, sem
-- ninguém ler, e sai numa migração separada depois que as telas novas
-- estiverem rodando. Derrubar coluna que uma tela ainda lê quebra a
-- tela na hora.
-- ============================================================

create or replace view public.clientes_taxas
with (security_invoker = true) as
select
  c.id as client_id,
  -- Agendamento cancelado fica de fora: a taxa dele, se estava paga,
  -- virou perdida no cancelamento e não é mais nem crédito nem cobrança.
  count(*) filter (where ev.taxa_status = 'pendente')            as taxas_pendentes,
  count(*) filter (where ev.taxa_status = 'paga')                as taxas_pagas,
  -- Taxa pendente sem valor gravado vale a taxa configurada. Sem este
  -- coalesce, um agendamento nessas condições apareceria na contagem e
  -- sumiria do dinheiro, e a tela mostraria "2 pendentes, R$ 250,00",
  -- que quem lê interpreta como erro do sistema.
  coalesce(sum(coalesce(ev.taxa_valor, public.valor_taxa_atual()))
           filter (where ev.taxa_status = 'pendente'), 0) as valor_pendente,
  coalesce(sum(coalesce(ev.taxa_valor, public.valor_taxa_atual()))
           filter (where ev.taxa_status = 'paga'), 0)     as valor_pago,
  -- A data mais próxima com taxa em aberto, para a tela poder dizer
  -- "pendente para 21/10" em vez de só "pendente".
  min(ev.date_start) filter (where ev.taxa_status = 'pendente')  as proxima_pendente
from public.clients c
left join public.calendar_events ev
  on ev.client_id = c.id
 and ev.status <> 'cancelada'
 and ev.equipment_id is not null
group by c.id;

comment on view public.clientes_taxas is
  'Resumo por cliente das taxas de compromisso que estão nos agendamentos. Substitui clients.reservation_fee_status, que guardava uma taxa só por cliente quando cada data reservada tem a sua.';

grant select on public.clientes_taxas to authenticated;

-- ============================================================
-- CONFERÊNCIA
-- As três primeiras linhas têm que vir com 1. A lista embaixo mostra
-- quem ficou com taxa em aberto.
-- ============================================================
select 'view clientes_taxas' as o_que, count(*)::text as resultado
  from information_schema.views
 where table_schema = 'public' and table_name = 'clientes_taxas'
union all
select 'gatilho da taxa automatica', count(*)::text
  from pg_trigger where tgname = 'calendar_events_definir_taxa'
union all
select 'coluna parceiro', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'clients' and column_name = 'parceiro'
union all
select '--- taxas por estado ---', ''
union all
select coalesce(ev.taxa_status, 'sem taxa'), count(*)::text
  from public.calendar_events ev
 where ev.equipment_id is not null and ev.status <> 'cancelada'
 group by ev.taxa_status;
