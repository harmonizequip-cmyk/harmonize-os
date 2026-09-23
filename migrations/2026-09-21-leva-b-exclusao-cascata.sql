-- ============================================================
-- LEVA B DA AUDITORIA: exclusão em cascata de verdade, com auditoria
--
-- PROBLEMA
-- A delete_record_forever atual DESVINCULA em vez de apagar junto.
-- Apagar uma locação fazia isto:
--
--   update transactions    set rental_id = null where rental_id = X;
--   update calendar_events set rental_id = null where rental_id = X;
--   delete from rentals where id = X;
--
-- O lançamento financeiro continuava vivo no caixa com o valor cheio e o
-- evento continuava vivo na agenda. Pior: depois disso eles ficavam
-- indetectáveis, porque sem o rental_id nenhuma busca por órfão
-- conseguia enxergá-los. Era o oposto do que a exclusão deveria fazer.
--
-- O QUE ESTA MIGRAÇÃO FAZ
-- 1. Cria a tabela movimentacoes, que é o histórico de quem fez o quê e
--    quando. Ninguém consegue editar nem apagar linha dela, nem admin,
--    porque um registro de auditoria que pode ser alterado não serve de
--    auditoria. Só as funções abaixo escrevem nela.
-- 2. Troca a delete_record_forever por uma exclusão em cascata real,
--    que apaga tudo que pertence ao registro e não deixa sobra.
-- 3. Cria a preview_exclusao, que devolve o que vai ser apagado junto,
--    para a tela conseguir avisar antes em vez de depois.
-- 4. Passa a registrar em movimentacoes as mudanças de status da
--    locação, inclusive reagendamento com data antiga e nova.
--
-- OS TRÊS CICLOS DE CHAVE ESTRANGEIRA
-- O schema tem três pares que apontam um para o outro, e é por isso que
-- a função antiga desvinculava: não dá para apagar nenhum dos dois lados
-- primeiro sem antes quebrar o ciclo.
--
--   rentals.transaction_id        -> transactions
--   transactions.rental_id        -> rentals
--
--   mentoring_events.calendar_event_id -> calendar_events
--   calendar_events.mentoring_id       -> mentoring_events
--
--   mentoring_events.transaction_id -> transactions
--   transactions.mentoring_id       -> mentoring_events
--
-- A cascata abaixo quebra cada ciclo com um update para null ANTES de
-- apagar, e só então apaga na ordem que as chaves permitem. Tudo dentro
-- da mesma função, ou seja, na mesma transação: se qualquer passo
-- falhar, nada é apagado pela metade.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Histórico de movimentações
--
-- usuario_nome e descricao são guardados já escritos, de propósito. Um
-- histórico que depende de join com o registro apagado fica ilegível
-- justamente nas linhas que mais importam, que são as de exclusão.
-- ------------------------------------------------------------
create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  ocorrido_em timestamptz not null default now(),
  -- on delete set null: apagar um perfil não pode apagar o rastro do que
  -- essa pessoa fez. O nome abaixo continua respondendo quem era.
  usuario_id uuid references public.profiles(id) on delete set null,
  usuario_nome text not null,
  acao text not null check (acao in (
    'criado', 'editado', 'confirmado', 'desconfirmado',
    'reagendado', 'cancelado', 'excluido'
  )),
  entidade text not null,
  -- Sem chave estrangeira de propósito: na linha de exclusão este id
  -- aponta para algo que não existe mais, e é assim que tem que ser.
  entidade_id uuid,
  descricao text not null,
  detalhes jsonb not null default '{}'::jsonb
);

create index if not exists movimentacoes_ocorrido_em_idx
  on public.movimentacoes (ocorrido_em desc);
create index if not exists movimentacoes_entidade_idx
  on public.movimentacoes (entidade, entidade_id);

alter table public.movimentacoes enable row level security;

-- Leitura para quem está logado. Não existe policy de insert, update ou
-- delete: a tabela só é escrita pelas funções security definer abaixo, e
-- ninguém consegue reescrever nem apagar o histórico pela API.
drop policy if exists movimentacoes_leitura on public.movimentacoes;
create policy movimentacoes_leitura on public.movimentacoes
  for select to authenticated using (true);

grant select on public.movimentacoes to authenticated;

comment on table public.movimentacoes is
  'Histórico de movimentações: quem fez o quê e quando. Só as funções security definer escrevem aqui; não há policy de insert/update/delete de propósito, para o histórico não poder ser reescrito.';

