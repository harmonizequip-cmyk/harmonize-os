-- ============================================================
-- LEVA O: pagamentos múltiplos/parciais, despesa ligada à locação,
-- deslocamento, custo por disparo negociado e infraestrutura de
-- biometria
--
-- CONTEXTO
-- Hoje uma locação só entende "paga" ou "não paga", com UMA forma de
-- pagamento (rentals.payment_method / rentals.transaction_id). Na
-- prática, um mesmo atendimento pode ser pago em duas parcelas e duas
-- formas diferentes (ex: Dra. Karla de Guarabira pagou R$ 1.000,00 em
-- dinheiro e R$ 4.190,00 em PIX), e às vezes só uma parte foi paga até
-- agora. Esta leva introduz rental_payments: cada pagamento de uma
-- locação vira uma linha própria (forma, valor, data, e — se for PIX —
-- em qual conta caiu), e rentals.pago/pago_em passam a ser CALCULADOS
-- automaticamente a partir da soma desses pagamentos (menos o crédito
-- de taxa de reserva já paga), em vez de setados manualmente.
--
-- Esta leva é só banco de dados, de propósito: nenhuma tela muda ainda
-- (isso é a próxima leva, a calculadora nova no botão "+"). Por isso as
-- funções que o app já chama hoje (marcar_locacao_paga,
-- desfazer_pagamento_locacao, create_rental, finalize_rental_reservation)
-- continuam funcionando exatamente como funcionam agora — só que por
-- baixo já escrevem no formato novo, para o histórico nascer correto e
-- a tela nova (leva seguinte) não precisar migrar nada quando chegar.
--
-- BUG CORRIGIDO DE PASSAGEM: finalize_rental_reservation (usada em
-- "Finalizar Reserva HIPRO Day") cria a transação da locação na hora,
-- mas nunca marcava rentals.pago = true — a locação ficava com o
-- dinheiro já lançado no caixa, mas aparecendo como "não paga" pra
-- sempre. Isso fazia ela entrar errado em locacoes_a_receber assim que
-- alguém clicasse "Marcar como realizada". Com pago/pago_em agora
-- calculados a partir de rental_payments, esse caminho passa a marcar
-- certo também, sem precisar de nenhuma ação extra.
--
-- DESLOCAMENTO E CUSTO POR DISPARO NEGOCIADO: os campos
-- rentals.km_ida / valor_deslocamento / custo_disparo_manual só
-- guardam o dado; a calculadora que os preenche (arredondamento de
-- km, cálculo do valor por disparo negociado) é lógica de tela, e
-- entra na leva da calculadora. Por isso os RPCs
-- definir_deslocamento_locacao e definir_custo_disparo_manual_locacao
-- aqui são deliberadamente simples: só gravam o valor que a tela já
-- calculou, com o registro de auditoria de sempre.
-- ============================================================

-- ------------------------------------------------------------
-- RENTALS: campos novos
-- ------------------------------------------------------------
alter table public.rentals
  add column if not exists km_ida numeric(8,2),
  add column if not exists valor_deslocamento numeric(10,2) not null default 0,
  add column if not exists custo_disparo_manual numeric(6,4);

comment on column public.rentals.km_ida is
  'Distância de ida (em km) até o cliente, digitada uma vez só; a volta é assumida igual. Usada para o relatório de km rodados e para calcular valor_deslocamento (R$ 50 a cada 50 km de ida e volta, arredondando pela regra de 25 km).';
comment on column public.rentals.valor_deslocamento is
  'Valor de deslocamento já calculado e cobrado do cliente nesta locação, como ajuda de custo ligada a ela. Ver km_ida para a distância que originou o valor.';
comment on column public.rentals.custo_disparo_manual is
  'Preço por disparo negociado manualmente nesta locação (ex: 0.07), usado no lugar da tabela em faixas quando o atendimento pede um valor fora do padrão. Nulo = locação cobrada pela tabela normal.';

-- ------------------------------------------------------------
-- RENTAL_PAYMENTS: um pagamento por linha. Uma locação pode ter várias
-- (parcelas, formas diferentes, ou pagamento parcial em aberto).
-- ------------------------------------------------------------
create table public.rental_payments (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  forma payment_method_type not null,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  -- Só preenchido quando forma = 'pix': em qual conta o dinheiro caiu.
  -- Lista fechada de propósito (são as três contas reais do negócio);
  -- se um dia entrar uma quarta conta, é uma migration de uma linha.
  pix_conta text,
  transaction_id uuid references public.transactions(id) on delete cascade,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  is_test boolean not null default false,
  check (pix_conta is null or pix_conta in ('eder', 'harmonize', 'laser_dream')),
  check ((forma = 'pix' and pix_conta is not null) or (forma <> 'pix' and pix_conta is null))
);

comment on table public.rental_payments is
  'Pagamentos de uma locação, um por linha (permite dividir entre PIX e dinheiro, ou registrar parcial). rentals.pago/pago_em são recalculados automaticamente sempre que uma linha daqui muda (ver trigger rental_payments_recalcula), somando estes valores e descontando o crédito de taxa de reserva já paga.';
