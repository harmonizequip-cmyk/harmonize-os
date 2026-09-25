-- ============================================================
-- LEVA F — testes de regressão de banco (RPCs + gatilho is_client)
--
-- Não é pgTAP (não está instalado no harness local) — é uma sequência
-- de blocos DO com RAISE EXCEPTION quando uma expectativa falha, então
-- basta rodar com psql -v ON_ERROR_STOP=1 -f para o script parar no
-- primeiro problema em vez de seguir e esconder o erro real:
--
--   psql -h /tmp -p 5433 -U postgres -d teste -v ON_ERROR_STOP=1 \
--     -f tests/leva-f-regressao.sql
--
-- Roda como superusuário de propósito (sem "set role authenticated"):
-- as RPCs abaixo são security definer e fazem a própria checagem de
-- permissão via has_module_permission(), que só depende de
-- current_setting('test.uid') através de auth.uid() — não do role da
-- conexão. Então não precisam de RLS simulada para serem testadas.
--
-- Cobre os itens 1, 2, 3, 5, 6, 7, 8, 9, 11, 12 da lista obrigatória da
-- seção 26 do pedido (os itens 4 e 10 são de mensagem/UI e estão em
-- lib/confirmacao.test.ts, via `npm test`). Assume o schema completo já
-- aplicado (schema.sql + migrations/, incluindo esta leva).
-- ============================================================

begin;

-- Limpa qualquer rastro de execuções anteriores, para o script poder
-- rodar de novo sem falso positivo/negativo por dado velho.
delete from movimentacoes where entidade_id in (
  select id from calendar_events where title like 'TESTE_REGR_%'
);
delete from calendar_events where title like 'TESTE_REGR_%';
delete from clients where name like 'TESTE_REGR_%';

set local test.uid = '11111111-1111-1111-1111-111111111111';

-- ------------------------------------------------------------
-- BLOCO 1 — is_client sobrevive a qualquer movimentação de etapa
-- (itens 6, 7, 8 da seção 26; Testes 9-15 da seção 21)
-- ------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_is_client boolean;
  v_stage text;
  v_count integer;
begin
  insert into clients (name, stage) values ('TESTE_REGR_Funil', 'lead') returning id into v_id;

  update clients set stage = 'contato' where id = v_id;
  update clients set stage = 'nutricao' where id = v_id;
  update clients set stage = 'qualificado' where id = v_id;
  update clients set stage = 'agendado' where id = v_id;

  select is_client into v_is_client from clients where id = v_id;
  if v_is_client is distinct from false then
    raise exception 'FALHOU: lead ainda não convertido deveria ter is_client=false, veio %', v_is_client;
  end if;

  update clients set stage = 'cliente' where id = v_id;
  select is_client into v_is_client from clients where id = v_id;
  if v_is_client is distinct from true then
    raise exception 'FALHOU: is_client deveria virar true ao chegar em stage=cliente';
  end if;

  -- O TESTE PRINCIPAL (seção 21, Teste 15): volta pra "Agendamento"
  -- (segunda locação) e não pode deixar de ser cliente.
  update clients set stage = 'agendado' where id = v_id;
  select stage, is_client into v_stage, v_is_client from clients where id = v_id;
  if v_stage is distinct from 'agendado' or v_is_client is distinct from true then
    raise exception 'FALHOU: Cliente movido para Agendamento deveria continuar com is_client=true (veio stage=%, is_client=%)', v_stage, v_is_client;
  end if;

  -- Rebobina até "Novo contato": ainda assim continua cliente.
  update clients set stage = 'lead' where id = v_id;
  select is_client into v_is_client from clients where id = v_id;
  if v_is_client is distinct from true then
    raise exception 'FALHOU: is_client não pode voltar a false só por mover a etapa, mesmo até "lead"';
  end if;

  -- Teste de não duplicação (seção 22): continua sendo a mesma linha.
  select count(*) into v_count from clients where name = 'TESTE_REGR_Funil';
  if v_count <> 1 then
    raise exception 'FALHOU: esperava exatamente 1 registro para TESTE_REGR_Funil, achou %', v_count;
  end if;

  raise notice 'OK: BLOCO 1 (is_client sobrevive a mudança de etapa, sem duplicar)';
