-- ============================================================
-- Excluir cliente: quem tem movimentos não pode ser apagado
-- (decisão do dono, 26/10/2026: "Quem tem movimentos deve bloquear")
-- ============================================================
--
-- A trava da Leva P.3 (2026-09-25-leva-p3-excluir-cliente-lead.sql)
-- recusava excluir lead/cliente com locação ou lançamento. Ela se perdeu
-- quando 2026-10-03-despesas-ligadas-a-locacao.sql recriou
-- delete_record_forever a partir de uma versão anterior: desde então o
-- ramo 'clients' apagava em cascata locações, lançamentos, taxas e agenda,
-- e o botão "Excluir" da ficha podia apagar faturamento.
--
-- Esta migration recria a função IGUAL à atual (ramos rentals,
-- transactions, calendar_events, mentoring_events e tasks sem nenhuma
-- mudança) e, no começo do ramo 'clients', recusa quando o cliente tem:
--   locação, lançamento (do cliente ou de locação dele, inclusive taxa),
--   agendamento (qualquer status), mentoria ligada a ele (pela agenda ou
--   pelo lançamento), crédito, contrato emitido, planejamento ou login de
--   cliente do Planejador (profiles.cliente_id).
-- Não contam (e continuam saindo junto com o lead): tarefas, anotações,
-- etiquetas, envios de campanha, agendas enviadas e convites.
--
-- Modo teste: cliente com is_test = true pode ser excluído com os
-- movimentos dele, desde que TODOS sejam de teste (Configurações > Dados
-- de teste). Movimento real ligado a cliente de teste bloqueia. Crédito
-- conta como de teste quando nasceu de locação ou lançamento de teste;
-- planejamento, quando está ligado a agendamento de teste. Login de
-- cliente sempre bloqueia. Passada a trava, contratos e planejamentos
-- (então todos de teste) saem junto, antes da cascata de sempre, porque
-- contratos_emitidos não deixaria apagar a locação nem o cliente e o
-- planejamento ficaria órfão.
--
-- Idempotente: create or replace + revoke/grant.

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
  v_tipo entry_type;
  v_evento_taxa uuid;
  v_taxas uuid[];
  v_cliente_teste boolean;
  v_n_locacoes int;
  v_n_lancamentos int;
  v_n_agendamentos int;
  v_n_mentorias int;
  v_n_creditos int;
  v_n_contratos int;
  v_n_planejamentos int;
  v_n_logins int;
  v_partes text[] := '{}';
