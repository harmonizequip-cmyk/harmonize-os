-- ============================================================
-- LEVA P.3 — permitir excluir lead/cliente, mas nunca em cascata
-- sobre locação, pagamento ou lançamento financeiro
-- ============================================================
--
-- delete_record_forever já sabia apagar 'clients' em cascata total
-- (locações, transações, taxas, agenda, tarefas, etiquetas), mas isso
-- nunca tinha um botão na tela — e cascata total é arriscado demais
-- pra expor num botão de "excluir lead": um clique errado apagaria
-- faturamento de verdade sem volta.
--
-- Esta leva troca a cascata por um bloqueio: só é possível excluir um
-- lead/cliente que nunca teve NENHUMA locação nem lançamento financeiro
-- no histórico (preview_exclusao já calcula os dois, incluindo taxa de
-- compromisso já paga). Quem tem histórico não pode ser excluído por
-- aqui — precisa cancelar as locações primeiro, uma a uma, se for
-- mesmo o caso. O que continua saindo junto, para um lead "limpo", é
-- só agenda (pré-reserva sem locação), tarefa do funil e etiqueta —
-- nada disso é dinheiro.
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
    if (v_detalhes->>'locacoes')::int > 0 or (v_detalhes->>'lancamentos')::int > 0 then
      raise exception 'Este lead/cliente já tem locação, pagamento ou lançamento financeiro no histórico e não pode ser excluído. Cancele as locações primeiro, se realmente precisar remover.';
    end if;

    delete from calendar_events where client_id = p_id;
    delete from client_tags     where client_id = p_id;
    delete from tasks           where client_id = p_id;
    delete from clients         where id = p_id;

  else
    raise exception 'Tabela não permitida: %', p_table;
  end if;

  perform public.registrar_movimentacao(
    'excluido', p_table, p_id, v_descricao, v_detalhes
  );
end;
$$;