end $$;

-- ------------------------------------------------------------
-- BLOCO 2 — cadastro direto como cliente (ClientPicker/NovoClienteModal)
-- ------------------------------------------------------------
do $$
declare
  v_is_client boolean;
begin
  insert into clients (name, stage, is_client) values ('TESTE_REGR_Direto', 'cliente', true);
  select is_client into v_is_client from clients where name = 'TESTE_REGR_Direto';
  if v_is_client is distinct from true then
    raise exception 'FALHOU: cadastro direto como cliente deveria manter is_client=true';
  end if;
  raise notice 'OK: BLOCO 2 (cadastro direto como cliente)';
end $$;

-- ------------------------------------------------------------
-- BLOCO 3 — "Pedir confirmação" e "Confirmar reserva" são
-- independentes (itens 1, 2, 5 da seção 26; Testes 1-3 da seção 19.1)
-- ------------------------------------------------------------
do $$
declare
  v_client_id uuid;
  v_event_id uuid;
  v_confirmed boolean;
  v_sent_at timestamptz;
  v_confirmed2 boolean;
  v_sent_at2 timestamptz;
begin
  insert into clients (name, stage, whatsapp) values ('TESTE_REGR_Bloco3', 'cliente', '83999990001') returning id into v_client_id;
  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, confirmed)
  select 'hipro_1', 'TESTE_REGR_Evento3', v_client_id, e.id, current_date + 3, current_date + 3, 'pre_reserva', false
  from equipments e where e.code = 'hipro_1'
  returning id into v_event_id;

  -- "Pedir confirmação" não pode confirmar.
  perform public.registrar_pedido_confirmacao(v_event_id);
  select confirmed, confirmation_message_sent_at into v_confirmed, v_sent_at from calendar_events where id = v_event_id;
  if v_confirmed is distinct from false then
    raise exception 'FALHOU: registrar_pedido_confirmacao não pode alterar confirmed';
  end if;
  if v_sent_at is null then
    raise exception 'FALHOU: registrar_pedido_confirmacao deveria ter gravado confirmation_message_sent_at';
  end if;

  -- "Confirmar reserva" não pode mexer no registro de envio.
  perform public.confirmar_agendamento(v_event_id, true);
  select confirmed, confirmation_message_sent_at into v_confirmed2, v_sent_at2 from calendar_events where id = v_event_id;
  if v_confirmed2 is distinct from true then
    raise exception 'FALHOU: confirmar_agendamento deveria ter marcado confirmed=true';
  end if;
  if v_sent_at2 is distinct from v_sent_at then
    raise exception 'FALHOU: confirmar_agendamento não pode alterar confirmation_message_sent_at';
  end if;

  -- Histórico com as duas ações, na reserva certa.
  if (select count(*) from movimentacoes where entidade_id = v_event_id and acao = 'pedido_confirmacao_enviado') <> 1 then
    raise exception 'FALHOU: esperava 1 registro de pedido_confirmacao_enviado no histórico';
  end if;
  if (select count(*) from movimentacoes where entidade_id = v_event_id and acao = 'confirmado') <> 1 then
    raise exception 'FALHOU: esperava 1 registro de confirmado no histórico';
  end if;

  raise notice 'OK: BLOCO 3 (pedir confirmação e confirmar são independentes, e ficam no histórico)';
end $$;

-- ------------------------------------------------------------
-- BLOCO 4 — isolamento entre reservas (Teste 4 da seção 19.1): três
-- reservas de clientes diferentes, ações intercaladas, e cada ação só
-- pode ter efeito na reserva do seu próprio ID.
-- ------------------------------------------------------------
do $$
declare
  v_a_client uuid; v_b_client uuid; v_c_client uuid;
  v_a uuid; v_b uuid; v_c uuid;
  v_confirmed boolean;
  v_sent_at timestamptz;
  v_client_id uuid;
  v_date date;
