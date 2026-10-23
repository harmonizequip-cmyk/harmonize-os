-- Anotações da cliente e dossiê para o assistente (23/10/2026, pedido do dono).
-- 1. cliente_anotacoes: histórico de anotações curtas (digitadas, por voz ou
--    guardadas pelo assistente), cada uma com data e hora. Só se cria e apaga
--    pelas funções; não há edição, para o histórico ficar fiel.
-- 2. dossie_cliente(id): junta tudo o que existe da cliente numa consulta só,
--    para o assistente ler antes de responder sobre ela.
-- Não apaga nem altera dados existentes.

create table if not exists public.cliente_anotacoes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  texto text not null check (length(trim(texto)) between 1 and 2000),
  origem text not null default 'digitada' check (origem in ('digitada', 'voz', 'assistente')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cliente_anotacoes_cliente_idx
  on public.cliente_anotacoes (client_id, created_at desc);

comment on table public.cliente_anotacoes is
  'Anotações da cliente com data e hora. Escrita só por salvar_anotacao_cliente e excluir_anotacao_cliente.';

alter table public.cliente_anotacoes enable row level security;
drop policy if exists "cliente_anotacoes_select" on public.cliente_anotacoes;
create policy "cliente_anotacoes_select" on public.cliente_anotacoes for select
  using (has_module_permission('clientes'));
grant select on public.cliente_anotacoes to authenticated;

drop trigger if exists trg_somente_leitura on public.cliente_anotacoes;
create trigger trg_somente_leitura before insert or update or delete on public.cliente_anotacoes
  for each statement execute function public.bloquear_somente_leitura();

create or replace function public.salvar_anotacao_cliente(
  p_client_id uuid,
  p_texto text,
  p_origem text default 'digitada'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := trim(coalesce(p_texto, ''));
  v_origem text := coalesce(nullif(trim(p_origem), ''), 'digitada');
  v_nome text;
  v_id uuid;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para anotar em clientes.';
  end if;
  if v_texto = '' then
    raise exception 'Escreva ou fale a anotação.';
  end if;
  if length(v_texto) > 2000 then
    raise exception 'Anotação longa demais (máximo 2.000 caracteres).';
  end if;
  if v_origem not in ('digitada', 'voz', 'assistente') then
    raise exception 'Origem inválida.';
  end if;
  select name into v_nome from clients where id = p_client_id;
  if v_nome is null then
    raise exception 'Cliente não encontrada.';
  end if;

  insert into cliente_anotacoes (client_id, texto, origem, created_by)
  values (p_client_id, v_texto, v_origem, auth.uid())
  returning id into v_id;

  perform registrar_movimentacao('criado', 'cliente', p_client_id,
    'Anotação em ' || v_nome || ': ' || left(v_texto, 120),
    jsonb_build_object('anotacao_id', v_id, 'origem', v_origem));
  return v_id;
end;
$$;

create or replace function public.excluir_anotacao_cliente(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a cliente_anotacoes%rowtype;
  v_nome text;
begin
  if not has_module_permission('clientes') then
    raise exception 'Sem permissão para apagar anotações.';
  end if;
  select * into v_a from cliente_anotacoes where id = p_id;
  if not found then
    raise exception 'Anotação não encontrada.';
  end if;
  select name into v_nome from clients where id = v_a.client_id;

  delete from cliente_anotacoes where id = p_id;

  perform registrar_movimentacao('excluido', 'cliente', v_a.client_id,
    'Anotação apagada de ' || coalesce(v_nome, 'cliente') || ': ' || left(v_a.texto, 120),
    jsonb_build_object('anotacao_id', p_id, 'texto', v_a.texto, 'criada_em', v_a.created_at));
end;
$$;

-- Dossiê: security invoker, então quem chama só vê o que já pode ver (RLS).
-- Listas têm limite para o texto não crescer sem fim; o resumo usa tudo.
create or replace function public.dossie_cliente(p_client_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
cli as (select * from clients where id = p_client_id),
loc as (
  select r.*, e.name as equipamento, s.saldo, s.total_pago, s.valor_devido, s.situacao, s.credito_taxa
    from rentals r
    left join equipments e on e.id = r.equipment_id
    left join rentals_situacao_pagamento s on s.rental_id = r.id
   where r.client_id = p_client_id and not r.is_test
),
loc_ok as (select * from loc where status::text <> 'cancelada'),
ev as (
  select ce.*, e.name as equipamento
    from calendar_events ce
    left join equipments e on e.id = ce.equipment_id
   where ce.client_id = p_client_id and not ce.is_test
),
datas as (select event_date, lag(event_date) over (order by event_date) as anterior from loc_ok)
select jsonb_build_object(
  'gerado_em', now(),
  'cadastro', (select to_jsonb(c) - 'is_test' from cli c),
  'indicada_por', (select i.name from clients i join cli c on i.id = c.indicado_por),
  'indicou', coalesce((select jsonb_agg(x.name order by x.created_at) from clients x where x.indicado_por = p_client_id), '[]'::jsonb),
  'resumo', jsonb_build_object(
    'locacoes', (select count(*) from loc_ok),
    'canceladas', (select count(*) from loc where status::text = 'cancelada'),
    'faturado_total', (select coalesce(sum(valor_devido), 0) from loc_ok),
    'recebido_total', (select coalesce(sum(total_pago + credito_taxa), 0) from loc_ok),
    'deve_hoje', (select coalesce(sum(saldo), 0) from loc_ok where event_date <= current_date),
    'disparos_total', (select coalesce(sum(shots), 0) from loc_ok),
    'disparos_media', (select round(avg(shots)) from loc_ok where shots > 0),
    'ticket_medio', (select round(avg(valor_devido), 2) from loc_ok),
    'primeira_locacao', (select min(event_date) from loc_ok),
    'ultima_locacao', (select max(event_date) from loc_ok where event_date <= current_date),
    'dias_desde_ultima', (select current_date - max(event_date) from loc_ok where event_date <= current_date),
    'intervalo_medio_dias', (select round(avg(event_date - anterior)) from datas where anterior is not null),
    'proxima_reserva', (select min(date_start) from ev where date_start >= current_date and status::text <> 'cancelada'),
    'reagendamentos', (select count(*) from ev where rescheduled),
    'faltas', (select count(*) from ev where no_show),
    'taxas_pagas', (select count(*) from ev where taxa_status = 'paga'),
    'taxas_pendentes', (select count(*) from ev where taxa_status = 'pendente' and status::text <> 'cancelada')
  ),
  'anotacoes', coalesce((
    select jsonb_agg(jsonb_build_object('em', a.created_at, 'origem', a.origem, 'texto', a.texto) order by a.created_at desc)
      from (select * from cliente_anotacoes where client_id = p_client_id order by created_at desc limit 40) a
  ), '[]'::jsonb),
  'memorias_do_assistente', coalesce((
    select jsonb_agg(jsonb_build_object('em', m.created_at, 'texto', m.texto) order by m.created_at desc)
      from (select * from assistente_memoria where client_id = p_client_id order by created_at desc limit 30) m
  ), '[]'::jsonb),
  'agendamentos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'data', x.date_start, 'ate', x.date_end, 'tipo', x.event_type, 'titulo', x.title,
             'equipamento', x.equipamento, 'status', x.status, 'confirmado', x.confirmed,
             'taxa', x.taxa_status, 'taxa_valor', x.taxa_valor, 'deslocamento', x.valor_deslocamento,
             'virou_locacao', x.rental_id is not null, 'reagendado', x.rescheduled, 'faltou', x.no_show,
             'motivo_cancelamento', x.cancellation_reason, 'pedido_confirmacao_em', x.confirmation_message_sent_at,
             'obs', left(x.notes, 300)) order by x.date_start desc)
      from (select * from ev order by date_start desc limit 30) x
  ), '[]'::jsonb),
  'locacoes', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'data', x.event_date, 'ate', x.event_date_end, 'equipamento', x.equipamento,
             'disparos', x.shots, 'valor', x.calculated_value, 'deslocamento', x.valor_deslocamento,
             'devido', x.valor_devido, 'pago', x.total_pago, 'saldo', x.saldo, 'situacao', x.situacao,
             'status', x.status, 'lucro', (select l.lucro_liquido from rentals_lucro l where l.rental_id = x.id),
             'motivo_cancelamento', x.cancellation_reason, 'obs', left(x.notes, 300)) order by x.event_date desc)
      from (select * from loc order by event_date desc limit 30) x
  ), '[]'::jsonb),
  'pagamentos', coalesce((
    select jsonb_agg(jsonb_build_object('data', p.data, 'valor', p.valor, 'forma', p.forma, 'locacao_id', p.rental_id) order by p.data desc)
      from (select rp.* from rental_payments rp join loc on loc.id = rp.rental_id
             where not rp.is_test order by rp.data desc limit 30) p
  ), '[]'::jsonb),
  'creditos', jsonb_build_object(
    'saldo', (select to_jsonb(s) - 'client_id' from creditos_saldo s where s.client_id = p_client_id),
    'extrato', coalesce((
      select jsonb_agg(jsonb_build_object('data', k.data, 'tipo', k.tipo, 'quantidade', k.quantidade, 'origem', k.origem, 'descricao', k.descricao) order by k.data desc)
        from (select * from creditos_cliente where client_id = p_client_id order by data desc, created_at desc limit 20) k
    ), '[]'::jsonb)
  ),
  'lancamentos', coalesce((
    select jsonb_agg(jsonb_build_object('data', t.date, 'tipo', t.type, 'valor', t.amount, 'categoria', t.categoria,
             'descricao', t.description, 'forma', t.payment_method, 'espaco', t.scope) order by t.date desc)
      from (select tr.*, cat.name as categoria from transactions tr left join categories cat on cat.id = tr.category_id
             where tr.client_id = p_client_id and not tr.is_test order by tr.date desc limit 25) t
  ), '[]'::jsonb),
  'tarefas', coalesce((
    select jsonb_agg(jsonb_build_object('tipo', t.type, 'titulo', t.title, 'para', t.due_date, 'status', t.status, 'concluida_em', t.completed_at) order by t.due_date desc)
      from (select * from tasks where client_id = p_client_id and not is_test order by due_date desc limit 20) t
  ), '[]'::jsonb),
  'agendas_enviadas', coalesce((
    select jsonb_agg(jsonb_build_object('em', a.enviado_em, 'de', a.periodo_inicio, 'ate', a.periodo_fim, 'mensagem', left(a.mensagem, 300)) order by a.enviado_em desc)
      from (select * from agenda_envios where client_id = p_client_id order by enviado_em desc limit 10) a
  ), '[]'::jsonb),
  'planejamentos', coalesce((
    select jsonb_agg(jsonb_build_object('paciente', p.paciente, 'data', p.data, 'retorno', p.data_retorno, 'procedimento', p.procedimento,
             'pacote', p.saldo_total, 'disparos', p.total_disparos) order by p.data desc nulls last)
      from (select * from planejamentos where client_id = p_client_id order by data desc nulls last limit 20) p
  ), '[]'::jsonb),
  'mentorias', coalesce((
    select jsonb_agg(jsonb_build_object('data', m.date, 'mentorada', m.mentee_name, 'valor', m.value, 'obs', left(m.notes, 300)) order by m.date desc)
      from (select me.* from mentoring_events me join ev on ev.id = me.calendar_event_id
             where not me.is_test order by me.date desc limit 20) m
  ), '[]'::jsonb),
  'historico', coalesce((
    select jsonb_agg(jsonb_build_object('em', h.ocorrido_em, 'acao', h.acao, 'o_que', h.entidade, 'descricao', h.descricao) order by h.ocorrido_em desc)
      from (select * from movimentacoes
             where (entidade_id = p_client_id
                    or entidade_id in (select id from loc)
                    or entidade_id in (select id from ev))
               and not detalhes ? 'anotacao_id'
             order by ocorrido_em desc limit 25) h
  ), '[]'::jsonb)
)
where exists (select 1 from cli);
$$;

comment on function public.dossie_cliente(uuid) is
  'Tudo o que existe de uma cliente (cadastro, anotações, agenda, locações, pagamentos, créditos, lançamentos, tarefas, planejamentos, histórico) em JSON, para o assistente.';

revoke execute on function public.salvar_anotacao_cliente(uuid, text, text) from public, anon;
revoke execute on function public.excluir_anotacao_cliente(uuid) from public, anon;
revoke execute on function public.dossie_cliente(uuid) from public, anon;
grant execute on function public.salvar_anotacao_cliente(uuid, text, text) to authenticated, service_role;
grant execute on function public.excluir_anotacao_cliente(uuid) to authenticated, service_role;
grant execute on function public.dossie_cliente(uuid) to authenticated, service_role;
