-- ============================================================
-- LEVA C3a: pagamento separado de realizado, e a taxa de compromisso
--
-- A REGRA QUE MUDA
-- Até aqui o sistema criava o lançamento financeiro no instante em que
-- a locação nascia, ou seja, assumia que foi paga na hora. Era por isso
-- que o faturamento contava dinheiro que talvez ainda não tivesse
-- entrado.
--
-- Agora são coisas separadas:
--   realizada = o procedimento aconteceu
--   paga      = o dinheiro entrou
--
-- Locação realizada e não paga é receita a receber, e não aparece no
-- caixa. O lançamento financeiro só passa a existir quando o pagamento
-- é marcado. Sem lançamento, não há dinheiro em lugar nenhum, o que faz
-- o Financeiro, o Dashboard e os Relatórios ficarem certos sem precisar
-- de filtro novo em cada tela.
--
-- A TAXA DE COMPROMISSO (R$ 250)
-- Pertence ao agendamento, não ao cliente: ela garante uma data
-- específica, e o mesmo cliente que aluga cinco vezes reserva cinco
-- datas. Tem quatro estados:
--
--   nao_aplica = parceiro, ou caso em que não foi cobrada
--   pendente   = cobrada e ainda não paga
--   paga       = paga; vira crédito no pagamento da locação
--   perdida    = cliente cancelou depois de ter pago; o valor fica
--                como receita e não vira crédito de nada
--
-- Quando a locação é paga e a taxa daquele agendamento está paga, o
-- lançamento da locação nasce já descontado. A soma dos dois lançamentos
-- continua sendo o valor cheio da locação, que é o que precisa bater.
--
-- PARCEIRO
-- Marca no cliente. Parceiro conhecido reserva sem pagar taxa, e todo
-- agendamento dele nasce com a taxa em nao_aplica, sem ninguém precisar
-- lembrar disso a cada reserva.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Colunas novas
-- ------------------------------------------------------------
alter table public.clients
  add column if not exists parceiro boolean not null default false;

comment on column public.clients.parceiro is
  'Parceiro conhecido: reserva data sem pagar a taxa de compromisso. Agendamentos deste cliente nascem com taxa_status = nao_aplica.';

alter table public.calendar_events
  add column if not exists taxa_status text not null default 'nao_aplica';

-- Constraint separada do add column para a migração poder rodar de novo
-- sem erro num banco que já tenha a coluna.
alter table public.calendar_events drop constraint if exists calendar_events_taxa_status_check;
alter table public.calendar_events add constraint calendar_events_taxa_status_check
  check (taxa_status in ('nao_aplica', 'pendente', 'paga', 'perdida'));

alter table public.calendar_events
  add column if not exists taxa_valor numeric(12,2);
alter table public.calendar_events
  add column if not exists taxa_transaction_id uuid references public.transactions(id);

comment on column public.calendar_events.taxa_status is
  'Taxa de compromisso deste agendamento. paga vira crédito na locação; perdida é quando o cliente cancelou após pagar, e o valor fica como receita.';

alter table public.rentals
  add column if not exists pago boolean not null default false;
alter table public.rentals
  add column if not exists pago_em date;

comment on column public.rentals.pago is
  'Se o dinheiro da locação entrou. Independente de status: locação pode estar realizada e não paga, e nesse caso é receita a receber.';

-- A coluna pago nasce falsa, mas locação que já tem lançamento financeiro
-- foi paga na prática: era exatamente o que o create_rental antigo fazia.
-- Sem este acerto, todas as locações antigas apareceriam como a receber e
-- dariam para marcar pago de novo, criando lançamento em dobro.
update public.rentals
   set pago = true,
       pago_em = coalesce(pago_em, event_date)
 where transaction_id is not null
   and pago = false;