begin
  insert into clients (name, stage, whatsapp) values ('TESTE_REGR_ClienteA', 'cliente', '83999990010') returning id into v_a_client;
  insert into clients (name, stage, whatsapp) values ('TESTE_REGR_ClienteB', 'cliente', '83999990020') returning id into v_b_client;
  insert into clients (name, stage, whatsapp) values ('TESTE_REGR_ClienteC', 'cliente', '83999990030') returning id into v_c_client;

  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, confirmed)
  select 'hipro_1', 'TESTE_REGR_ReservaA', v_a_client, e.id, current_date + 900, current_date + 900, 'pre_reserva', false
  from equipments e where e.code = 'hipro_1' returning id into v_a;

  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, confirmed)
  select 'hipro_2', 'TESTE_REGR_ReservaB', v_b_client, e.id, current_date + 901, current_date + 901, 'pre_reserva', false
  from equipments e where e.code = 'hipro_2' returning id into v_b;

  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, confirmed)
  select 'hipro_1', 'TESTE_REGR_ReservaC', v_c_client, e.id, current_date + 902, current_date + 902, 'pre_reserva', false
  from equipments e where e.code = 'hipro_1' returning id into v_c;
  -- (C fica no mesmo equipamento que A, dias diferentes — sem conflito
  -- de overbooking, e serve para garantir que emparelhar pelo
  -- equipamento por engano também não aconteceria.)

  -- Sequência exata do pedido: pedir A, pedir B, confirmar C, pedir A
  -- de novo, confirmar B.
  perform public.registrar_pedido_confirmacao(v_a);
  perform public.registrar_pedido_confirmacao(v_b);
  perform public.confirmar_agendamento(v_c, true);
  perform public.registrar_pedido_confirmacao(v_a);
  perform public.confirmar_agendamento(v_b, true);

  -- A: pedido enviado duas vezes (tem timestamp), continua NÃO confirmada.
  select confirmed, confirmation_message_sent_at into v_confirmed, v_sent_at from calendar_events where id = v_a;
  if v_confirmed is distinct from false then
    raise exception 'FALHOU: Reserva A não deveria ter sido confirmada';
  end if;
  if v_sent_at is null then
    raise exception 'FALHOU: Reserva A deveria ter confirmation_message_sent_at preenchido';
  end if;
  if (select count(*) from movimentacoes where entidade_id = v_a and acao = 'pedido_confirmacao_enviado') <> 2 then
    raise exception 'FALHOU: Reserva A deveria ter 2 pedidos de confirmação no histórico';
  end if;

  -- B: confirmada, e com pedido de confirmação registrado (mandado antes).
  select confirmed, confirmation_message_sent_at into v_confirmed, v_sent_at from calendar_events where id = v_b;
  if v_confirmed is distinct from true then
    raise exception 'FALHOU: Reserva B deveria estar confirmada';
  end if;
  if v_sent_at is null then
    raise exception 'FALHOU: Reserva B deveria ter confirmation_message_sent_at preenchido (foi pedido antes de confirmar)';
  end if;

  -- C: confirmada diretamente, SEM nunca ter recebido pedido de confirmação.
  select confirmed, confirmation_message_sent_at into v_confirmed, v_sent_at from calendar_events where id = v_c;
  if v_confirmed is distinct from true then
    raise exception 'FALHOU: Reserva C deveria estar confirmada';
  end if;
  if v_sent_at is not null then
    raise exception 'FALHOU: Reserva C nunca pediu confirmação — confirmation_message_sent_at deveria continuar nulo';
  end if;

  -- Cada evento continua com o client_id e a data originais — nenhuma
  -- operação vazou dado de uma reserva para outra.
  select client_id, date_start into v_client_id, v_date from calendar_events where id = v_a;
  if v_client_id <> v_a_client or v_date <> current_date + 900 then
    raise exception 'FALHOU: Reserva A trocou de cliente ou de data';
  end if;

  select client_id, date_start into v_client_id, v_date from calendar_events where id = v_b;
  if v_client_id <> v_b_client or v_date <> current_date + 901 then
    raise exception 'FALHOU: Reserva B trocou de cliente ou de data';
  end if;

  select client_id, date_start into v_client_id, v_date from calendar_events where id = v_c;
  if v_client_id <> v_c_client or v_date <> current_date + 902 then
    raise exception 'FALHOU: Reserva C trocou de cliente ou de data';
  end if;

  raise notice 'OK: BLOCO 4 (isolamento entre reservas A/B/C, sem vazamento de dado entre elas)';