comment on column public.rental_payments.pix_conta is
  'eder = Eder Campos de Almeida, harmonize = Harmonize Bella Prime LTDA, laser_dream = Laser Dream Campina Grande LTDA. Obrigatório quando forma = pix, e só faz sentido nesse caso.';
comment on column public.rental_payments.transaction_id is
  'Lançamento no caixa gerado por este pagamento. on delete cascade: se o lançamento for apagado por qualquer caminho (inclusive a cascata de exclusão da locação), este registro de pagamento some junto, para nunca sobrar pagamento órfão sem lançamento.';

create index rental_payments_rental_id_idx on public.rental_payments(rental_id);

alter table public.rental_payments enable row level security;

create policy "rental_payments_select" on rental_payments for select using (has_module_permission('financeiro'));
create policy "rental_payments_insert" on rental_payments for insert with check (has_module_permission('financeiro'));
create policy "rental_payments_update" on rental_payments for update
  using (has_module_permission('financeiro'))
  with check (has_module_permission('financeiro'));
-- Sem policy de delete (mesmo padrão da leva E): remover um pagamento é
-- só pelo caminho de remover_pagamento_locacao (security definer).

create trigger rental_payments_apply_test_mode
  before insert on public.rental_payments
  for each row execute function public.apply_test_mode();

-- ------------------------------------------------------------
-- RECÁLCULO AUTOMÁTICO DE rentals.pago / rentals.pago_em
--
-- Antes, "pago" era um interruptor que cada função ligava/desligava na
-- mão (marcar_locacao_paga ligava, desfazer_pagamento_locacao
-- desligava). Isso quebrava assim que existisse mais de um pagamento
-- por locação, e também não reagia se a taxa de reserva fosse marcada
-- paga DEPOIS da locação já estar quitada (o crédito da taxa só era
-- considerado no instante do marcar_locacao_paga, nunca revisto depois).
-- Agora pago/pago_em são só a FOTO do que a soma dos pagamentos diz,
-- recalculada sempre que rental_payments muda ou que o crédito de taxa
-- muda — nunca setados diretamente por fora desta função.
-- ------------------------------------------------------------
create or replace function public.recalcular_pagamento_locacao(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric;
  v_credito numeric;
  v_pago_total numeric;
  v_saldo numeric;
  v_ultima_data date;
begin
  select calculated_value into v_valor from rentals where id = p_rental_id;
  if v_valor is null then
    return; -- locação já não existe mais (apagada em cascata); nada a fazer.
  end if;

  select coalesce(sum(ev.taxa_valor), 0) into v_credito
    from calendar_events ev
   where ev.rental_id = p_rental_id and ev.taxa_status = 'paga';

  select coalesce(sum(valor), 0), max(data) into v_pago_total, v_ultima_data
    from rental_payments where rental_id = p_rental_id;

  v_saldo := round(v_valor - v_credito - v_pago_total, 2);

  update rentals
     set pago = (v_saldo <= 0),
         pago_em = case when v_saldo <= 0 then v_ultima_data else null end
   where id = p_rental_id;
end;
$$;

comment on function public.recalcular_pagamento_locacao(uuid) is
  'Recalcula rentals.pago/pago_em a partir da soma de rental_payments menos o crédito de taxa de reserva já paga. Chamada pelo trigger de rental_payments e por qualquer função que mude o crédito de taxa (definir_taxa_agendamento, cancelar_agendamento, reativar_agendamento) — nunca de propósito exposta ao app, só uso interno.';

create or replace function public.trg_recalcular_pagamento_locacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalcular_pagamento_locacao(coalesce(new.rental_id, old.rental_id));
  return coalesce(new, old);
end;
$$;

create trigger rental_payments_recalcula
  after insert or update or delete on public.rental_payments
  for each row execute function public.trg_recalcular_pagamento_locacao();

-- ------------------------------------------------------------
-- SITUAÇÃO DE PAGAMENTO: view de leitura para a tela nova mostrar
-- aberto/parcial/pago e o saldo sem recalcular nada na mão.
-- ------------------------------------------------------------
create or replace view public.rentals_situacao_pagamento
with (security_invoker = true) as
select
  r.id as rental_id,
  r.calculated_value,
  coalesce((
    select sum(ev.taxa_valor) from calendar_events ev
     where ev.rental_id = r.id and ev.taxa_status = 'paga'
  ), 0) as credito_taxa,
  coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0) as total_pago,
  greatest(
    r.calculated_value
      - coalesce((select sum(ev.taxa_valor) from calendar_events ev where ev.rental_id = r.id and ev.taxa_status = 'paga'), 0)
      - coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0),
    0
  ) as saldo,
  case
    when coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0) = 0 then 'aberto'
    when r.pago then 'pago'
    else 'parcial'
  end as situacao
from rentals r;

comment on view public.rentals_situacao_pagamento is
  'Situação de pagamento de cada locação (aberto/parcial/pago) e o saldo, já descontando o crédito de taxa de reserva paga. security_invoker=true: mantém a RLS de rentals para quem consulta.';

grant select on public.rentals_situacao_pagamento to authenticated;

