-- ============================================================
-- LEVA F: separar "pedir confirmação" de "confirmar", e separar
-- "etapa do funil" de "é cliente" — CORREÇÃO DE FLUXO DE
-- CONFIRMAÇÃO DE RESERVAS + CORREÇÃO DO FUNIL LEAD/CLIENTE
--
-- Duas correções pedidas juntas porque as duas são a mesma família de
-- bug: alguém apertou um botão de um significado e o sistema aplicou
-- outro significado junto, sem avisar. Aqui:
--
--   1) "Pedir confirmação no WhatsApp" e "Confirmar reserva" viram
--      duas ações independentes (hoje uma só fazia as duas coisas:
--      confirmava a reserva E abria o WhatsApp).
--   2) A etapa do funil (onde o contato está negociando agora) e o
--      tipo do contato (Lead ou Cliente, uma vez convertido) viram
--      dois campos independentes (hoje "é cliente" era calculado só
--      olhando a etapa atual, e mover um Cliente de volta para
--      "Agendamento" numa segunda venda desfazia a conversão).
--
-- Nenhuma tabela nova, nenhuma etapa do funil criada/removida/
-- renomeada — só colunas novas e um gatilho, em cima do que já existe.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Novos campos de cadastro do cliente: Tratamento e Nome de
-- exibição. Existem porque hoje o campo "name" às vezes vem com tudo
-- misturado (ex: "DRA. CAMILA LIMA - RAIO E GABRIEL - HIPRO"), e não
-- dá para montar uma saudação decente a partir disso. São opcionais
-- de propósito: cadastro antigo não tem, e a mensagem trata esse caso
-- (ver a função build ficar no frontend, que monta o fallback "Olá!").
-- ------------------------------------------------------------
alter table public.clients add column if not exists treatment text;

alter table public.clients drop constraint if exists clients_treatment_check;
alter table public.clients add constraint clients_treatment_check
  check (treatment is null or treatment in ('Dr.', 'Dra.'));

alter table public.clients add column if not exists display_name text;

comment on column public.clients.treatment is
  'Dr./Dra., usado nas mensagens ao cliente. Nulo = cadastro incompleto para fins de mensagem.';
comment on column public.clients.display_name is
  'Nome curto para comunicação (ex: "Camila Lima"), separado do campo name que pode vir com informação misturada. Nulo = cadastro incompleto para fins de mensagem.';

-- ------------------------------------------------------------
-- 2) Registro de envio do "pedir confirmação", por reserva
--
-- Fica no agendamento (calendar_events), não no cliente: o pedido é
-- "mandei essa mensagem para essa data marcada", e um cliente pode ter
-- várias reservas em paralelo, cada uma com seu próprio envio (ou
-- nenhum). Guardar isso no cliente misturaria o "sem disparos ainda"
-- de uma reserva com o "mensagem enviada" de outra.
-- ------------------------------------------------------------
alter table public.calendar_events
  add column if not exists confirmation_message_sent_at timestamptz;

comment on column public.calendar_events.confirmation_message_sent_at is
  'Quando "Pedir confirmação no WhatsApp" foi clicado para ESTA reserva. Nunca é setado por "Confirmar reserva", e nunca muda calendar_events.confirmed.';

-- ------------------------------------------------------------
-- 3) is_client: o "tipo" do contato, independente da etapa
--
-- clients.stage guarda ONDE o contato está negociando agora
-- ('lead'..'cliente'). Até esta leva, "é cliente?" era calculado só
-- perguntando `stage = 'cliente'` em quatro telas diferentes — e
-- por isso mover um Cliente de volta para "Agendamento" (uma segunda
-- locação, por exemplo) fazia o sistema esquecer que ele já foi
-- convertido. is_client guarda o fato "esse contato já converteu
-- alguma vez", separado de "onde ele está agora".
--
-- default false porque o INSERT de um lead novo (funil) não deve
-- nascer como cliente; quem cadastra direto em "Clientes" já entra
-- com stage='cliente' (default da tabela) e o gatilho abaixo marca
-- is_client=true no mesmo INSERT.
-- ------------------------------------------------------------
alter table public.clients add column if not exists is_client boolean not null default false;

