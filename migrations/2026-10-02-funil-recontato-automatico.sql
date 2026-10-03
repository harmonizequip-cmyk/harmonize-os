-- ============================================================
-- FUNIL DE CLIENTES, PARTE 2: tarefa automática de recontato.
-- Rodar também no SQL editor do Supabase. Seguro rodar de novo.
-- ============================================================

alter table public.settings
  add column if not exists recontato_automatico boolean not null default true;

-- Novo tipo de tarefa: 'recontato'.
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
  check (type in ('contato_inicial', 'followup', 'manual', 'recontato'));

create unique index if not exists tasks_recontato_pendente_uniq on public.tasks(client_id)
  where type = 'recontato' and status = 'pendente';

create or replace function public.desfazer_conclusao_tarefa(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_type text;
  v_follow_up_number integer;
  v_status text;
  v_next_task_id uuid;
  v_next_task_status text;
  v_tag_id uuid;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para alterar tarefas.';
  end if;

  select client_id, type, follow_up_number, status
    into v_client_id, v_type, v_follow_up_number, v_status
    from tasks where id = p_task_id;

  if not found then
    raise exception 'Tarefa não encontrada.';
  end if;

  if v_status <> 'concluida' then
    raise exception 'Esta tarefa não está concluída.';
  end if;

  if v_type in ('contato_inicial', 'followup') and v_client_id is not null then
    select id, status into v_next_task_id, v_next_task_status
      from tasks
     where client_id = v_client_id
       and type = 'followup'
       and follow_up_number = coalesce(v_follow_up_number, 0) + 1
     order by created_at desc
     limit 1;

    if v_next_task_id is not null then
      if v_next_task_status <> 'pendente' then
        raise exception 'Não dá para desfazer: já existe uma tarefa de follow-up seguinte que já foi mexida. Desfaça essa primeiro.';
      end if;
      delete from tasks where id = v_next_task_id;
    end if;

    if v_follow_up_number is not null then
      select id into v_tag_id from tags where name = 'Follow-up ' || v_follow_up_number;
      if v_tag_id is not null then
        insert into client_tags (client_id, tag_id) values (v_client_id, v_tag_id)
        on conflict do nothing;
      end if;
    end if;
  end if;

  -- Recontato automático: só pode haver uma pendente por cliente. Se a
  -- rotina já gerou a próxima, a reaberta toma o lugar dela.
  if v_type = 'recontato' and v_client_id is not null then
    delete from tasks
     where client_id = v_client_id and type = 'recontato' and status = 'pendente' and id <> p_task_id;
  end if;

  update tasks set status = 'pendente', completed_at = null where id = p_task_id;

  perform public.registrar_movimentacao(
    'editado', 'tasks', p_task_id, public.descrever_registro('tasks', p_task_id),
    jsonb_build_object('acao_detalhada', 'Conclusão da tarefa desfeita (reaberta por engano)')
  );
end;
$$;

grant execute on function public.desfazer_conclusao_tarefa to authenticated;

create or replace function public.gerar_tarefas_recontato()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo boolean;
  v_intervalo integer;
  v_teste boolean;
  v_hoje date := public.hoje_local();
  v_criadas integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select recontato_automatico, recontato_intervalo_dias, test_mode
    into v_ativo, v_intervalo, v_teste
    from settings where id;

  if not coalesce(v_ativo, false) or coalesce(v_teste, false) then
    return 0;
  end if;

  delete from tasks t
   where t.type = 'recontato' and t.status = 'pendente'
     and exists (
       select 1 from calendar_events ev
        where ev.client_id = t.client_id
          and ev.status <> 'cancelada'
          and ev.equipment_id is not null
          and not ev.is_mentoria
          and ev.date_start >= v_hoje
     );

  insert into tasks (client_id, type, title, due_date)
  select c.id, 'recontato', 'Recontato com o cliente',
         greatest(
           coalesce((select max(r.event_date) from rentals r
                      where r.client_id = c.id and r.status <> 'cancelada' and r.event_date <= v_hoje),
                    date '0001-01-01'),
           coalesce((select max((t.completed_at at time zone 'America/Sao_Paulo')::date) from tasks t
                      where t.client_id = c.id and t.type = 'recontato' and t.status = 'concluida'),
                    date '0001-01-01'),
           (c.created_at at time zone 'America/Sao_Paulo')::date
         ) + v_intervalo
    from clients c
   where c.is_client
     and not c.is_test
     and not exists (
       select 1 from calendar_events ev
        where ev.client_id = c.id
          and ev.status <> 'cancelada'
          and ev.equipment_id is not null
          and not ev.is_mentoria
          and ev.date_start >= v_hoje
     )
     and not exists (
       select 1 from tasks t where t.client_id = c.id and t.type = 'recontato' and t.status = 'pendente'
     )
  on conflict do nothing;

  get diagnostics v_criadas = row_count;
  return v_criadas;
end;
$$;

grant execute on function public.gerar_tarefas_recontato to authenticated;