-- ------------------------------------------------------------
-- REGISTRAR / REMOVER / EDITAR pagamento (caminho novo, usado pela
-- calculadora da próxima leva; disponível desde já para quem quiser
-- chamar via SQL/admin enquanto a tela não chega).
-- ------------------------------------------------------------
create or replace function public.registrar_pagamento_locacao(
  p_rental_id uuid,
  p_forma payment_method_type,
  p_valor numeric,
  p_data date default current_date,
  p_pix_conta text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_client_name text;
  v_status event_status_type;
  v_categoria uuid;
  v_transacao_id uuid;
  v_payment_id uuid;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para registrar pagamentos.';
  end if;
  if p_valor <= 0 then
    raise exception 'O valor do pagamento precisa ser maior que zero.';
  end if;
  if p_forma = 'pix' and p_pix_conta is null then
    raise exception 'Informe em qual conta o PIX caiu.';
  end if;

  select r.client_id, r.status, c.name into v_client_id, v_status, v_client_name
    from rentals r
    left join clients c on c.id = r.client_id
   where r.id = p_rental_id;

  if v_client_id is null then
    raise exception 'Locação não encontrada.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Esta locação está cancelada. Reative o agendamento antes de registrar o pagamento.';
  end if;

  select id into v_categoria
    from categories
   where type = 'entrada' and is_default = true and name ilike 'Loca%'
   limit 1;

  insert into transactions (
    type, category_id, description, amount, payment_method, date, scope,
    client_id, rental_id, notes, created_by
  )
  values (
    'entrada', v_categoria,
    'Locação HIPRO - ' || coalesce(v_client_name, ''),
    p_valor, p_forma, p_data, 'harmonize', v_client_id, p_rental_id, p_notes, auth.uid()
  )
  returning id into v_transacao_id;

  insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, notes, created_by)
  values (p_rental_id, p_forma, p_valor, p_data, p_pix_conta, v_transacao_id, p_notes, auth.uid())
  returning id into v_payment_id;

  perform public.registrar_movimentacao(
    'pago', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object('valor_pago', round(p_valor, 2), 'forma', p_forma::text, 'pix_conta', p_pix_conta)
  );

  return v_payment_id;
end;
$$;

comment on function public.registrar_pagamento_locacao(uuid, payment_method_type, numeric, date, text, text) is
  'Registra UM pagamento de uma locação (parcial ou não). Chamar de novo para dividir entre formas ou completar um saldo em aberto — rentals.pago/pago_em se ajustam sozinhos pelo trigger de rental_payments.';

grant execute on function public.registrar_pagamento_locacao to authenticated;