-- ------------------------------------------------------------
-- 2) Escrever no histórico
-- ------------------------------------------------------------
create or replace function public.registrar_movimentacao(
  p_acao text,
  p_entidade text,
  p_entidade_id uuid,
  p_descricao text,
  p_detalhes jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  select name into v_nome from public.profiles where id = auth.uid();

  insert into public.movimentacoes (
    usuario_id, usuario_nome, acao, entidade, entidade_id, descricao, detalhes
  )
  values (
    auth.uid(),
    coalesce(nullif(trim(v_nome), ''), 'Usuário desconhecido'),
    p_acao,
    p_entidade,
    p_entidade_id,
    p_descricao,
    coalesce(p_detalhes, '{}'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------
-- 2b) Dinheiro no formato brasileiro
--
-- O to_char do Postgres usa os separadores do locale do servidor, que no
-- Supabase é o americano: 7400 sairia como "7,400.00" dentro do texto do
-- histórico. Como esse texto é gravado uma vez e lido para sempre, ele
-- precisa já nascer certo. A troca abaixo usa um marcador temporário
-- para inverter ponto e vírgula sem embaralhar os dois.
-- ------------------------------------------------------------
create or replace function public.formatar_reais(p_valor numeric)
returns text
language sql
immutable
as $$
  select 'R$ ' || replace(replace(replace(
           to_char(coalesce(p_valor, 0), 'FM999,999,990.00'),
           ',', '#'), '.', ','), '#', '.');
$$;

-- ------------------------------------------------------------
-- 3) Descrever um registro em uma linha legível
--
-- Usado para gravar no histórico uma frase que continua fazendo sentido
-- depois que o registro descrito deixou de existir.
-- ------------------------------------------------------------
create or replace function public.descrever_registro(
  p_table text,
  p_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_texto text;
begin
  if p_table = 'rentals' then
    select 'Locação ' || coalesce(e.name, 'equipamento') ||
           ' de ' || coalesce(c.name, 'cliente') ||
           ' em ' || to_char(r.event_date, 'DD/MM/YYYY') ||
           ', ' || public.formatar_reais(r.calculated_value) ||
           ' (' || r.shots || ' disparos)'
      into v_texto
      from rentals r
      left join clients c on c.id = r.client_id
      left join equipments e on e.id = r.equipment_id
     where r.id = p_id;

  elsif p_table = 'transactions' then
    select 'Lançamento ' || t.type || ' "' || coalesce(t.description, 'sem descrição') || '"' ||
           ', ' || public.formatar_reais(t.amount) ||
           ' em ' || to_char(t.date, 'DD/MM/YYYY')
      into v_texto
      from transactions t
     where t.id = p_id;

  elsif p_table = 'calendar_events' then
    select 'Evento "' || coalesce(ev.title, 'sem título') || '"' ||
           coalesce(' de ' || c.name, '') ||
           ' em ' || to_char(ev.date_start, 'DD/MM/YYYY')
      into v_texto
      from calendar_events ev
      left join clients c on c.id = ev.client_id
     where ev.id = p_id;

  elsif p_table = 'clients' then
    select 'Cliente ' || coalesce(c.name, 'sem nome') ||
           coalesce(' (' || c.clinic_name || ')', '')
      into v_texto
      from clients c
     where c.id = p_id;

  elsif p_table = 'tasks' then
    select 'Tarefa "' || coalesce(tk.title, 'sem título') || '"' ||
           coalesce(' de ' || c.name, '')
      into v_texto
      from tasks tk
      left join clients c on c.id = tk.client_id
     where tk.id = p_id;

  elsif p_table = 'mentoring_events' then
    select 'Mentoria de ' || coalesce(m.mentee_name, 'sem nome') ||
           ' em ' || to_char(m.date, 'DD/MM/YYYY') ||
           ', ' || public.formatar_reais(m.value)
      into v_texto
      from mentoring_events m
     where m.id = p_id;
  end if;

  return coalesce(v_texto, p_table || ' ' || coalesce(p_id::text, '?'));
end;
$$;

-- ------------------------------------------------------------
-- 4) Prever o que a exclusão vai levar junto
--
-- Devolve um jsonb que a tela usa para montar a confirmação. O objetivo
-- é a pessoa ver o estrago ANTES de confirmar, principalmente no caso
-- do cliente, em que a cascata pode levar anos de histórico financeiro.
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
  v_locacoes int := 0;
  v_lancamentos int := 0;
  v_eventos int := 0;
  v_tarefas int := 0;
  -- Dois valores separados de propósito. Normalmente são o mesmo
  -- dinheiro visto de dois lugares, mas quando alguém já apagou o
  -- lançamento antes (foi o que produziu o bug dos R$ 39.581,97), a
  -- locação continua com valor e o caixa não. Somar os dois contaria o
  -- mesmo dinheiro duas vezes; mostrar só um esconderia metade do fato.
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

  elsif p_table = 'transactions' then
    select rental_id, mentoring_id into v_rental_id, v_mentoria_id
      from transactions where id = p_id;

    -- Lançamento de locação não é registro independente, é a cara
    -- financeira dela. Apagar só ele é exatamente o que produziu, em
    -- 21/09/2026, sete locações canceladas com valor preso e sem
    -- lançamento. Então a exclusão sobe para a locação inteira, e a
    -- tela avisa isso antes de confirmar.
    if v_rental_id is not null then
      return public.preview_exclusao('rentals', v_rental_id)
             || jsonb_build_object('aviso',
                'Este lançamento pertence a uma locação. Apagar vai apagar a locação inteira, junto com o evento da agenda.');
    elsif v_mentoria_id is not null then
      return public.preview_exclusao('mentoring_events', v_mentoria_id)
             || jsonb_build_object('aviso',
                'Este lançamento pertence a uma mentoria. Apagar vai apagar a mentoria inteira.');
    end if;

    v_lancamentos := 1;
    select coalesce(amount, 0) into v_valor_lancamentos from transactions where id = p_id;

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

  elsif p_table = 'tasks' then
    v_tarefas := 1;

  else
    raise exception 'Tabela não permitida: %', p_table;
  end if;

  if v_locacoes > 0 then
    v_itens := v_itens || (v_locacoes || (case when v_locacoes = 1 then ' locação' else ' locações' end));
  end if;
  if v_eventos > 0 then
    v_itens := v_itens || (v_eventos || (case when v_eventos = 1 then ' evento da agenda' else ' eventos da agenda' end));
  end if;
  if v_lancamentos > 0 then
    v_itens := v_itens || (v_lancamentos || (case when v_lancamentos = 1 then ' lançamento financeiro' else ' lançamentos financeiros' end));
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
    'valor_locacoes', round(coalesce(v_valor_locacoes, 0), 2),
    'valor_lancamentos', round(coalesce(v_valor_lancamentos, 0), 2),
    'itens', to_jsonb(v_itens),
    'aviso', v_aviso
  );