-- Novo estado no histórico: taxa cobrada e ainda não paga. Sem ele,
-- definir_taxa_agendamento teria de gravar 'taxa_isenta' para uma taxa
-- pendente, o que é o contrário do que aconteceu.
alter table public.movimentacoes drop constraint if exists movimentacoes_acao_check;
alter table public.movimentacoes add constraint movimentacoes_acao_check
  check (acao in (
    'criado', 'editado', 'confirmado', 'desconfirmado',
    'reagendado', 'cancelado', 'excluido',
    'realizado', 'realizacao_desfeita',
    'pago', 'pagamento_desfeito',
    'taxa_paga', 'taxa_perdida', 'taxa_isenta', 'taxa_pendente'
  ));

-- ------------------------------------------------------------
-- 2) Valor da taxa configurado
-- ------------------------------------------------------------
create or replace function public.valor_taxa_atual()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select reservation_fee from settings where id = true), 250.00);
$$;

-- ------------------------------------------------------------
-- 3) Definir a taxa de um agendamento
--
-- Marcar como paga cria o lançamento da taxa. Voltar para pendente ou
-- nao_aplica apaga esse lançamento, porque dinheiro que não entrou não
-- pode ficar no caixa. Perdida mantém o lançamento de propósito: o
-- cliente pagou, cancelou, e o valor é seu.
-- ------------------------------------------------------------
create or replace function public.definir_taxa_agendamento(
  p_event_id uuid,
  p_status text,
  p_payment_method payment_method_type default 'pix'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status_atual text;
  v_transacao_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_data date;
  v_categoria uuid;
  v_valor numeric;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar a taxa.';
  end if;

  if p_status not in ('nao_aplica', 'pendente', 'paga', 'perdida') then
    raise exception 'Estado de taxa inválido: %', p_status;
  end if;

  select ev.taxa_status, ev.taxa_transaction_id, ev.client_id, ev.date_start, c.name
    into v_status_atual, v_transacao_id, v_client_id, v_data, v_client_name
    from calendar_events ev
    left join clients c on c.id = ev.client_id
   where ev.id = p_event_id;

  if v_data is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if p_status = 'perdida' and v_status_atual <> 'paga' then
    raise exception 'Só faz sentido marcar como perdida uma taxa que estava paga.';
  end if;

  v_valor := public.valor_taxa_atual();

  if p_status = 'paga' and v_transacao_id is null then
    select id into v_categoria
      from categories
     where type = 'entrada' and name ilike 'Taxa%'
     limit 1;

    insert into transactions (
      type, category_id, description, amount, payment_method, date, scope, client_id, created_by
    )
    values (
      'entrada', v_categoria,
      'Taxa de compromisso - ' || coalesce(v_client_name, 'cliente'),
      v_valor, p_payment_method, v_data, 'harmonize', v_client_id, auth.uid()
    )
    returning id into v_transacao_id;

  elsif p_status in ('nao_aplica', 'pendente') and v_transacao_id is not null then
    -- Solta o ponteiro antes de apagar: a coluna aponta para transactions.
    update calendar_events set taxa_transaction_id = null where id = p_event_id;
    delete from transactions where id = v_transacao_id;
    v_transacao_id := null;
  end if;

  update calendar_events
     set taxa_status = p_status,
         taxa_valor = case when p_status in ('paga', 'perdida', 'pendente') then v_valor else null end,
         taxa_transaction_id = v_transacao_id
   where id = p_event_id;

  perform public.registrar_movimentacao(
    case p_status
      when 'paga'     then 'taxa_paga'
      when 'perdida'  then 'taxa_perdida'
      when 'pendente' then 'taxa_pendente'
      else 'taxa_isenta'
    end,
    'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('taxa_status', p_status, 'taxa_valor', v_valor)
  );
end;
$$;

grant execute on function public.definir_taxa_agendamento to authenticated;

-- ------------------------------------------------------------
-- 4) Marcar a locação como paga
--
-- É aqui que o dinheiro da locação entra no caixa, e em nenhum outro
-- lugar. Se a taxa daquele agendamento estiver paga, ela é abatida:
-- o lançamento da locação nasce menor, e a soma dos dois continua sendo
-- o valor cheio.
-- ------------------------------------------------------------
create or replace function public.marcar_locacao_paga(
  p_rental_id uuid,
  p_payment_method payment_method_type default null,
  p_data date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago boolean;
  v_valor numeric;
  v_client_id uuid;
  v_client_name text;
  v_event_date date;
  v_forma payment_method_type;
  v_status event_status_type;
  v_categoria uuid;
  v_credito numeric := 0;
  v_valor_lancamento numeric;
  v_transacao_id uuid;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para registrar pagamentos.';
  end if;

  select r.pago, r.calculated_value, r.client_id, r.event_date, r.payment_method, r.status, c.name
    into v_pago, v_valor, v_client_id, v_event_date, v_forma, v_status, v_client_name
    from rentals r
    left join clients c on c.id = r.client_id
   where r.id = p_rental_id;

  if v_valor is null then
    raise exception 'Locação não encontrada.';
  end if;
  if v_pago then
    raise exception 'Esta locação já está marcada como paga.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Esta locação está cancelada. Reative o agendamento antes de registrar o pagamento, para o caixa não receber dinheiro de algo cancelado.';
  end if;

  -- Crédito da taxa: só conta se a taxa daquele agendamento foi paga.
  -- Perdida não gera crédito, que é justamente a regra do cancelamento.
  select coalesce(sum(ev.taxa_valor), 0) into v_credito
    from calendar_events ev
   where ev.rental_id = p_rental_id and ev.taxa_status = 'paga';

  v_valor_lancamento := greatest(v_valor - v_credito, 0);
  v_forma := coalesce(p_payment_method, v_forma);

  select id into v_categoria
    from categories
   where type = 'entrada' and is_default = true and name ilike 'Loca%'
   limit 1;

  insert into transactions (
    type, category_id, description, amount, payment_method, date, scope,
    client_id, rental_id, created_by
  )
  values (
    'entrada', v_categoria,
    'Locação HIPRO - ' || coalesce(v_client_name, ''),
    v_valor_lancamento, v_forma, coalesce(p_data, current_date), 'harmonize',
    v_client_id, p_rental_id, auth.uid()
  )
  returning id into v_transacao_id;

  update rentals
     set pago = true,
         pago_em = coalesce(p_data, current_date),
         payment_method = v_forma,
         transaction_id = v_transacao_id
   where id = p_rental_id;

  perform public.registrar_movimentacao(
    'pago', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object(
      'valor_locacao',  round(v_valor, 2),
      'credito_taxa',   round(v_credito, 2),
      'valor_recebido', round(v_valor_lancamento, 2),
      'forma',          v_forma::text
    )
  );
end;
$$;

grant execute on function public.marcar_locacao_paga to authenticated;

-- ------------------------------------------------------------
-- 5) Desfazer o pagamento
--
-- Apaga o lançamento e volta a locação para não paga. Existe porque
-- marcar pago por engano acontece, e a alternativa seria apagar o
-- lançamento na mão e deixar a locação achando que recebeu.
-- ------------------------------------------------------------
create or replace function public.desfazer_pagamento_locacao(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transacao_id uuid;
  v_pago boolean;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para alterar pagamentos.';
  end if;

  select transaction_id, pago into v_transacao_id, v_pago
    from rentals where id = p_rental_id;

  if v_pago is null then
    raise exception 'Locação não encontrada.';
  end if;
  if not v_pago then
    raise exception 'Esta locação não está marcada como paga.';
  end if;

  update rentals set pago = false, pago_em = null, transaction_id = null
   where id = p_rental_id;

  if v_transacao_id is not null then
    delete from transactions where id = v_transacao_id;
  end if;

  perform public.registrar_movimentacao(
    'pagamento_desfeito', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.desfazer_pagamento_locacao to authenticated;

-- ------------------------------------------------------------
-- 6) Cancelar passa a tratar a taxa
--
-- Reescreve a função da C1 acrescentando uma regra: se a taxa daquele
-- agendamento estava paga, ela vira perdida. O lançamento dela continua
-- no caixa, porque o dinheiro é seu, e ela deixa de virar crédito de
-- qualquer locação futura.
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

  perform public.registrar_movimentacao(
    'cancelado', 'calendar_events', p_event_id, v_descricao,
    jsonb_build_object(
      'motivo', coalesce(nullif(trim(p_motivo), ''), 'não informado'),
      'taxa', coalesce(v_taxa, 'nao_aplica')
    )
  );
end;
$$;

grant execute on function public.cancelar_agendamento to authenticated;

-- ------------------------------------------------------------
-- 7) Criar locação sem assumir que foi paga
--
-- Reescreve create_rental com um parâmetro a mais. Quando p_pago é
-- falso, a locação nasce sem lançamento financeiro nenhum, e o dinheiro
-- só aparece quando marcar_locacao_paga for chamada. O padrão continua
-- verdadeiro para as telas antigas não mudarem de comportamento antes
-- da interface da C3b entrar.
-- ------------------------------------------------------------
-- O parâmetro novo cria uma assinatura nova, e create or replace não
-- substitui a antiga: as duas passariam a existir ao mesmo tempo. Aí toda
-- chamada com sete argumentos, que é o que as telas atuais fazem, ficaria
-- ambígua e o Postgres recusaria. Por isso a antiga sai primeiro.
drop function if exists public.create_rental(uuid, uuid, date, integer, numeric, payment_method_type, text);

