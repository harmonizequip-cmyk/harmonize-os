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

-- Confere: quem tem taxa em aberto e quanto.
select c.name,
       t.taxas_pendentes,
       public.formatar_reais(t.valor_pendente) as em_aberto,
       t.taxas_pagas,
       t.proxima_pendente
  from public.clientes_taxas t
  join public.clients c on c.id = t.client_id
 where t.taxas_pendentes > 0 or t.taxas_pagas > 0
 order by t.proxima_pendente nulls last, c.name;