create or replace function public.remover_pagamento_locacao(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_transaction_id uuid;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para alterar pagamentos.';
  end if;

  select rental_id, transaction_id into v_rental_id, v_transaction_id
    from rental_payments where id = p_payment_id;

  if v_rental_id is null then
    raise exception 'Pagamento não encontrado.';
  end if;

  -- rentals.transaction_id é só um atalho para o lançamento principal
  -- (usado pelo caminho de tela única, herdado de antes desta leva); se
  -- for justamente este pagamento, zera ANTES de apagar a transação —
  -- senão a FK rentals_transaction_id_fkey barra o delete (ela não tem
  -- on delete cascade, de propósito, para nunca apagar transação por
  -- engano só porque uma locação foi excluída por outro caminho).
  update rentals set transaction_id = null
   where id = v_rental_id and transaction_id = v_transaction_id;

  -- Apagar a transação já casca-deleta esta linha de rental_payments
  -- (transaction_id on delete cascade); o delete abaixo cobre o caso
  -- raro de um pagamento sem transaction_id.
  if v_transaction_id is not null then
    delete from transactions where id = v_transaction_id;
  end if;
  delete from rental_payments where id = p_payment_id;

  perform public.registrar_movimentacao(
    'pagamento_desfeito', 'rentals', v_rental_id,
    public.descrever_registro('rentals', v_rental_id),
    jsonb_build_object('pagamento_removido', p_payment_id)
  );
end;
$$;

grant execute on function public.remover_pagamento_locacao to authenticated;

-- Corrigir um pagamento já lançado (valor digitado errado, forma
-- trocada, conta PIX errada...), sempre com o antes/depois gravado no
-- histórico. A tela pede a senha antes de chamar isto (leva da
-- calculadora); aqui só garante a permissão de módulo e a auditoria.
create or replace function public.editar_pagamento_locacao(
  p_payment_id uuid,
  p_forma payment_method_type default null,
  p_valor numeric default null,
  p_data date default null,
  p_pix_conta text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rental_id uuid;
  v_transaction_id uuid;
  v_old jsonb;
  v_forma payment_method_type;
  v_valor numeric;
  v_data date;
  v_pix_conta text;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para editar pagamentos.';
  end if;

  select rental_id, transaction_id, forma, valor, data, pix_conta
    into v_rental_id, v_transaction_id, v_forma, v_valor, v_data, v_pix_conta
    from rental_payments where id = p_payment_id;

  if v_rental_id is null then
    raise exception 'Pagamento não encontrado.';
  end if;

  v_old := jsonb_build_object('forma', v_forma, 'valor', v_valor, 'data', v_data, 'pix_conta', v_pix_conta);

  v_forma := coalesce(p_forma, v_forma);
  v_valor := coalesce(p_valor, v_valor);
  v_data := coalesce(p_data, v_data);
  v_pix_conta := case when v_forma = 'pix' then coalesce(p_pix_conta, v_pix_conta) else null end;

  if v_valor <= 0 then
    raise exception 'O valor do pagamento precisa ser maior que zero.';
  end if;
  if v_forma = 'pix' and v_pix_conta is null then
    raise exception 'Informe em qual conta o PIX caiu.';
  end if;

  update rental_payments
     set forma = v_forma, valor = v_valor, data = v_data, pix_conta = v_pix_conta
   where id = p_payment_id;

  if v_transaction_id is not null then
    update transactions
       set amount = v_valor, payment_method = v_forma, date = v_data
     where id = v_transaction_id;
  end if;

  perform public.registrar_movimentacao(
    'editado', 'rentals', v_rental_id,
    public.descrever_registro('rentals', v_rental_id),
    jsonb_build_object(
      'acao_detalhada', 'pagamento corrigido',
      'pagamento_id', p_payment_id,
      'antes', v_old,
      'depois', jsonb_build_object('forma', v_forma, 'valor', v_valor, 'data', v_data, 'pix_conta', v_pix_conta)
    )
  );
end;
$$;

grant execute on function public.editar_pagamento_locacao to authenticated;

-- Correção genérica de QUALQUER outro lançamento (despesa, taxa,
-- lançamento avulso do Financeiro...) que não seja um pagamento de
-- locação — esses usam editar_pagamento_locacao acima, para o valor do
-- pagamento e o saldo da locação nunca desencontrarem.
create or replace function public.editar_transacao(
  p_transaction_id uuid,
  p_description text default null,
  p_amount numeric default null,
  p_payment_method payment_method_type default null,
  p_date date default null,
  p_category_id uuid default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope scope_type;
  v_created_by uuid;
  v_old jsonb;
begin
  select scope, created_by into v_scope, v_created_by from transactions where id = p_transaction_id;
  if v_scope is null then
    raise exception 'Lançamento não encontrado.';
  end if;

  if exists (select 1 from rental_payments where transaction_id = p_transaction_id) then
    raise exception 'Este lançamento é um pagamento de locação. Use a correção de pagamento, para o valor e o saldo da locação não desencontrarem.';
  end if;

  if v_scope = 'harmonize' and not has_module_permission('financeiro') then
    raise exception 'Sem permissão para editar lançamentos.';
  end if;
  if v_scope = 'pessoal' and v_created_by is distinct from auth.uid() then
    raise exception 'Sem permissão para editar este lançamento pessoal.';
  end if;
  if p_amount is not null and p_amount <= 0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;

  select to_jsonb(t) into v_old from transactions t where t.id = p_transaction_id;

  update transactions
     set description = coalesce(p_description, description),
         amount = coalesce(p_amount, amount),
         payment_method = coalesce(p_payment_method, payment_method),
         date = coalesce(p_date, date),
         category_id = coalesce(p_category_id, category_id),
         notes = coalesce(p_notes, notes)
   where id = p_transaction_id;

  perform public.registrar_movimentacao(
    'editado', 'transactions', p_transaction_id,
    public.descrever_registro('transactions', p_transaction_id),
    jsonb_build_object('antes', v_old)
  );
end;
$$;

grant execute on function public.editar_transacao to authenticated;

-- ------------------------------------------------------------
-- DESPESA LIGADA A UMA LOCAÇÃO (combustível, hospedagem, alimentação,
-- insumos daquele atendimento específico). É só um atalho: grava um
-- lançamento de saída comum, com rental_id preenchido, para
-- rentals_lucro (mais abaixo) conseguir somar.
-- ------------------------------------------------------------
create or replace function public.registrar_despesa_locacao(
  p_rental_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_payment_method payment_method_type,
  p_date date default current_date,
  p_description text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_transaction_id uuid;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para lançar despesas.';
  end if;
  if p_amount <= 0 then
    raise exception 'O valor da despesa precisa ser maior que zero.';
  end if;

  select client_id into v_client_id from rentals where id = p_rental_id;
  if v_client_id is null then
    raise exception 'Locação não encontrada.';
  end if;

  insert into transactions (
    type, category_id, description, amount, payment_method, date, scope,
    client_id, rental_id, notes, created_by
  )
  values (
    'saida', p_category_id, coalesce(nullif(trim(p_description), ''), 'Despesa da locação'),
    p_amount, p_payment_method, p_date, 'harmonize', v_client_id, p_rental_id, p_notes, auth.uid()
  )
  returning id into v_transaction_id;

  perform public.registrar_movimentacao(
    'criado', 'transactions', v_transaction_id,
    public.descrever_registro('transactions', v_transaction_id),
    jsonb_build_object('acao_detalhada', 'despesa ligada à locação', 'rental_id', p_rental_id)
  );

  return v_transaction_id;
end;
$$;

grant execute on function public.registrar_despesa_locacao to authenticated;

-- ------------------------------------------------------------
-- DESLOCAMENTO E CUSTO POR DISPARO NEGOCIADO: gravam só o que a tela já
-- calculou (ver nota no topo do arquivo).
-- ------------------------------------------------------------
create or replace function public.definir_deslocamento_locacao(
  p_rental_id uuid,
  p_km_ida numeric,
  p_valor_deslocamento numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar locações.';
  end if;
  if p_valor_deslocamento is not null and p_valor_deslocamento < 0 then
    raise exception 'O valor de deslocamento não pode ser negativo.';
  end if;

  update rentals
     set km_ida = p_km_ida,
         valor_deslocamento = coalesce(p_valor_deslocamento, 0)
   where id = p_rental_id;

  if not found then
    raise exception 'Locação não encontrada.';
  end if;

  perform public.registrar_movimentacao(
    'editado', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object('acao_detalhada', 'deslocamento definido', 'km_ida', p_km_ida, 'valor_deslocamento', p_valor_deslocamento)
  );
end;
$$;

grant execute on function public.definir_deslocamento_locacao to authenticated;

create or replace function public.definir_custo_disparo_manual_locacao(
  p_rental_id uuid,
  p_custo_disparo_manual numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar locações.';
  end if;
  if p_custo_disparo_manual is not null and p_custo_disparo_manual <= 0 then
    raise exception 'O custo por disparo precisa ser maior que zero.';
  end if;

  update rentals set custo_disparo_manual = p_custo_disparo_manual where id = p_rental_id;

  if not found then
    raise exception 'Locação não encontrada.';
  end if;

  perform public.registrar_movimentacao(
    'editado', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    jsonb_build_object('acao_detalhada', 'custo por disparo negociado definido', 'custo_disparo_manual', p_custo_disparo_manual)
  );
end;
$$;

grant execute on function public.definir_custo_disparo_manual_locacao to authenticated;

-- ------------------------------------------------------------
-- LUCRO POR LOCAÇÃO E POR CLIENTE: para a leva do Financeiro consumir
-- pronto, sem recalcular na tela.
-- ------------------------------------------------------------
create or replace view public.rentals_lucro
with (security_invoker = true) as
select
  r.id as rental_id,
  r.client_id,
  c.name as cliente,
  r.event_date,
  r.calculated_value,
  r.valor_deslocamento,
  coalesce((select sum(rp.valor) from rental_payments rp where rp.rental_id = r.id), 0) as total_pago,
  coalesce((select sum(t.amount) from transactions t where t.rental_id = r.id and t.type = 'saida'), 0) as total_despesas,
  r.calculated_value - coalesce((select sum(t.amount) from transactions t where t.rental_id = r.id and t.type = 'saida'), 0) as lucro_liquido
from rentals r
left join clients c on c.id = r.client_id
where r.status <> 'cancelada' and r.is_test = false;

comment on view public.rentals_lucro is
  'Lucro líquido por locação: valor cobrado menos as despesas (saídas) ligadas a ela via transactions.rental_id. Não desconta a taxa de reserva (já é abatida do valor a receber, não é despesa do atendimento). Ignora locação cancelada e teste.';

grant select on public.rentals_lucro to authenticated;

create or replace view public.clientes_lucro
with (security_invoker = true) as
select
  client_id,
  cliente,
  count(*) as locacoes,
  sum(calculated_value) as faturado,
  sum(total_pago) as recebido,
  sum(total_despesas) as despesas,
  sum(lucro_liquido) as lucro_liquido
from rentals_lucro
where client_id is not null
group by client_id, cliente;

comment on view public.clientes_lucro is
  'Resumo de lucro líquido por cliente, somando as locações não canceladas e não teste de rentals_lucro.';

grant select on public.clientes_lucro to authenticated;

-- ------------------------------------------------------------
-- COMPATIBILIDADE: marcar_locacao_paga / desfazer_pagamento_locacao
-- continuam com a MESMA assinatura e o MESMO comportamento visível
-- (marcam a locação inteira como paga de uma vez, com uma forma só),
-- porque a tela atual ainda chama exatamente isso. Por baixo, agora
-- também escrevem/apagam em rental_payments, para o histórico já
-- nascer no formato novo. Pagamento PIX feito por este caminho entra
-- com pix_conta = 'harmonize' (conta principal do negócio), já que a
-- tela atual não pergunta qual conta — a calculadora nova (próxima
-- leva) pergunta e passa a conta certa via registrar_pagamento_locacao.
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
  v_pix_conta text;
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
    raise exception 'Esta locação está cancelada. Reative o agendamento antes de registrar o pagamento, para o caixa não ficar com receita de algo cancelado.';
  end if;

  select coalesce(sum(ev.taxa_valor), 0) into v_credito
    from calendar_events ev
   where ev.rental_id = p_rental_id and ev.taxa_status = 'paga';

  v_valor_lancamento := greatest(v_valor - v_credito, 0);
  v_forma := coalesce(p_payment_method, v_forma);
  v_pix_conta := case when v_forma = 'pix' then 'harmonize' else null end;

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

  insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, created_by)
  values (p_rental_id, v_forma, v_valor_lancamento, coalesce(p_data, current_date), v_pix_conta, v_transacao_id, auth.uid());

  update rentals
     set payment_method = v_forma,
         transaction_id = v_transacao_id
   where id = p_rental_id;
  -- pago / pago_em: recalculados sozinhos pelo trigger de rental_payments.

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

create or replace function public.desfazer_pagamento_locacao(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago boolean;
begin
  if not has_module_permission('financeiro') then
    raise exception 'Sem permissão para alterar pagamentos.';
  end if;

  select pago into v_pago from rentals where id = p_rental_id;
  if v_pago is null then
    raise exception 'Locação não encontrada.';
  end if;
  if not v_pago then
    raise exception 'Esta locação não está marcada como paga.';
  end if;

  -- Desfaz TODOS os pagamentos desta locação (mesmo comportamento de
  -- sempre desta função). Para desfazer um pagamento específico dentre
  -- vários, usar remover_pagamento_locacao.
  --
  -- rentals.transaction_id precisa ser zerado ANTES de apagar as
  -- transações: ele referencia uma delas, e a FK rentals_transaction_id_fkey
  -- não tem on delete cascade (de propósito — só rental_payments tem,
  -- para nunca sumir uma transação por engano só por causa de outro
  -- caminho de exclusão). Zerar depois, como a primeira versão desta
  -- reescrita fazia, quebrava com "viola a restrição de chave estrangeira".
  update rentals set transaction_id = null where id = p_rental_id;

  delete from transactions
   where id in (select transaction_id from rental_payments where rental_id = p_rental_id and transaction_id is not null);
  delete from rental_payments where rental_id = p_rental_id;
  -- pago / pago_em voltam sozinhos a false/null: a soma zerou.

  perform public.registrar_movimentacao(
    'pagamento_desfeito', 'rentals', p_rental_id,
    public.descrever_registro('rentals', p_rental_id),
    '{}'::jsonb
  );
end;
$$;

-- ------------------------------------------------------------
-- CREATE_RENTAL / FINALIZE_RENTAL_RESERVATION: passam a registrar o
-- pagamento em rental_payments também (em vez de só criar a transação e
-- setar pago/pago_em na mão), com um parâmetro novo opcional
-- p_pix_conta no fim — quem já chama sem ele continua funcionando
-- exatamente igual (pix vai para a conta 'harmonize' por padrão).
-- ------------------------------------------------------------
create or replace function public.create_rental(
  p_client_id uuid,
  p_equipment_id uuid,
  p_event_date date,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_notes text default null,
  p_pago boolean default true,
  p_pix_conta text default null
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
  v_pix_conta text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para criar locações';
  end if;

  select code into v_equipment_code from equipments where id = p_equipment_id;
  select name, parceiro into v_client_name, v_parceiro from clients where id = p_client_id;
  select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Loca%' limit 1;

  if v_category_id is null then
    raise exception 'Categoria "Locação" não encontrada (foi renomeada ou removida?). Ajuste o cadastro de categorias antes de criar a locação.';
  end if;

  insert into rentals (client_id, equipment_id, event_date, shots, calculated_value, payment_method, notes, created_by)
  values (p_client_id, p_equipment_id, p_event_date, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by)
  returning id into v_rental_id;

  if p_pago then
    v_pix_conta := case when p_payment_method = 'pix' then coalesce(p_pix_conta, 'harmonize') else null end;

    insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
    values ('entrada', v_category_id, 'Locação HIPRO - ' || coalesce(v_client_name, ''), p_calculated_value, p_payment_method, p_event_date, 'harmonize', p_client_id, v_rental_id, v_created_by)
    returning id into v_transaction_id;

    insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, created_by)
    values (v_rental_id, p_payment_method, p_calculated_value, p_event_date, v_pix_conta, v_transaction_id, v_created_by);

    update rentals set transaction_id = v_transaction_id where id = v_rental_id;
    -- pago / pago_em: preenchidos automaticamente pelo trigger de rental_payments.
  end if;

  -- Taxa de compromisso inicial: pendente só quando há data futura a
  -- garantir e o cliente não é parceiro. definir_taxa_agendamento muda o
  -- estado depois.
  if coalesce(v_parceiro, false) or p_event_date <= current_date then
    v_taxa_status := 'nao_aplica';
    v_taxa_valor  := null;
  else
    v_taxa_status := 'pendente';
    v_taxa_valor  := public.valor_taxa_atual();
  end if;

  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, value, rental_id, created_by, taxa_status, taxa_valor)
  values (v_equipment_code::text::calendar_event_type, 'Locação - ' || coalesce(v_client_name, ''), p_client_id, p_equipment_id, p_event_date, p_event_date, 'confirmada', p_calculated_value, v_rental_id, v_created_by,
          v_taxa_status, v_taxa_valor);

  update clients set stage = 'cliente' where id = p_client_id and stage <> 'cliente';

  return v_rental_id;
end;
$$;

create or replace function public.finalize_rental_reservation(
  p_calendar_event_id uuid,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_notes text default null,
  p_pix_conta text default null
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
  v_client_id uuid;
  v_equipment_id uuid;
  v_event_date date;
  v_client_name text;
  v_is_mentoria boolean;
  v_created_by uuid := auth.uid();
  v_pix_conta text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para finalizar locações';
  end if;

  select client_id, equipment_id, date_start, is_mentoria
    into v_client_id, v_equipment_id, v_event_date, v_is_mentoria
  from calendar_events
  where id = p_calendar_event_id and rental_id is null and status = 'pre_reserva';

  if v_client_id is null then
    raise exception 'Reserva não encontrada, já finalizada, ou sem cliente vinculado.';
  end if;
  if v_equipment_id is null then
    raise exception 'Esta reserva não está vinculada a um equipamento HIPRO.';
  end if;

  select name into v_client_name from clients where id = v_client_id;

  if coalesce(v_is_mentoria, false) then
    select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Mentoria%' limit 1;
    if v_category_id is null then
      raise exception 'Categoria "Mentoria" não encontrada (foi renomeada ou removida?). Ajuste o cadastro de categorias antes de finalizar a mentoria.';
    end if;
  else
    select id into v_category_id from categories where type = 'entrada' and is_default = true and name ilike 'Loca%' limit 1;
    if v_category_id is null then
      raise exception 'Categoria "Locação" não encontrada (foi renomeada ou removida?). Ajuste o cadastro de categorias antes de finalizar a reserva.';
    end if;
  end if;

  insert into rentals (client_id, equipment_id, event_date, shots, calculated_value, payment_method, notes, created_by)
  values (v_client_id, v_equipment_id, v_event_date, p_shots, p_calculated_value, p_payment_method, p_notes, v_created_by)
  returning id into v_rental_id;

  insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, created_by)
  values (
    'entrada',
    v_category_id,
    (case when coalesce(v_is_mentoria, false) then 'Mentoria HIPRO - ' else 'Locação HIPRO - ' end) || coalesce(v_client_name, ''),
    p_calculated_value, p_payment_method, v_event_date, 'harmonize', v_client_id, v_rental_id, v_created_by
  )
  returning id into v_transaction_id;

  v_pix_conta := case when p_payment_method = 'pix' then coalesce(p_pix_conta, 'harmonize') else null end;

  insert into rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, created_by)
  values (v_rental_id, p_payment_method, p_calculated_value, v_event_date, v_pix_conta, v_transaction_id, v_created_by);

  update rentals set transaction_id = v_transaction_id where id = v_rental_id;
  -- pago / pago_em: preenchidos automaticamente pelo trigger de rental_payments
  -- (antes desta leva, esta função nunca marcava a locação como paga —
  -- ver nota no topo do arquivo).

  update calendar_events
  set status = 'confirmada',
      value = p_calculated_value,
      rental_id = v_rental_id,
      notes = coalesce(p_notes, notes)
  where id = p_calendar_event_id;

  update clients set stage = 'cliente' where id = v_client_id and stage <> 'cliente';

  return v_rental_id;
end;
$$;

-- ------------------------------------------------------------
-- TAXA DE COMPROMISSO: qualquer mudança no crédito de taxa (paga,
-- pendente, isenta, perdida, ou perdida voltando a paga na reativação)
-- agora também recalcula o pagamento da locação vinculada, para o saldo
-- nunca ficar desatualizado.
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
  v_rental_id uuid;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para alterar a taxa.';
  end if;

  if p_status not in ('nao_aplica', 'pendente', 'paga', 'perdida') then
    raise exception 'Estado de taxa inválido: %', p_status;
  end if;

  select ev.taxa_status, ev.taxa_transaction_id, ev.client_id, ev.date_start, c.name, ev.rental_id
    into v_status_atual, v_transacao_id, v_client_id, v_data, v_client_name, v_rental_id
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
    update calendar_events set taxa_transaction_id = null where id = p_event_id;
    delete from transactions where id = v_transacao_id;
    v_transacao_id := null;
  end if;

  update calendar_events
     set taxa_status = p_status,
         taxa_valor = case when p_status in ('paga', 'perdida', 'pendente') then v_valor else null end,
         taxa_transaction_id = v_transacao_id
   where id = p_event_id;

  if v_rental_id is not null then
    perform public.recalcular_pagamento_locacao(v_rental_id);
  end if;

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

  if v_taxa = 'paga' then
    update calendar_events set taxa_status = 'perdida' where id = p_event_id;
    perform public.registrar_movimentacao(
      'taxa_perdida', 'calendar_events', p_event_id, v_descricao,
      jsonb_build_object('motivo', 'agendamento cancelado após a taxa ter sido paga')
    );
  end if;

  if v_rental_id is not null then
    perform public.recalcular_pagamento_locacao(v_rental_id);
  end if;

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

  if v_taxa = 'perdida' and v_taxa_transacao is not null then
    update calendar_events set taxa_status = 'paga' where id = p_event_id;
    perform public.registrar_movimentacao(
      'taxa_paga', 'calendar_events', p_event_id,
      public.descrever_registro('calendar_events', p_event_id),
      jsonb_build_object('motivo', 'agendamento reativado; a taxa paga volta a valer como crédito')
    );
  end if;

  if v_rental_id is not null then
    perform public.recalcular_pagamento_locacao(v_rental_id);
  end if;

  perform public.registrar_movimentacao(
    'editado', 'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    jsonb_build_object('acao_detalhada', 'agendamento reativado', 'status_restaurado', v_status_anterior)
  );
end;
$$;

-- ------------------------------------------------------------
-- MODO TESTE: rental_payments entra no cálculo por cliente. Não precisa
-- entrar em purge_test_data: os dois "on delete cascade" novos
-- (rental_payments.rental_id e rental_payments.transaction_id) já
-- limpam sozinhos quando a locação ou a transação de teste é apagada.
-- ------------------------------------------------------------
create or replace function public.set_client_test_flag_cascade(
  p_client_id uuid,
  p_is_test boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transactions int;
  v_rentals int;
  v_events int;
  v_tasks int;
  v_mentoring int;
  v_rental_payments int;
begin
  perform public.require_admin();

  update public.clients set is_test = p_is_test where id = p_client_id;

  with u as (update public.transactions set is_test = p_is_test where client_id = p_client_id returning 1)
    select count(*) into v_transactions from u;
  with u as (update public.rentals set is_test = p_is_test where client_id = p_client_id returning 1)
    select count(*) into v_rentals from u;
  with u as (update public.calendar_events set is_test = p_is_test where client_id = p_client_id returning 1)
    select count(*) into v_events from u;
  with u as (update public.tasks set is_test = p_is_test where client_id = p_client_id returning 1)
    select count(*) into v_tasks from u;
  with u as (
    update public.rental_payments set is_test = p_is_test
    where rental_id in (select id from public.rentals where client_id = p_client_id)
    returning 1
  )
    select count(*) into v_rental_payments from u;

  -- Mentorias não têm client_id: chegam pelo evento de agenda do cliente.
  with u as (
    update public.mentoring_events m set is_test = p_is_test
    where exists (
      select 1 from public.calendar_events e
      where e.id = m.calendar_event_id and e.client_id = p_client_id
    )
    returning 1
  )
  select count(*) into v_mentoring from u;

  return jsonb_build_object(
    'transactions',     v_transactions,
    'rentals',          v_rentals,
    'calendar_events',  v_events,
    'tasks',            v_tasks,
    'mentoring_events', v_mentoring,
    'rental_payments',  v_rental_payments
  );
end;
$$;

create or replace function public.count_test_data()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'clients',          (select count(*) from public.clients          where is_test),
    'transactions',     (select count(*) from public.transactions     where is_test),
    'rentals',          (select count(*) from public.rentals          where is_test),
    'calendar_events',  (select count(*) from public.calendar_events  where is_test),
    'mentoring_events', (select count(*) from public.mentoring_events where is_test),
    'tasks',            (select count(*) from public.tasks            where is_test),
    'rental_payments',  (select count(*) from public.rental_payments  where is_test)
  );
$$;

-- ------------------------------------------------------------
-- BACKFILL: cada locação já marcada como paga (rentals.pago = true)
-- ganha uma linha equivalente em rental_payments, para o histórico não
-- ficar em branco. O PIX histórico entra com pix_conta = 'harmonize'
-- por não haver registro de qual conta recebeu antes desta leva
-- existir — corrigível depois via editar_pagamento_locacao, com senha,
-- se algum caso específico for identificado.
-- ------------------------------------------------------------
insert into public.rental_payments (rental_id, forma, valor, data, pix_conta, transaction_id, created_by, created_at, is_test)
select
  r.id,
  r.payment_method,
  coalesce(t.amount, r.calculated_value),
  coalesce(r.pago_em, r.event_date),
  case when r.payment_method = 'pix' then 'harmonize' else null end,
  r.transaction_id,
  r.created_by,
  coalesce(r.pago_em::timestamptz, r.created_at),
  r.is_test
from public.rentals r
left join public.transactions t on t.id = r.transaction_id
where r.pago = true
  and not exists (select 1 from public.rental_payments rp where rp.rental_id = r.id);

-- ------------------------------------------------------------
-- ÍNDICE DE PERFORMANCE: rental_id em transactions passa a ser
-- consultado o tempo todo agora (pagamentos, despesas, rentals_lucro).
-- ------------------------------------------------------------
create index if not exists transactions_rental_id_idx on public.transactions(rental_id);

-- ------------------------------------------------------------
-- BIOMETRIA (passkey/WebAuthn): só a tabela de chaves por aparelho.
-- A verificação da assinatura na hora de liberar uma edição é lógica de
-- backend Next.js, e entra na leva da tela de edição — aqui é só onde
-- a chave pública de cada aparelho cadastrado fica guardada.
-- ------------------------------------------------------------
create table public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

comment on table public.webauthn_credentials is
  'Chaves de biometria (passkey/WebAuthn) cadastradas por aparelho, para liberar a edição de lançamentos sem digitar senha. Guarda só a chave pública de cada aparelho — nunca a biometria em si, que nunca sai do celular.';

create index webauthn_credentials_user_id_idx on public.webauthn_credentials(user_id);

alter table public.webauthn_credentials enable row level security;

create policy "webauthn_credentials_self" on webauthn_credentials for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
