-- ============================================================
-- ENVIOS DA AGENDA (imagem das datas livres + mensagem, de 15 em 15 dias)
--
-- STATUS: APLICADA (14/10/2026, conferida: tabela, função, gatilho, anon sem acesso)
--
-- Cada vez que o dono marca "Enviado" num cartão do assistente, fica aqui
-- quem recebeu, quando e a mensagem usada. Serve para:
--   - não mandar duas vezes na mesma quinzena;
--   - a IA nunca repetir uma mensagem para a mesma cliente (ela lê as
--     últimas antes de escrever a nova).
-- Escrito só por registrar_envio_agenda.
-- ============================================================

create table if not exists public.agenda_envios (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  enviado_em timestamptz not null default now(),
  mensagem text not null,
  periodo_inicio date,
  periodo_fim date,
  created_by uuid references public.profiles(id) on delete set null default auth.uid()
);
create index if not exists agenda_envios_cliente_idx on public.agenda_envios (client_id, enviado_em desc);
alter table public.agenda_envios enable row level security;
create policy "agenda_envios_select" on public.agenda_envios for select using (has_module_permission('clientes'));
grant select on public.agenda_envios to authenticated;
create trigger trg_somente_leitura before insert or update or delete on public.agenda_envios for each statement execute function public.bloquear_somente_leitura();

comment on table public.agenda_envios is
  'Agenda (imagem de datas livres + mensagem) enviada a cada cliente. Evita repetir envio na quinzena e repetir texto. Escrito só por registrar_envio_agenda.';

create or replace function public.registrar_envio_agenda(p_client_id uuid, p_mensagem text, p_inicio date, p_fim date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nome text;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para registrar envios.';
  end if;
  if nullif(btrim(p_mensagem), '') is null then
    raise exception 'Mensagem vazia.';
  end if;
  select name into v_nome from clients where id = p_client_id;
  if v_nome is null then raise exception 'Cliente não encontrada.'; end if;

  insert into agenda_envios (client_id, mensagem, periodo_inicio, periodo_fim)
  values (p_client_id, left(btrim(p_mensagem), 2000), p_inicio, p_fim)
  returning id into v_id;

  perform registrar_movimentacao('criado', 'envio_agenda', v_id,
    'Agenda enviada para ' || v_nome, jsonb_build_object('client_id', p_client_id, 'inicio', p_inicio, 'fim', p_fim));
  return v_id;
end;
$$;

revoke execute on function public.registrar_envio_agenda(uuid, text, date, date) from public, anon;
grant execute on function public.registrar_envio_agenda(uuid, text, date, date) to authenticated, service_role;