end $$;

-- ------------------------------------------------------------
-- BLOCO 5 — teste integrado da seção 24: lead → funil → cliente →
-- reserva → confirmação → muda de etapa → re-verificação.
-- ------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_event_id uuid;
  v_count integer;
  v_is_client boolean;
  v_client_id uuid;
  v_confirmed boolean;
begin
  -- 1) Cria um Lead.
  insert into clients (name, stage, whatsapp) values ('TESTE_REGR_Integrado', 'lead', '83999990099') returning id into v_id;

  -- 2) Avança pelo funil.
  update clients set stage = 'contato' where id = v_id;
  update clients set stage = 'nutricao' where id = v_id;
  update clients set stage = 'qualificado' where id = v_id;
  update clients set stage = 'agendado' where id = v_id;

  -- 3) Converte em Cliente.
  update clients set stage = 'cliente' where id = v_id;

  -- 4) Cria uma reserva para esse contato.
  insert into calendar_events (event_type, title, client_id, equipment_id, date_start, date_end, status, confirmed)
  select 'hipro_2', 'TESTE_REGR_IntegradoEvento', v_id, e.id, current_date + 903, current_date + 903, 'pre_reserva', false
  from equipments e where e.code = 'hipro_2'
  returning id into v_event_id;

  -- 5) (a reserva aparece na lista de confirmação é responsabilidade do
  -- frontend — needsConfirmation filtra !confirmed nos próximos 7 dias;
  -- aqui garantimos que o dado que alimenta esse filtro está correto.)

  -- 6) Pede confirmação pelo WhatsApp.
  perform public.registrar_pedido_confirmacao(v_event_id);

  -- 7) Confirma que os dados estão corretos.
  select client_id into v_client_id from calendar_events where id = v_event_id;
  if v_client_id <> v_id then
    raise exception 'FALHOU: reserva do teste integrado não está vinculada ao cliente certo';
  end if;

  -- 8) Altera a etapa do contato no funil (nova venda futura).
  update clients set stage = 'agendado' where id = v_id;

  -- 9) Volta para a reserva / 10) Pede confirmação novamente.
  perform public.registrar_pedido_confirmacao(v_event_id);

  -- 11) Confirma que a reserva continua vinculada ao mesmo cliente.
  select client_id into v_client_id from calendar_events where id = v_event_id;
  if v_client_id <> v_id then
    raise exception 'FALHOU: mudar a etapa do funil desvinculou a reserva do cliente';
  end if;
  select count(*) into v_count from clients where id = v_id;
  if v_count <> 1 then
    raise exception 'FALHOU: mudar a etapa do funil deveria continuar sendo o mesmo registro de cliente';
  end if;
  select is_client into v_is_client from clients where id = v_id;
  if v_is_client is distinct from true then
    raise exception 'FALHOU: cliente não pode voltar a ser Lead só por mudar de etapa (teste integrado)';
  end if;

  -- 12) Confirma a reserva manualmente.
  perform public.confirmar_agendamento(v_event_id, true);
  select confirmed into v_confirmed from calendar_events where id = v_event_id;
  if v_confirmed is distinct from true then
    raise exception 'FALHOU: confirmar_agendamento não confirmou a reserva do teste integrado';
  end if;

  -- Resultado esperado: nada foi alterado, perdido, duplicado ou
  -- desvinculado por causa da mudança de etapa.
  if (select whatsapp from clients where id = v_id) <> '83999990099' then
    raise exception 'FALHOU: telefone do cliente foi perdido no teste integrado';
  end if;
  if (select count(*) from calendar_events where client_id = v_id) <> 1 then
    raise exception 'FALHOU: deveria continuar existindo exatamente 1 reserva para este cliente';
  end if;

  raise notice 'OK: BLOCO 5 (teste integrado: lead -> funil -> cliente -> reserva -> confirmação -> troca de etapa -> reverificação)';
end $$;

rollback;

-- rollback de propósito: este script só verifica comportamento, não
-- deve deixar dado de teste no banco (n
