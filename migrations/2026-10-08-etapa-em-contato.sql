-- ============================================================
-- STATUS: ESCRITA, AINDA NÃO APLICADA (aguarda o dono rodar).
--
-- Nova etapa do funil de leads: "Em contato" (em_contato), entre Nutrição
-- e Interesse. É para quem está respondendo no WhatsApp.
--   1. clients.stage passa a aceitar 'em_contato'.
--   2. Ao marcar "respondeu" numa tarefa de contato, o lead vai sozinho
--      para "Em contato" (só se estiver em Novo contato, Tentativa de
--      contato ou Nutrição; quem já está em Interesse ou adiante fica onde está).
-- Não mexe em nenhum cadastro existente.
-- ============================================================

alter table public.clients drop constraint if exists clients_stage_check;
alter table public.clients add constraint clients_stage_check
  check (stage in ('lead', 'contato', 'nutricao', 'em_contato', 'qualificado', 'agendado', 'cliente'));

create or replace function public.register_contact_attempt(
  p_task_id uuid,
  p_responded boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_client_name text;
  v_current_followup integer;
  v_next_followup integer;
  v_tag_id uuid;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para atualizar tarefas de contato';
  end if;

  select client_id, follow_up_number into v_client_id, v_current_followup
  from tasks
  where id = p_task_id and status = 'pendente';

  if v_client_id is null then
    raise exception 'Tarefa não encontrada ou já concluída.';
  end if;

  update tasks
  set status = 'concluida', completed_at = now()
  where id = p_task_id;

  delete from client_tags
  where client_id = v_client_id
    and tag_id in (select id from tags where name like 'Follow-up %');

  -- Respondeu: o lead passa para "Em contato" (conversa em andamento no
  -- WhatsApp), a não ser que já esteja mais adiante no funil.
  if p_responded then
    update clients set stage = 'em_contato'
     where id = v_client_id and stage in ('lead', 'contato', 'nutricao');
    return;
  end if;

  select name into v_client_name from clients where id = v_client_id;
  v_next_followup := coalesce(v_current_followup, 0) + 1;

  if v_next_followup > 5 then
    update clients set stage = 'nutricao' where id = v_client_id;
    return;
  end if;

  select id into v_tag_id from tags where name = 'Follow-up ' || v_next_followup;
  if v_tag_id is not null then
    insert into client_tags (client_id, tag_id) values (v_client_id, v_tag_id)
    on conflict do nothing;
  end if;

  insert into tasks (client_id, type, follow_up_number, title, due_date)
  values (
    v_client_id,
    'followup',
    v_next_followup,
    'Confirmar se ' || coalesce(v_client_name, 'o cliente') || ' respondeu (Follow-up ' || v_next_followup || ')',
    public.hoje_local() + 2
  );
end;
$$;
