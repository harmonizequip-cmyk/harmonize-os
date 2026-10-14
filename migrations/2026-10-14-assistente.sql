-- ============================================================
-- ASSISTENTE (IA dentro do Harmonize), etapa 1: só perguntas.
--
-- STATUS: AGUARDANDO O DONO
--
-- O assistente roda na Edge Function "assistente", com o login de quem
-- pergunta (RLS vale para ele igual vale para a tela). Aqui ficam:
--   - assistente_memoria: o que o dono ensinou ("quando eu falar a Luci é a
--     Dra. Luci Lima"). Lida a cada pergunta. Com client_id, é memória daquele
--     cliente (preferências, combinados, jeito de falar).
--   - assistente_conversas: histórico das conversas, por pessoa; client_id
--     amarra a conversa a um cliente (ex.: respostas de WhatsApp para ele).
--   - assistente_uso: tokens e custo estimado de cada resposta (gasto do mês).
--   - assistente_consultar(sql): roda uma consulta SELECT em modo só leitura,
--     com os direitos de quem está logado. É assim que a IA lê os dados.
-- ============================================================

create table if not exists public.assistente_memoria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  texto text not null check (length(trim(texto)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists assistente_memoria_user_idx on public.assistente_memoria (user_id, created_at);
create index if not exists assistente_memoria_cliente_idx on public.assistente_memoria (client_id) where client_id is not null;
alter table public.assistente_memoria enable row level security;
create policy "assistente_memoria_select" on public.assistente_memoria for select using (user_id = auth.uid());
create policy "assistente_memoria_insert" on public.assistente_memoria for insert with check (user_id = auth.uid());
create policy "assistente_memoria_delete" on public.assistente_memoria for delete using (user_id = auth.uid());
grant select, insert, delete on public.assistente_memoria to authenticated;

create table if not exists public.assistente_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  titulo text not null default 'Conversa',
  mensagens jsonb not null default '[]'::jsonb check (jsonb_typeof(mensagens) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistente_conversas_user_idx on public.assistente_conversas (user_id, updated_at desc);
create index if not exists assistente_conversas_cliente_idx on public.assistente_conversas (client_id, updated_at desc) where client_id is not null;
alter table public.assistente_conversas enable row level security;
create policy "assistente_conversas_select" on public.assistente_conversas for select using (user_id = auth.uid());
create policy "assistente_conversas_insert" on public.assistente_conversas for insert with check (user_id = auth.uid());
create policy "assistente_conversas_update" on public.assistente_conversas for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "assistente_conversas_delete" on public.assistente_conversas for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.assistente_conversas to authenticated;

create table if not exists public.assistente_uso (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  conversa_id uuid references public.assistente_conversas(id) on delete set null,
  modelo text not null,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  tokens_cache_leitura integer not null default 0,
  tokens_cache_escrita integer not null default 0,
  custo_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists assistente_uso_user_idx on public.assistente_uso (user_id, created_at);
alter table public.assistente_uso enable row level security;
create policy "assistente_uso_select" on public.assistente_uso for select using (user_id = auth.uid() or has_module_permission('configuracoes'));
create policy "assistente_uso_insert" on public.assistente_uso for insert with check (user_id = auth.uid());
grant select, insert on public.assistente_uso to authenticated;

create trigger trg_somente_leitura before insert or update or delete on public.assistente_memoria for each statement execute function public.bloquear_somente_leitura();
create trigger trg_somente_leitura before insert or update or delete on public.assistente_conversas for each statement execute function public.bloquear_somente_leitura();
create trigger trg_somente_leitura before insert or update or delete on public.assistente_uso for each statement execute function public.bloquear_somente_leitura();

-- Consulta da IA. security invoker: roda com o login de quem pergunta, então
-- a RLS de cada tabela vale (Pessoal só para quem tem a permissão etc.).
-- Três travas contra gravação: só aceita um SELECT/WITH sem ";", a consulta
-- vai dentro de uma subconsulta (onde INSERT/UPDATE/DELETE não entram) e a
-- transação vira somente leitura antes de rodar.
create or replace function public.assistente_consultar(p_sql text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sql text := btrim(regexp_replace(coalesce(p_sql, ''), ';\s*$', ''));
  v_res jsonb;
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and active and not somente_leitura
  ) then
    raise exception 'Sem acesso ao assistente.';
  end if;
  if v_sql !~* '^(select|with)\s' then
    raise exception 'Só consultas SELECT.';
  end if;
  if position(';' in v_sql) > 0 then
    raise exception 'Uma consulta por vez, sem ";".';
  end if;
  if v_sql ~* '(\mvault\M|\mauth\s*\.|\mpg_|\mset_config\M|\mdblink|\mlo_|\mcurrent_setting\M|push_inscricoes|webauthn|alertas_segredos|\mcopy\M)' then
    raise exception 'Essa consulta usa algo que o assistente não pode ler.';
  end if;

  perform set_config('transaction_read_only', 'on', true);

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) q limit 201) t',
    v_sql
  ) into v_res;
  return v_res;
end;
$$;

revoke execute on function public.assistente_consultar(text) from public, anon;
grant execute on function public.assistente_consultar(text) to authenticated, service_role;

comment on function public.assistente_consultar(text) is
  'Consulta só leitura da IA do Harmonize (Edge Function assistente). Roda com o login de quem pergunta (RLS vale), aceita só um SELECT/WITH, dentro de subconsulta e em transação somente leitura. Devolve até 201 linhas em JSON.';
