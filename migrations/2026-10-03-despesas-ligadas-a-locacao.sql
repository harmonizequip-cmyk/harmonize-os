-- Despesas ligadas à locação (Financeiro).
--
-- O Financeiro passa a gravar transactions.rental_id nas despesas (saídas)
-- de um cliente, para elas aparecerem na locação e no lucro por locação.
-- Antes disso, apagar QUALQUER lançamento com rental_id apagava a locação
-- inteira. Isso continua certo para a entrada da locação, e errado para
-- uma despesa: apagar o combustível não pode apagar o atendimento.
-- Aqui as duas funções de exclusão passam a tratar despesa como
-- lançamento próprio.

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
  v_tipo entry_type;
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
    select rental_id, mentoring_id, type into v_rental_id, v_mentoria_id, v_tipo
      from transactions where id = p_id;

    -- Despesa (saída) ligada a uma locação é um lançamento próprio: sai
    -- sozinha, sem levar a locação junto. Só a ENTRADA da locação (o
    -- valor cobrado e seus pagamentos) faz a exclusão subir para ela.
    if v_rental_id is not null and v_tipo <> 'saida' then
      return public.preview_exclusao('rentals', v_rental_id)
             || jsonb_build_object('aviso',
                'Este lançamento pertence a uma locação. Apagar vai apagar a locação inteira, junto com o evento da agenda.');
    elsif v_mentoria_id is not null then
      return public.preview_exclusao('mentoring_events', v_mentoria_id)
             || jsonb_build_object('aviso',
                'Este lançamento pertence a uma mentoria. Apagar vai apagar a mentoria inteira.');
    end if;

    select id into v_evento_taxa from calendar_events where taxa_transaction_id = p_id limit 1;

    v_lancamentos := 1;
    select coalesce(amount, 0) into v_valor_lancamentos from transactions where id = p_id;

    if v_evento_taxa is not null then
      v_aviso := 'Este lançamento é a taxa de compromisso de um agendamento. Apagar vai deixar a taxa daquele agendamento como pendente de novo.';
    end if;
    if v_rental_id is not null and v_tipo = 'saida' then
      v_aviso := 'Esta despesa está ligada a uma locação. Apagar remove só a despesa; a locação continua como está.';
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

grant execute on function public.preview_exclusao to authenticated;

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
