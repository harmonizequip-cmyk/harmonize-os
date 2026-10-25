-- Campanhas registram anotação na cliente (26/10/2026)
-- Pedido do dono: tudo o que acontece numa campanha fica no histórico da
-- cliente, como anotação (tabela cliente_anotacoes, a mesma do painel
-- "Anotações" e que o assistente lê pelo dossiê).
--   1. cliente_anotacoes aceita a origem 'campanha' (as linhas existentes
--      continuam válidas: só se acrescenta um valor ao check).
--   2. registrar_envio_campanha grava a anotação, na mesma transação, quando o
--      status MUDA para enviado, respondeu, agendou ou nao_quer. Gravar de novo
--      o mesmo status não duplica; 'pulado' não gera anotação (não houve
--      contato).
--   3. desfazer_envio_campanha grava "envio desfeito (voltou para a fila)"
--      quando o envio apagado tinha contato (status diferente de pulado ou com
--      hora de envio), para o histórico não ficar enganoso.
--   Textos (dia e hora no fuso de Brasília; até 2.000 caracteres, cortando a
--   mensagem com "…" e mantendo o começo):
--     Campanha «<nome>»: mensagem enviada em dd/mm/aaaa às hh:mm (horário de Brasília). Texto enviado: <mensagem>
--     Campanha «<nome>»: respondeu.
--     Campanha «<nome>»: agendou.
--     Campanha «<nome>»: pediu para não receber campanhas.
--     Campanha «<nome>»: envio desfeito (voltou para a fila).
--   salvar_anotacao_cliente continua aceitando só digitada, voz e assistente:
--   a origem 'campanha' só nasce destas funções.
-- Aditivo: não apaga nem altera dados existentes. Pode rodar mais de uma vez.

alter table public.cliente_anotacoes drop constraint if exists cliente_anotacoes_origem_check;
alter table public.cliente_anotacoes add constraint cliente_anotacoes_origem_check
  check (origem in ('digitada', 'voz', 'assistente', 'campanha'));