end;
$$;

grant execute on function public.preview_exclusao to authenticated;

-- ------------------------------------------------------------
-- 5) Cascata de uma locação, usada por vários caminhos
--
-- Não registra no histórico: quem chama é que registra, para a linha do
-- histórico descrever o que a pessoa pediu para apagar, e não cada
-- pedaço interno da cascata.
-- ------------------------------------------------------------
create or replace function public.excluir_locacao_cascata(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Quebra o ciclo locação -> lançamento antes de qualquer delete.
  update rentals set transaction_id = null where id = p_rental_id;

  -- Solta mentorias que por acaso apontem para o que vai sumir. Não
  -- apaga a mentoria: ela é um compromisso próprio, não parte da locação.
  update mentoring_events set calendar_event_id = null
   where calendar_event_id in (select id from calendar_events where rental_id = p_rental_id);
  update mentoring_events set transaction_id = null
   where transaction_id in (select id from transactions where rental_id = p_rental_id);

  -- Agora a ordem que as chaves estrangeiras permitem.
  delete from calendar_events where rental_id = p_rental_id;
  delete from transactions    where rental_id = p_rental_id;
  delete from rentals         where id = p_rental_id;
end;
$$;

-- ------------------------------------------------------------
-- 6) Cascata de uma mentoria
-- ------------------------------------------------------------
create or replace function public.excluir_mentoria_cascata(p_mentoria_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento_id uuid;
  v_transacao_id uuid;
begin
  select calendar_event_id, transaction_id into v_evento_id, v_transacao_id
    from mentoring_events where id = p_mentoria_id;

  -- Quebra os dois ciclos da mentoria antes de apagar qualquer coisa.
  update mentoring_events set calendar_event_id = null, transaction_id = null
   where id = p_mentoria_id;
  update calendar_events set mentoring_id = null where mentoring_id = p_mentoria_id;
  update transactions    set mentoring_id = null where mentoring_id = p_mentoria_id;

  delete from calendar_events where id = v_evento_id;
  delete from transactions    where id = v_transacao_id;
  delete from mentoring_events where id = p_mentoria_id;
end;
$$;

-- ------------------------------------------------------------
-- 7) A exclusão em si: cascata real, só admin, com registro
--
-- Mantém o nome delete_record_forever porque a interface já chama essa
-- função em vários lugares. O que muda é o comportamento: onde antes ela
-- desvinculava e deixava o resto vivo, agora ela apaga junto.
-- ------------------------------------------------------------
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
begin
  perform public.require_admin();

  -- Descrição e prévia são calculadas ANTES de apagar, senão não haveria
  -- mais nada para descrever na hora de escrever o histórico.
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
      delete from calendar_events where id = p_id;
    end if;

  elsif p_table = 'mentoring_events' then
    perform public.excluir_mentoria_cascata(p_id);

  elsif p_table = 'tasks' then
    delete from tasks where id = p_id;

  elsif p_table = 'clients' then
    -- A versão anterior recusava apagar cliente com histórico. Agora
    -- apaga, porque foi pedido, mas a tela mostra antes quantas locações
    -- e quanto dinheiro vão junto, via preview_exclusao. Quem confirma
    -- está vendo o número.
    update rentals set transaction_id = null where client_id = p_id;

    update mentoring_events set calendar_event_id = null
     where calendar_event_id in (select id from calendar_events where client_id = p_id);
    update mentoring_events set transaction_id = null
     where transaction_id in (
       select id from transactions
        where client_id = p_id
           or rental_id in (select id from rentals where client_id = p_id)
     );

    delete from calendar_events where client_id = p_id;
    delete from transactions
     where client_id = p_id
        or rental_id in (select id from rentals where client_id = p_id);
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