create or replace function public.create_rental(
  p_client_id uuid,
  p_equipment_id uuid,
  p_event_date date,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_notes text default null,
  p_pago boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_transaction_id uuid;
  v_category_id uuid;
  v_equipment_code equipment_code_type;
  v_client_name text;
  v_created_by uuid := auth.uid();
  v_parceiro boolean;
  v_taxa_status text;
  v_taxa_valor numeric;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para criar locações';
  end if;

  select code into v_equipment_code from equipments where id = p_equipment_id;
  select name, parceiro into v_client_name, v_parceiro from clients where id = p_client_id;
  select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Loca%' limit 1;

  insert into rentals (client_id, equipment_id, event_date, shots, calculated_value, payment_method, notes, created_by, pago, pago_em)
  values (p_client_id, p_equipment_id, p_event_date, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by,
          coalesce(p_pago, false), case when p_pago then current_date else null end)
  returning id into v_rental_id;

  if p_pago then
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
    values ('entrada', v_category_id, 'Locação HIPRO - ' || coalesce(v_client_name, ''), p_calculated_value, p_payment_method, p_event_date, 'harmonize', p_client_id, v_rental_id, v_created_by)
    returning id into v_transaction_id;

    update rentals set transaction_id = v_transaction_id where id = v_rental_id;
  end if;

  -- Estado inicial da taxa de compromisso. A taxa existe para garantir uma
  -- data reservada com antecedência, então ela só nasce pendente quando há
  -- data futura para garantir. Parceiro nunca paga, e locação lançada para
  -- hoje ou para trás não tem mais data a garantir: nos dois casos a taxa
  -- nasce em nao_aplica. Nada disso é definitivo; definir_taxa_agendamento
  -- muda o estado depois, e é por ela que a interface da C3b trabalha.
  if coalesce(v_parceiro, false) or p_event_date <= current_date then
    v_taxa_status := 'nao_aplica';
    v_taxa_valor  := null;
  else
    v_taxa_status := 'pendente';
    v_taxa_valor  := public.valor_taxa_atual();
  end if;

  -- Esta gravação é a que aciona a constraint no_equipment_double_booking.
  -- Se houver conflito, o Postgres recusa aqui e toda a função é desfeita.
  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, value, rental_id, created_by, taxa_status, taxa_valor)
  values (v_equipment_code::text::calendar_event_type, 'Locação - ' || coalesce(v_client_name, ''), p_client_id, p_equipment_id, p_event_date, p_event_date, 'confirmada', p_calculated_value, v_rental_id, v_created_by,
          v_taxa_status, v_taxa_valor);

  update clients set stage = 'cliente' where id = p_client_id and stage <> 'cliente';

  return v_rental_id;