begin
  perform public.require_admin();

  v_descricao := public.descrever_registro(p_table, p_id);
  v_detalhes  := public.preview_exclusao(p_table, p_id);

  if p_table = 'rentals' then
    perform public.excluir_locacao_cascata(p_id);

  elsif p_table = 'transactions' then
    select rental_id, mentoring_id, type into v_rental_id, v_mentoria_id, v_tipo
      from transactions where id = p_id;

    -- Despesa (saída) ligada a uma locação sai sozinha; só a entrada da
    -- locação leva a locação inteira junto (mesma regra do preview).
    if v_rental_id is not null and v_tipo <> 'saida' then
      perform public.excluir_locacao_cascata(v_rental_id);
    elsif v_mentoria_id is not null then
      perform public.excluir_mentoria_cascata(v_mentoria_id);
    else
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
    -- Trava (decisão do dono, 26/10/2026): cliente com movimentos não se
    -- exclui. Cliente real: conta tudo. Cliente de teste: conta só o que
    -- for real (o de teste sai junto, como sempre saiu).
    select coalesce(is_test, false) into v_cliente_teste from clients where id = p_id;
    v_cliente_teste := coalesce(v_cliente_teste, false);

    select count(*) into v_n_locacoes
      from rentals r
     where r.client_id = p_id
       and (not v_cliente_teste or not r.is_test);

    select count(*) into v_n_lancamentos
      from transactions t
     where (t.client_id = p_id
            or t.rental_id in (select id from rentals where client_id = p_id)
            or t.id in (select taxa_transaction_id from calendar_events
                         where client_id = p_id and taxa_transaction_id is not null))
       and (not v_cliente_teste or not t.is_test);

    select count(*) into v_n_agendamentos
      from calendar_events e
     where e.client_id = p_id
       and (not v_cliente_teste or not e.is_test);

    select count(*) into v_n_mentorias
      from mentoring_events m
     where (m.calendar_event_id in (select id from calendar_events where client_id = p_id)
            or m.id in (select mentoring_id from calendar_events
                         where client_id = p_id and mentoring_id is not null)
            or m.transaction_id in (select id from transactions where client_id = p_id)
            or m.id in (select mentoring_id from transactions
                         where client_id = p_id and mentoring_id is not null))
       and (not v_cliente_teste or not m.is_test);

    select count(*) into v_n_creditos
      from creditos_cliente c
     where c.client_id = p_id
       and (not v_cliente_teste
            or not (exists (select 1 from rentals r where r.id = c.rental_id and r.is_test)
                    or exists (select 1 from transactions t where t.id = c.transaction_id and t.is_test)));

    select count(*) into v_n_contratos
      from contratos_emitidos ce
     where ce.client_id = p_id
       and (not v_cliente_teste or not ce.is_test);

    select count(*) into v_n_planejamentos
      from planejamentos pl
     where pl.client_id = p_id
       and (not v_cliente_teste
            or not exists (select 1 from calendar_events e
                            where e.id = pl.calendar_event_id and e.is_test));

    select count(*) into v_n_logins
      from profiles pr
     where pr.cliente_id = p_id;

    if v_n_locacoes > 0 then
      v_partes := v_partes || format('%s %s', v_n_locacoes, case when v_n_locacoes = 1 then 'locação' else 'locações' end);
    end if;
    if v_n_lancamentos > 0 then
      v_partes := v_partes || format('%s %s', v_n_lancamentos, case when v_n_lancamentos = 1 then 'lançamento' else 'lançamentos' end);
    end if;
    if v_n_agendamentos > 0 then
      v_partes := v_partes || format('%s %s', v_n_agendamentos, case when v_n_agendamentos = 1 then 'agendamento' else 'agendamentos' end);
    end if;
    if v_n_mentorias > 0 then
      v_partes := v_partes || format('%s %s', v_n_mentorias, case when v_n_mentorias = 1 then 'mentoria' else 'mentorias' end);
    end if;
    if v_n_creditos > 0 then
      v_partes := v_partes || format('%s %s', v_n_creditos, case when v_n_creditos = 1 then 'movimento de crédito' else 'movimentos de crédito' end);
    end if;
    if v_n_contratos > 0 then
      v_partes := v_partes || format('%s %s', v_n_contratos, case when v_n_contratos = 1 then 'contrato emitido' else 'contratos emitidos' end);
    end if;
    if v_n_planejamentos > 0 then
      v_partes := v_partes || format('%s %s', v_n_planejamentos, case when v_n_planejamentos = 1 then 'planejamento' else 'planejamentos' end);
    end if;
    if v_n_logins > 0 then
      v_partes := v_partes || 'login de acesso ao Planejador'::text;
    end if;

    if cardinality(v_partes) > 0 then
      if v_cliente_teste then
        raise exception 'Este cliente de teste tem movimentos reais (%) e não pode ser excluído. Resolva os movimentos reais antes, ou deixe o cadastro como está.',
          array_to_string(v_partes, ', ');
      else
        raise exception 'Este cliente tem movimentos (%) e não pode ser excluído. Cancele ou resolva os movimentos antes, ou deixe o cadastro como está.',
          array_to_string(v_partes, ', ');
      end if;
    end if;

    -- Daqui para baixo só chega lead puro ou cliente de teste com
    -- movimentos só de teste. Contrato e planejamento (de teste) saem
    -- antes: o contrato prende a locação e o cliente.
    delete from contratos_emitidos where client_id = p_id;
    delete from planejamentos      where client_id = p_id;

    update rentals set transaction_id = null where client_id = p_id;

    update mentoring_events set calendar_event_id = null
     where calendar_event_id in (select id from calendar_events where client_id = p_id);
    update mentoring_events set transaction_id = null
     where transaction_id in (
       select id from transactions
        where client_id = p_id
           or rental_id in (select id from rentals where client_id = p_id)
     );

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

revoke execute on function public.delete_record_forever(text, uuid) from public, anon;
grant execute on function public.delete_record_forever(text, uuid) to authenticated, service_role;