comment on column public.clients.is_client is
  'Uma vez cliente, sempre cliente: true assim que stage chega a "cliente" e nunca mais volta para false sozinho quando a etapa muda. Só uma ação dedicada de "reverter para lead" (se existir) pode desligar isso, atualizando esta coluna sem mexer em stage.';

-- Backfill: quem já está em 'cliente' hoje, e quem já teve alguma
-- locação contabilizável no passado (mesma regra que a tela de
-- Clientes já usa via "jaAlugou", para não perder ninguém que só não
-- está mais com stage='cliente' porque foi mexido no funil antes desta
-- correção existir).
update public.clients c
set is_client = true
where is_client = false
  and (
    c.stage = 'cliente'
    or exists (
      select 1 from public.rentals_contabilizaveis r where r.client_id = c.id
    )
  );

-- ------------------------------------------------------------
-- 4) Gatilho: converter para Cliente é uma via de mão única a partir
-- daqui. Fica no banco (e não em cada tela que grava stage) porque
-- hoje já são pelo menos três caminhos de código diferentes que
-- gravam clients.stage (arrastar card no funil, o seletor de etapa
-- na ficha do lead, e o cadastro rápido do ClientPicker) — corrigir
-- só um deles deixaria os outros dois com o mesmo bug.
-- ------------------------------------------------------------
create or replace function public.marcar_is_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage = 'cliente' then
    new.is_client := true;
  elsif tg_op = 'UPDATE' then
    -- A etapa mudou para algo diferente de 'cliente', mas se este
    -- contato já era cliente, continua sendo: mover no funil não
    -- desfaz uma conversão. (Um INSERT novo com stage != 'cliente'
    -- cai aqui fora, e is_client fica com o default/valor informado,
    -- que é false para um lead nascendo agora.)
    new.is_client := old.is_client;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_marcar_is_client on public.clients;
create trigger trg_clients_marcar_is_client
  before insert or update of stage on public.clients
  for each row execute function public.marcar_is_client();

-- ------------------------------------------------------------
-- 5) Nova ação no histórico, para o "pedir confirmação" ficar
-- registrado como qualquer outra mudança de estado do agendamento.
-- ------------------------------------------------------------
-- A lista abaixo é a definição real de produção (conferida via
-- pg_get_constraintdef antes de escrever esta versão, depois que a
-- primeira tentativa falhou por eu ter chutado o conjunto de valores
-- em vez de checar) mais o único valor novo desta leva,
-- 'pedido_confirmacao_enviado'. Nenhum valor em uso foi removido.
alter table public.movimentacoes drop constraint if exists movimentacoes_acao_check;
alter table public.movimentacoes add constraint movimentacoes_acao_check
  check (acao in (
    'criado', 'editado', 'confirmado', 'desconfirmado',
    'reagendado', 'cancelado', 'excluido',
    'realizado', 'realizacao_desfeita',
    'pago', 'pagamento_desfeito',
    'taxa_paga', 'taxa_perdida', 'taxa_isenta',
    'taxa_pendente',
    'pedido_confirmacao_enviado'
  ));

-- ------------------------------------------------------------
-- 6) RPC: registra que "Pedir confirmação no WhatsApp" foi clicado
-- para esta reserva. Só grava o timestamp e o histórico — nunca toca
-- em calendar_events.confirmed. É a contraparte de
-- confirmar_agendamento (já existente, leva C1), que faz o oposto:
-- só confirma, nunca mexe neste timestamp nem abre WhatsApp (isso é
-- 100% frontend, depois de chamar esta função).
-- ------------------------------------------------------------
create or replace function public.registrar_pedido_confirmacao(p_event_id uuid)
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
    raise exception 'Este agendamento está cancelado.';
  end if;

  update calendar_events set confirmation_message_sent_at = now() where id = p_event_id;

  perform public.registrar_movimentacao(
    'pedido_confirmacao_enviado',
    'calendar_events', p_event_id,
    public.descrever_registro('calendar_events', p_event_id),
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.registrar_pedido_confirmacao to authenticated;