end;
$$;

grant execute on function public.create_rental to authenticated;

-- ------------------------------------------------------------
-- 8) A cascata da Leva B precisa conhecer a taxa
--
-- Apagar um agendamento que tem lançamento de taxa precisa soltar o
-- ponteiro antes, senão a chave estrangeira recusa. Sem isto, a
-- exclusão em cascata quebraria justamente nos agendamentos com taxa.
-- ------------------------------------------------------------
create or replace function public.excluir_locacao_cascata(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taxas uuid[];
begin
  update rentals set transaction_id = null where id = p_rental_id;

  select array_agg(taxa_transaction_id) into v_taxas
    from calendar_events
   where rental_id = p_rental_id and taxa_transaction_id is not null;

  update calendar_events set taxa_transaction_id = null where rental_id = p_rental_id;

  update mentoring_events set calendar_event_id = null
   where calendar_event_id in (select id from calendar_events where rental_id = p_rental_id);
  update mentoring_events set transaction_id = null
   where transaction_id in (select id from transactions where rental_id = p_rental_id);

  delete from calendar_events where rental_id = p_rental_id;
  delete from transactions    where rental_id = p_rental_id;
  if v_taxas is not null then
    delete from transactions where id = any(v_taxas);
  end if;
  delete from rentals where id = p_rental_id;
end;
$$;

-- ------------------------------------------------------------
-- 8b) Reativar devolve a taxa perdida
--
-- Cancelar com taxa paga marca perdida. Se o agendamento é reativado, a
-- data volta a valer e o cliente continua tendo pagado aquele dinheiro,
-- então a taxa volta a ser paga e volta a virar crédito. Sem isto, um
-- cancelamento desfeito faria o cliente perder R$ 250 por um clique.
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
  v_taxa text;
  v_taxa_transacao uuid;
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

  update calendar_events set status = 'confirmada', confirmed = false where id = p_event_id;
  if v_rental_id is not null then
    update rentals set status = 'confirmada' where id = v_rental_id;
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
    jsonb_build_object('acao_detalhada', 'agendamento reativado')
  );