-- Cria ou atualiza o envio de uma cliente numa campanha. 'enviado' grava a
-- hora do envio (a primeira) e o texto exato; os outros status mantêm a hora.
-- Campanha arquivada não recebe envio novo (só muda o que já existe).
-- Cada mudança de status (menos 'pulado') vira anotação da cliente.
create or replace function public.registrar_envio_campanha(
  p_campanha uuid,
  p_client uuid,
  p_status text,
  p_mensagem text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_msg text := nullif(btrim(coalesce(p_mensagem, '')), '');
  v_c campanhas%rowtype;
  v_cliente text;
  v_antes campanha_envios%rowtype;
  v_id uuid;
  v_rotulo text;
  v_enviado_em timestamptz;
  v_texto_enviado text;
  v_anotacao text;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para registrar envios de campanha.';
  end if;
  if v_status not in ('enviado', 'respondeu', 'agendou', 'nao_quer', 'pulado') then
    raise exception 'Situação inválida.';
  end if;
  if v_msg is not null and length(v_msg) > 4000 then
    raise exception 'Mensagem longa demais.';
  end if;
  select * into v_c from campanhas where id = p_campanha;
  if not found then
    raise exception 'Campanha não encontrada.';
  end if;
  select name into v_cliente from clients where id = p_client;
  if v_cliente is null then
    raise exception 'Cliente não encontrada.';
  end if;
  if v_status = 'enviado' and v_msg is null then
    raise exception 'Mensagem vazia.';
  end if;

  v_rotulo := case v_status
    when 'enviado' then 'enviada para '
    when 'respondeu' then 'respondida por '
    when 'agendou' then 'virou agendamento de '
    when 'nao_quer' then 'recusada (não quer receber) por '
    else 'pulada para ' end;

  select * into v_antes from campanha_envios where campanha_id = p_campanha and client_id = p_client for update;
  if not found then
    if v_c.arquivada then
      raise exception 'Campanha arquivada: desarquive para continuar enviando.';
    end if;
    insert into campanha_envios (campanha_id, client_id, status, mensagem, enviado_em, atualizado_em)
    values (p_campanha, p_client, v_status, v_msg,
            case when v_status = 'enviado' then now() end, now())
    returning id, enviado_em, mensagem into v_id, v_enviado_em, v_texto_enviado;
    perform registrar_movimentacao('criado', 'envio_campanha', v_id,
      'Campanha "' || v_c.nome || '" ' || v_rotulo || v_cliente,
      jsonb_build_object('client_id', p_client, 'campanha_id', p_campanha, 'status', v_status));
  else
    update campanha_envios
       set status = v_status,
           mensagem = coalesce(v_msg, mensagem),
           enviado_em = case when v_status = 'enviado' then coalesce(enviado_em, now()) else enviado_em end,
           atualizado_em = now()
     where id = v_antes.id
    returning id, enviado_em, mensagem into v_id, v_enviado_em, v_texto_enviado;
    perform registrar_movimentacao('editado', 'envio_campanha', v_antes.id,
      'Campanha "' || v_c.nome || '" ' || v_rotulo || v_cliente,
      jsonb_build_object('client_id', p_client, 'campanha_id', p_campanha, 'antes', v_antes.status, 'depois', v_status));
  end if;

  -- Anotação na cliente: só quando o status muda (v_antes.status é nulo se o
  -- envio é novo) e nunca para 'pulado'.
  if v_status <> 'pulado' and v_status is distinct from v_antes.status then
    v_anotacao := 'Campanha «' || v_c.nome || '»: ' || case v_status
      when 'enviado' then
        'mensagem enviada em '
        || to_char(v_enviado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
        || ' às ' || to_char(v_enviado_em at time zone 'America/Sao_Paulo', 'HH24:MI')
        || ' (horário de Brasília). Texto enviado: ' || coalesce(v_texto_enviado, '')
      when 'respondeu' then 'respondeu.'
      when 'agendou' then 'agendou.'
      else 'pediu para não receber campanhas.' end;
    if length(v_anotacao) > 2000 then
      v_anotacao := left(v_anotacao, 1999) || '…';
    end if;
    insert into cliente_anotacoes (client_id, texto, origem, created_by)
    values (p_client, v_anotacao, 'campanha', auth.uid());
  end if;

  return v_id;
end;
$$;

-- Desfaz o envio (apaga a linha): a cliente volta para a fila da campanha.
-- Se houve contato, a anotação "envio desfeito" fica no histórico da cliente.
create or replace function public.desfazer_envio_campanha(p_campanha uuid, p_client uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e campanha_envios%rowtype;
  v_nome_campanha text;
  v_cliente text;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para mexer em envios de campanha.';
  end if;
  select * into v_e from campanha_envios where campanha_id = p_campanha and client_id = p_client for update;
  if not found then
    raise exception 'Envio não encontrado.';
  end if;
  select nome into v_nome_campanha from campanhas where id = p_campanha;
  select name into v_cliente from clients where id = p_client;
  delete from campanha_envios where id = v_e.id;
  perform registrar_movimentacao('excluido', 'envio_campanha', v_e.id,
    'Envio desfeito: campanha "' || coalesce(v_nome_campanha, '') || '" para ' || coalesce(v_cliente, 'cliente'),
    jsonb_build_object('client_id', p_client, 'campanha_id', p_campanha, 'status', v_e.status,
                       'mensagem', v_e.mensagem, 'enviado_em', v_e.enviado_em));
  if v_e.status <> 'pulado' or v_e.enviado_em is not null then
    insert into cliente_anotacoes (client_id, texto, origem, created_by)
    values (p_client, 'Campanha «' || coalesce(v_nome_campanha, '') || '»: envio desfeito (voltou para a fila).',
            'campanha', auth.uid());
  end if;
end;
$$;

revoke execute on function public.registrar_envio_campanha(uuid, uuid, text, text) from public, anon;
revoke execute on function public.desfazer_envio_campanha(uuid, uuid) from public, anon;
grant execute on function public.registrar_envio_campanha(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.desfazer_envio_campanha(uuid, uuid) to authenticated, service_role;

comment on table public.cliente_anotacoes is
  'Anotações da cliente com data e hora. Escrita só por salvar_anotacao_cliente e excluir_anotacao_cliente; as de origem campanha nascem de registrar_envio_campanha e desfazer_envio_campanha.';
