-- ============================================================
-- CÉREBRO (tela /insights): insights gerados pela IA a partir dos dados
--
-- STATUS: AGUARDANDO O DONO
--
-- A Edge Function "assistente" (modo insights) lê o banco com o login do
-- dono, cruza com o que sabe de mercado e grava aqui cada insight: o que os
-- dados mostram, por que importa, o próximo passo e os números que
-- sustentam. O dono marca "Fiz", "Útil / Não útil" ou arquiva; a IA lê os
-- anteriores para não repetir e para saber o tipo de ideia que serve.
-- Dados do próprio dono (como assistente_memoria): RLS por user_id.
-- ============================================================

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  categoria text not null check (categoria in ('prospeccao', 'relacionamento', 'vendas', 'financeiro', 'agenda', 'marketing', 'operacao')),
  titulo text not null check (length(trim(titulo)) between 1 and 160),
  texto text not null check (length(trim(texto)) between 1 and 1500),
  acao text check (acao is null or length(acao) <= 1200),
  evidencia text check (evidencia is null or length(evidencia) <= 800),
  impacto smallint not null default 2 check (impacto between 1 and 3),
  client_ids uuid[] not null default '{}',
  status text not null default 'novo' check (status in ('novo', 'feito', 'arquivado')),
  util boolean,
  created_at timestamptz not null default now(),
  resolvido_em timestamptz
);
create index if not exists insights_user_idx on public.insights (user_id, status, created_at desc);
alter table public.insights enable row level security;
create policy "insights_select" on public.insights for select using (user_id = auth.uid());
create policy "insights_insert" on public.insights for insert with check (user_id = auth.uid());
create policy "insights_update" on public.insights for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "insights_delete" on public.insights for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.insights to authenticated;
create trigger trg_somente_leitura before insert or update or delete on public.insights for each statement execute function public.bloquear_somente_leitura();

comment on table public.insights is
  'Cérebro: insights gerados pela IA (Edge Function assistente, modo insights) com o próximo passo. status novo/feito/arquivado e util (avaliação do dono) orientam as próximas gerações.';