end;
$$;

grant execute on function public.reativar_agendamento to authenticated;

-- ------------------------------------------------------------
-- 8c) Exclusão: a taxa não pode ficar sobrando nem sumir calada
--
-- A taxa cria um lançamento que NÃO tem rental_id, de propósito: taxa
-- perdida continua sendo receita depois de a locação ser cancelada, e se
-- ela carregasse rental_id a view de contabilizáveis a descartaria junto
-- com a locação cancelada.
--
-- O preço disso é que ela também não aparecia nas contas da exclusão. Um
-- registro seria apagado deixando R$ 250 soltos no caixa, ou a exclusão
-- de um lançamento de taxa bateria na chave estrangeira. As duas funções
-- abaixo fecham isso: a prévia soma a taxa junto dos lançamentos, e a
-- exclusão solta o ponteiro antes de apagar.
-- ------------------------------------------------------------
create or replace function public.preview_exclusao(
  p_table text,
  p_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_mentoria_id uuid;
  v_evento_taxa uuid;
  v_locacoes int := 0;
  v_lancamentos int := 0;
  v_eventos int := 0;
  v_tarefas int := 0;
  v_taxas int := 0;
  v_valor_taxas numeric := 0;
  v_valor_locacoes numeric := 0;
  v_valor_lancamentos numeric := 0;
  v_itens text[] := '{}';
  v_aviso text := null;
  v_alvo text;
begin
  perform public.require_admin();

  v_alvo := public.descrever_registro(p_table, p_id);

  if p_table = 'rentals' then
    v_locacoes := 1;
    select coalesce(calculated_value, 0) into v_valor_locacoes
      from rentals where id = p_id;
    select count(*), coalesce(sum(amount), 0) into v_lancamentos, v_valor_lancamentos
      from transactions where rental_id = p_id;
    select count(*) into v_eventos from calendar_events where rental_id = p_id;
    select count(*), coalesce(sum(t.amount), 0) into v_taxas, v_valor_taxas
      from calendar_events ev
      join transactions t on t.id = ev.taxa_transaction_id
     where ev.rental_id = p_id;

  elsif p_table = 'transactions' then
    select rental_id, mentoring_id into v_rental_id, v_mentoria_id
      from transactions where id = p_id;

    if v_rental_id is not null then
      return public.preview_exclusao('rentals', v_rental_id)
             || jsonb_build_object('aviso',
                'Este lançamento pertence a uma locação. Apagar vai apagar a locação inteira, junto com o evento da agenda.');
    elsif v_mentoria_id is not null then
      return public.preview_exclusao('mentoring_events', v_mentoria_id)
             || jsonb_build_object('aviso',
                'Este lançamento pertence a uma mentoria. Apagar vai apagar a mentoria inteira.');
    end if;

    -- Lançamento de taxa de compromisso: apagar só ele é legítimo, serve
    -- para desfazer uma taxa marcada como paga por engano. Mas o
    -- agendamento tem de voltar a dizer que a taxa está pendente, senão
    -- ficaria dizendo "paga" sem dinheiro nenhum atrás.
    select id into v_evento_taxa from calendar_events where taxa_transaction_id = p_id limit 1;

    v_lancamentos := 1;
    select coalesce(amount, 0) into v_valor_lancamentos from transactions where id = p_id;

    if v_evento_taxa is not null then
      v_aviso := 'Este lançamento é a taxa de compromisso de um agendamento. Apagar vai deixar a taxa daquele agendamento como pendente de novo.';
    end if;

  elsif p_table = 'calendar_events' then
    select rental_id, mentoring_id into v_rental_id, v_mentoria_id
      from calendar_events where id = p_id;

    if v_rental_id is not null then
      return public.preview_exclusao('rentals', v_rental_id)
             || jsonb_build_object('aviso',
                'Este evento pertence a uma locação. Apagar vai apagar a locação inteira, junto com o lançamento financeiro.');
    elsif v_mentoria_id is not null then
      return public.preview_exclusao('mentoring_events', v_mentoria_id)
             || jsonb_build_object('aviso',
                'Este evento pertence a uma mentoria. Apagar vai apagar a mentoria inteira.');
    end if;

    v_eventos := 1;
    select count(*), coalesce(sum(t.amount), 0) into v_taxas, v_valor_taxas
      from calendar_events ev
      join transactions t on t.id = ev.taxa_transaction_id
     where ev.id = p_id;

  elsif p_table = 'mentoring_events' then
    select count(*), coalesce(sum(amount), 0) into v_lancamentos, v_valor_lancamentos
      from transactions
     where mentoring_id = p_id
        or id = (select transaction_id from mentoring_events where id = p_id);
    select count(*) into v_eventos
      from calendar_events
     where mentoring_id = p_id
        or id = (select calendar_event_id from mentoring_events where id = p_id);

  elsif p_table = 'clients' then
    select count(*), coalesce(sum(calculated_value), 0) into v_locacoes, v_valor_locacoes
      from rentals where client_id = p_id;
    select count(*) into v_eventos from calendar_events where client_id = p_id;
    select count(*) into v_tarefas from tasks where client_id = p_id;
    select count(*), coalesce(sum(amount), 0) into v_lancamentos, v_valor_lancamentos
      from transactions
     where client_id = p_id
        or rental_id in (select id from rentals where client_id = p_id);
    -- A taxa carrega client_id, então normalmente já entrou na conta
    -- acima. Aqui só contam as que não entraram, para não somar duas
    -- vezes o mesmo lançamento.
    select count(*), coalesce(sum(t.amount), 0) into v_taxas, v_valor_taxas
      from calendar_events ev
      join transactions t on t.id = ev.taxa_transaction_id
     where ev.client_id = p_id
       and coalesce(t.client_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_id
       and t.rental_id is null;

  elsif p_table = 'tasks' then
    v_tarefas := 1;

  else
    raise exception 'Tabela não permitida: %', p_table;
  end if;

  -- A taxa entra junto dos lançamentos porque é isso que ela é: um
  -- lançamento de entrada no caixa. Quem confirma precisa ver o valor
  -- total que sai do financeiro, não dois números para somar de cabeça.
  v_lancamentos := v_lancamentos + coalesce(v_taxas, 0);
  v_valor_lancamentos := coalesce(v_valor_lancamentos, 0) + coalesce(v_valor_taxas, 0);

  if v_locacoes > 0 then
    v_itens := v_itens || (v_locacoes || (case when v_locacoes = 1 then ' locação' else ' locações' end));
  end if;
  if v_eventos > 0 then
    v_itens := v_itens || (v_eventos || (case when v_eventos = 1 then ' evento da agenda' else ' eventos da agenda' end));
  end if;
  if v_lancamentos > 0 then
    v_itens := v_itens || (v_lancamentos || (case when v_lancamentos = 1 then ' lançamento financeiro' else ' lançamentos financeiros' end));
  end if;
  if v_taxas > 0 then
    v_itens := v_itens || ('incluindo ' || public.formatar_reais(v_valor_taxas) || ' de taxa de compromisso');
  end if;
  if v_tarefas > 0 then
    v_itens := v_itens || (v_tarefas || (case when v_tarefas = 1 then ' tarefa' else ' tarefas' end));
  end if;

  return jsonb_build_object(
    'tabela', p_table,
    'id', p_id,
    'alvo', v_alvo,
    'locacoes', v_locacoes,
    'eventos', v_eventos,
    'lancamentos', v_lancamentos,
    'tarefas', v_tarefas,
    'taxas', v_taxas,
    'valor_taxas', round(coalesce(v_valor_taxas, 0), 2),
    'valor_locacoes', round(coalesce(v_valor_locacoes, 0), 2),
    'valor_lancamentos', round(coalesce(v_valor_lancamentos, 0), 2),
    'itens', to_jsonb(v_itens),
    'aviso', v_aviso
  );
end;
$$;

create or replace function public.delete_record_forever(
  p_table text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_descricao text;
  v_detalhes jsonb;
  v_rental_id uuid;
  v_mentoria_id uuid;
  v_evento_taxa uuid;
  v_taxas uuid[];
begin
  perform public.require_admin();

  v_descricao := public.descrever_registro(p_table, p_id);
  v_detalhes  := public.preview_exclusao(p_table, p_id);

  if p_table = 'rentals' then
    perform public.excluir_locacao_cascata(p_id);

  elsif p_table = 'transactions' then
    select rental_id, mentoring_id into v_rental_id, v_mentoria_id
      from transactions where id = p_id;

    if v_rental_id is not null then
      perform public.excluir_locacao_cascata(v_rental_id);
    elsif v_mentoria_id is not null then
      perform public.excluir_mentoria_cascata(v_mentoria_id);
    else
      -- Se este lançamento é a taxa de um agendamento, o ponteiro tem de
      -- ser solto antes (chave estrangeira) e a taxa volta a pendente.
      select id into v_evento_taxa from calendar_events where taxa_transaction_id = p_id limit 1;
      if v_evento_taxa is not null then
        update calendar_events
           set taxa_transaction_id = null,
               taxa_status = 'pendente',
               taxa_valor = coalesce(taxa_valor, public.valor_taxa_atual())
         where id = v_evento_taxa;
      end if;

      update rentals          set transaction_id = null where transaction_id = p_id;
      update mentoring_events set transaction_id = null where transaction_id = p_id;
      delete from transactions where id = p_id;
    end if;

  elsif p_table = 'calendar_events' then
    select rental_id, mentoring_id into v_rental_id, v_mentoria_id
      from calendar_events where id = p_id;

    if v_rental_id is not null then
      perform public.excluir_locacao_cascata(v_rental_id);
    elsif v_mentoria_id is not null then
      perform public.excluir_mentoria_cascata(v_mentoria_id);
    else
      update mentoring_events set calendar_event_id = null where calendar_event_id = p_id;
      -- Apagar o evento levaria o ponteiro embora e deixaria a taxa solta
      -- no caixa, sem nada explicando de onde veio.
      select taxa_transaction_id into v_evento_taxa from calendar_events where id = p_id;
      update calendar_events set taxa_transaction_id = null where id = p_id;
      delete from calendar_events where id = p_id;
      if v_evento_taxa is not null then
        delete from transactions where id = v_evento_taxa;
      end if;
    end if;

  elsif p_table = 'mentoring_events' then
    perform public.excluir_mentoria_cascata(p_id);

  elsif p_table = 'tasks' then
    delete from tasks where id = p_id;

  elsif p_table = 'clients' then
    update rentals set transaction_id = null where client_id = p_id;

    update mentoring_events set calendar_event_id = null
     where calendar_event_id in (select id from calendar_events where client_id = p_id);
    update mentoring_events set transaction_id = null
     where transaction_id in (
       select id from transactions
        where client_id = p_id
           or rental_id in (select id from rentals where client_id = p_id)
     );

    -- Guarda os lançamentos de taxa antes de os eventos irem embora, para
    -- apagá-los depois. Sem isto, a taxa de um cliente apagado ficaria no
    -- caixa apontando para um cliente que não existe mais.
    select array_agg(taxa_transaction_id) into v_taxas
      from calendar_events
     where client_id = p_id and taxa_transaction_id is not null;

    update calendar_events set taxa_transaction_id = null where client_id = p_id;

    delete from calendar_events where client_id = p_id;
    delete from transactions
     where client_id = p_id
        or rental_id in (select id from rentals where client_id = p_id)
        or id = any(coalesce(v_taxas, '{}'::uuid[]));
    delete from rentals     where client_id = p_id;
    delete from client_tags where client_id = p_id;
    delete from tasks       where client_id = p_id;
    delete from clients     where id = p_id;

  else
    raise exception 'Tabela não permitida: %', p_table;
  end if;

  perform public.registrar_movimentacao(
    'excluido', p_table, p_id, v_descricao, v_detalhes
  );
end;
$$;

-- ------------------------------------------------------------
-- 9) A lista da ficha passa a mostrar taxa e pagamento
-- ------------------------------------------------------------
-- Colunas novas na lista mudam o tipo de retorno, e create or replace não
-- aceita isso. Some primeiro, nasce de novo abaixo.
drop function if exists public.agendamentos_do_cliente(uuid);

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
  situacao text,
  taxa_status text,
  taxa_valor numeric,
  pago boolean,
  pago_em date
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
    case
      when ev.status = 'cancelada'  then 'cancelado'
      when ev.status = 'realizada'  then 'realizado'
      when ev.confirmed             then 'confirmado'
      else 'agendado'
    end,
    ev.taxa_status,
    ev.taxa_valor,
    coalesce(r.pago, false),
    r.pago_em
  from calendar_events ev
  left join equipments eq on eq.id = ev.equipment_id
  left join rentals r on r.id = ev.rental_id
  where ev.client_id = p_client_id
  order by ev.date_start desc;
$$;

grant execute on function public.agendamentos_do_cliente to authenticated;

-- ------------------------------------------------------------
-- 10) A receber: realizado e ainda não pago
-- ------------------------------------------------------------
create or replace view public.locacoes_a_receber
with (security_invoker = true) as
select
  r.id,
  r.client_id,
  c.name as cliente,
  r.event_date,
  r.calculated_value,
  coalesce((
    select sum(ev.taxa_valor) from calendar_events ev
     where ev.rental_id = r.id and ev.taxa_status = 'paga'
  ), 0) as credito_taxa,
  greatest(r.calculated_value - coalesce((
    select sum(ev.taxa_valor) from calendar_events ev
     where ev.rental_id = r.id and ev.taxa_status = 'paga'
  ), 0), 0) as valor_a_receber
from rentals r
left join clients c on c.id = r.client_id
where r.status = 'realizada'
  and r.pago = false
  and r.is_test = false;

comment on view public.locacoes_a_receber is
  'Locações que aconteceram e ainda não foram pagas, já com o crédito da taxa abatido. É a lista de cobrança, e não entra em faturamento nenhum.';

grant select on public.locacoes_a_receber to authenticated;