grant execute on function public.delete_record_forever to authenticated;

-- ------------------------------------------------------------
-- 8) Registrar mudanças de status da locação
--
-- Reescreve a update_rental mantendo tudo que ela já fazia e passando a
-- gravar no histórico o que mudou. Reagendamento entra com a data antiga
-- e a nova, que é o que o item 4 da auditoria pede explicitamente.
-- ------------------------------------------------------------
create or replace function public.update_rental(
  p_rental_id uuid,
  p_equipment_id uuid,
  p_event_date date,
  p_shots integer,
  p_calculated_value numeric,
  p_payment_method payment_method_type,
  p_status event_status_type,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_client_id uuid;
  v_old_date date;
  v_old_status event_status_type;
  v_old_value numeric;
  v_descricao text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para editar locações';
  end if;

  select transaction_id, client_id, event_date, status, calculated_value
    into v_transaction_id, v_client_id, v_old_date, v_old_status, v_old_value
    from rentals where id = p_rental_id;

  update rentals
  set equipment_id = p_equipment_id,
      event_date = p_event_date,
      shots = p_shots,
      calculated_value = p_calculated_value,
      payment_method = p_payment_method,
      status = p_status,
      notes = p_notes,
      rescheduled = rescheduled or (v_old_date is not null and v_old_date <> p_event_date)
  where id = p_rental_id;

  if v_transaction_id is not null then
    update transactions
    set amount = p_calculated_value,
        date = p_event_date,
        payment_method = p_payment_method
    where id = v_transaction_id;
  end if;

  -- Atualiza o evento de agenda vinculado; se a nova data/equipamento
  -- conflitar com outra reserva, a constraint recusa e desfaz tudo.
  update calendar_events
  set equipment_id = p_equipment_id,
      date_start = p_event_date,
      date_end = p_event_date,
      value = p_calculated_value,
      status = p_status
  where rental_id = p_rental_id;

  -- Histórico. Só depois dos updates, para a descrição já refletir o
  -- estado novo, e só se alguma coisa que importa tiver mudado.
  v_descricao := public.descrever_registro('rentals', p_rental_id);

  if v_old_date is distinct from p_event_date then
    perform public.registrar_movimentacao(
      'reagendado', 'rentals', p_rental_id, v_descricao,
      jsonb_build_object(
        'data_antiga', to_char(v_old_date, 'DD/MM/YYYY'),
        'data_nova',   to_char(p_event_date, 'DD/MM/YYYY')
      )
    );
  elsif v_old_status is distinct from p_status then
    perform public.registrar_movimentacao(
      case p_status
        when 'cancelada' then 'cancelado'
        when 'confirmada' then 'confirmado'
        else 'editado'
      end,
      'rentals', p_rental_id, v_descricao,
      jsonb_build_object(
        'status_antigo', v_old_status::text,
        'status_novo',   p_status::text
      )
    );
  elsif v_old_value is distinct from p_calculated_value then
    perform public.registrar_movimentacao(
      'editado', 'rentals', p_rental_id, v_descricao,
      jsonb_build_object(
        'valor_antigo', round(coalesce(v_old_value, 0), 2),
        'valor_novo',   round(coalesce(p_calculated_value, 0), 2)
      )
    );
  end if;
end;
$$;

grant execute on function public.update_rental to authenticated;
