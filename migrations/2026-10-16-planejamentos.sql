-- ============================================================
-- PLANEJADOR HIPRO (tela /planejador)
--
-- STATUS: AGUARDANDO O DONO
--
-- O "Planejador HIPRO HOF" (HTML do dono, em public/ferramentas) roda dentro
-- do app. Cada planejamento é de um paciente atendido numa cliente da
-- Harmonize (a profissional que aluga o HIPRO) e pode ficar amarrado ao
-- atendimento da agenda. O estado inteiro do planejador fica em "estado"
-- (jsonb, o mesmo objeto que ele salvava no aparelho); as colunas de cima
-- saem dele para a lista e a busca.
-- Escrito só por salvar_planejamento e excluir_planejamento.
-- ============================================================

create table if not exists public.planejamentos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  paciente text,
  data date,
  data_retorno date,
  procedimento text,
  saldo_total integer not null default 0,
  total_disparos integer not null default 0,
  estado jsonb not null default '{}'::jsonb check (jsonb_typeof(estado) = 'object'),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists planejamentos_cliente_idx on public.planejamentos (client_id, data desc);
create index if not exists planejamentos_evento_idx on public.planejamentos (calendar_event_id) where calendar_event_id is not null;
create index if not exists planejamentos_data_idx on public.planejamentos (data desc, created_at desc);
alter table public.planejamentos enable row level security;
create policy "planejamentos_select" on public.planejamentos for select using (has_module_permission('agenda'));
grant select on public.planejamentos to authenticated;
create trigger trg_somente_leitura before insert or update or delete on public.planejamentos for each statement execute function public.bloquear_somente_leitura();

comment on table public.planejamentos is
  'Planejador HIPRO: um planejamento por paciente, da cliente (client_id) e opcionalmente do atendimento (calendar_event_id). estado = objeto completo do planejador. Escrito só por salvar_planejamento/excluir_planejamento.';

-- Cria (p_id nulo) ou atualiza. Chamado a cada alteração no planejador
-- (com intervalo), por isso só registra movimentação na criação.
create or replace function public.salvar_planejamento(
  p_id uuid,
  p_client_id uuid,
  p_calendar_event_id uuid,
  p_estado jsonb,
  p_total integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_e jsonb := coalesce(p_estado, '{}'::jsonb);
  v_data date;
  v_retorno date;
  v_saldo integer;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para salvar planejamentos.';
  end if;
  if jsonb_typeof(v_e) <> 'object' then
    raise exception 'Planejamento inválido.';
  end if;
  if pg_column_size(v_e) > 2000000 then
    raise exception 'Planejamento grande demais.';
  end if;
  begin v_data := nullif(v_e ->> 'data', '')::date; exception when others then v_data := null; end;
  begin v_retorno := nullif(v_e ->> 'dataRetorno', '')::date; exception when others then v_retorno := null; end;
  begin v_saldo := coalesce(nullif(v_e ->> 'saldoTotal', '')::integer, 0); exception when others then v_saldo := 0; end;

  if v_id is null then
    insert into planejamentos (client_id, calendar_event_id, paciente, data, data_retorno, procedimento, saldo_total, total_disparos, estado)
    values (p_client_id, p_calendar_event_id, nullif(btrim(v_e ->> 'paciente'), ''), coalesce(v_data, hoje_local()), v_retorno,
            nullif(btrim(v_e ->> 'procNome'), ''), v_saldo, greatest(coalesce(p_total, 0), 0), v_e)
    returning id into v_id;
    perform registrar_movimentacao('criado', 'planejamento', v_id,
      'Planejamento HIPRO criado' || coalesce(' para ' || nullif(btrim(v_e ->> 'paciente'), ''), ''),
      jsonb_build_object('client_id', p_client_id, 'calendar_event_id', p_calendar_event_id));
  else
    update planejamentos set
      client_id = p_client_id,
      calendar_event_id = p_calendar_event_id,
      paciente = nullif(btrim(v_e ->> 'paciente'), ''),
      data = coalesce(v_data, data),
      data_retorno = v_retorno,
      procedimento = nullif(btrim(v_e ->> 'procNome'), ''),
      saldo_total = v_saldo,
      total_disparos = greatest(coalesce(p_total, 0), 0),
      estado = v_e,
      updated_at = now()
    where id = v_id;
    if not found then raise exception 'Planejamento não encontrado.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.excluir_planejamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente text;
begin
  if not has_module_permission('agenda') then
    raise exception 'Sem permissão para excluir planejamentos.';
  end if;
  delete from planejamentos where id = p_id returning paciente into v_paciente;
  if not found then raise exception 'Planejamento não encontrado.'; end if;
  perform registrar_movimentacao('excluido', 'planejamento', p_id,
    'Planejamento HIPRO excluído' || coalesce(' (' || v_paciente || ')', ''), '{}'::jsonb);
end;
$$;

revoke execute on function public.salvar_planejamento(uuid, uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.salvar_planejamento(uuid, uuid, uuid, jsonb, integer) to authenticated, service_role;
revoke execute on function public.excluir_planejamento(uuid) from public, anon;
grant execute on function public.excluir_planejamento(uuid) to authenticated, service_role;
