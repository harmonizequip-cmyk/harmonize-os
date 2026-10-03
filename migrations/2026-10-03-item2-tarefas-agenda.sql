-- ============================================================
-- ITEM 2: rotina automática de tarefas da agenda (confirmação D-2,
-- pós-locação D+1, cobrança da taxa de reserva em 3 dias).
-- Chamada ao abrir Funil e Tarefas, junto com o recontato.
-- Rodar também no SQL editor do Supabase. Seguro rodar de novo.
-- ============================================================

alter table public.settings
  add column if not exists tarefa_confirmacao_ativa boolean not null default true,
  add column if not exists dias_antes_confirmacao integer not null default 2,
  add column if not exists tarefa_pos_locacao_ativa boolean not null default true,
  add column if not exists dias_pos_locacao integer not null default 1,
  add column if not exists tarefa_taxa_ativa boolean not null default true,
  add column if not exists dias_cobranca_taxa integer not null default 3;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_tarefas_agenda_check') then
    alter table public.settings
      add constraint settings_tarefas_agenda_check
      check (dias_antes_confirmacao between 0 and 30
         and dias_pos_locacao between 0 and 30
         and dias_cobranca_taxa between 1 and 30);
  end if;
end $$;

alter table public.tasks
  add column if not exists event_id uuid references public.calendar_events(id) on delete cascade;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.tasks'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%contato_inicial%'
  loop
    execute format('alter table public.tasks drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.tasks
  add constraint tasks_type_check
  check (type in ('contato_inicial', 'followup', 'manual', 'recontato', 'confirmacao', 'pos_locacao', 'cobranca_taxa'));

-- Uma tarefa por agendamento e tipo, para sempre: concluída ou não, a
-- rotina não gera a mesma de novo.
create unique index if not exists tasks_evento_tipo_uniq on public.tasks(event_id, type)
  where event_id is not null;

create or replace function public.gerar_tarefas_agenda()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s settings%rowtype;
  v_hoje date := public.hoje_local();
  v_total integer := 0;
  v_n integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select * into s from settings where id;
  if not found or coalesce(s.test_mode, false) then
    return 0;
  end if;

  -- 1) Confirmar presença: X dias antes de agendamento não confirmado.
  if s.tarefa_confirmacao_ativa then
    delete from tasks t
     using calendar_events ev
     where t.event_id = ev.id and t.type = 'confirmacao' and t.status = 'pendente'
       and (ev.confirmed or ev.status = 'cancelada' or ev.date_start < v_hoje
            or ev.date_start - s.dias_antes_confirmacao > v_hoje);

    insert into tasks (client_id, type, title, due_date, event_id)
    select ev.client_id, 'confirmacao',
           'Confirmar presença de ' || to_char(ev.date_start, 'DD/MM'),
           greatest(ev.date_start - s.dias_antes_confirmacao, v_hoje), ev.id
      from calendar_events ev
      join clients c on c.id = ev.client_id
     where ev.equipment_id is not null
       and ev.status <> 'cancelada'
       and not ev.confirmed
       and not ev.is_test and not c.is_test
       and ev.date_start >= v_hoje
       and ev.date_start - s.dias_antes_confirmacao <= v_hoje
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  -- 2) Pós-locação: X dias depois da locação (janela de 14 dias para trás,
  --    para a primeira execução não despejar o histórico antigo).
  if s.tarefa_pos_locacao_ativa then
    delete from tasks t
     using calendar_events ev
     where t.event_id = ev.id and t.type = 'pos_locacao' and t.status = 'pendente'
       and (ev.status = 'cancelada' or ev.no_show);

    insert into tasks (client_id, type, title, due_date, event_id)
    select ev.client_id, 'pos_locacao',
           'Pós-locação de ' || to_char(ev.date_start, 'DD/MM'),
           ev.date_start + s.dias_pos_locacao, ev.id
      from calendar_events ev
      join clients c on c.id = ev.client_id
     where ev.rental_id is not null
       and not ev.is_mentoria
       and ev.status <> 'cancelada'
       and not ev.no_show
       and not ev.is_test and not c.is_test
       and ev.date_start + s.dias_pos_locacao <= v_hoje
       and ev.date_start >= v_hoje - 14
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  -- 3) Cobrar taxa de reserva: pendente há X dias desde que a reserva foi criada.
  if s.tarefa_taxa_ativa then
    delete from tasks t
     using calendar_events ev
     where t.event_id = ev.id and t.type = 'cobranca_taxa' and t.status = 'pendente'
       and (ev.taxa_status <> 'pendente' or ev.status = 'cancelada' or ev.date_start < v_hoje);

    insert into tasks (client_id, type, title, due_date, event_id)
    select ev.client_id, 'cobranca_taxa',
           'Cobrar taxa de reserva (' || to_char(ev.date_start, 'DD/MM') || ')',
           (ev.created_at at time zone 'America/Sao_Paulo')::date + s.dias_cobranca_taxa, ev.id
      from calendar_events ev
      join clients c on c.id = ev.client_id
     where ev.taxa_status = 'pendente'
       and ev.status <> 'cancelada'
       and not ev.is_test and not c.is_test
       and ev.date_start >= v_hoje
       and (ev.created_at at time zone 'America/Sao_Paulo')::date + s.dias_cobranca_taxa <= v_hoje
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;

grant execute on function public.gerar_tarefas_agenda to authenticated;
