-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 08/10/2026, pelo dono, e conferida por consulta de leitura.
-- A Edge Function "alertas" (supabase/functions/alertas) foi publicada no mesmo dia.
--
-- Avisos no celular (notificação do próprio Harmonize, web push).
--   1. push_inscricoes: cada aparelho que tocou em "Ativar avisos" em
--      Configurações. Guarda só o endereço de entrega do navegador, nenhum
--      dado de cliente. Cada usuário vê e mexe só nas próprias linhas.
--   2. alertas_segredos(): entrega à função de envio (Edge Function
--      "alertas", que roda como service_role) a chave privada de envio e o
--      segredo do relógio, guardados no cofre (vault) do Supabase. Ninguém
--      logado nem anônimo consegue chamar.
--   3. Relógio (pg_cron + pg_net): 7h30 manda o resumo do dia e 18h manda
--      as reservas de amanhã (10:30 e 21:00 em UTC; Brasília é UTC-3).
--
-- Os segredos (chave privada VAPID e segredo do relógio) NÃO ficam neste
-- arquivo: entram no cofre por um bloco à parte, só na página de SQL do dono.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  created_at timestamptz not null default now(),
  ultimo_envio timestamptz
);

comment on table public.push_inscricoes is
  'Aparelhos inscritos para receber avisos do Harmonize (web push). Uma linha por navegador/celular. A função alertas remove sozinha a inscrição que o navegador recusar (404/410).';

alter table public.push_inscricoes enable row level security;

drop policy if exists "push_inscricoes_select" on public.push_inscricoes;
drop policy if exists "push_inscricoes_insert" on public.push_inscricoes;
drop policy if exists "push_inscricoes_update" on public.push_inscricoes;
drop policy if exists "push_inscricoes_delete" on public.push_inscricoes;
create policy "push_inscricoes_select" on public.push_inscricoes for select using (user_id = auth.uid());
create policy "push_inscricoes_insert" on public.push_inscricoes for insert with check (user_id = auth.uid());
create policy "push_inscricoes_update" on public.push_inscricoes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_inscricoes_delete" on public.push_inscricoes for delete using (user_id = auth.uid());

-- plpgsql (e não sql) para o corpo só ser conferido na hora de rodar: o
-- schema.sql também carrega num Postgres sem o cofre do Supabase.
create or replace function public.alertas_segredos()
returns table(vapid_private text, segredo text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'harmonize_vapid_private'),
      (select decrypted_secret from vault.decrypted_secrets where name = 'harmonize_alertas_segredo');
end;
$$;

revoke execute on function public.alertas_segredos() from public, anon, authenticated;
grant execute on function public.alertas_segredos() to service_role;

-- Relógio. Recria os dois horários do zero para poder rodar de novo sem duplicar.
select cron.unschedule(jobid) from cron.job where jobname in ('harmonize-alerta-manha', 'harmonize-alerta-vespera');

select cron.schedule(
  'harmonize-alerta-manha',
  '30 10 * * *',
  $cron$
  select net.http_post(
    url := 'https://vidnlzbxaxjlmzncqhxw.supabase.co/functions/v1/alertas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerta-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'harmonize_alertas_segredo')
    ),
    body := jsonb_build_object('tipo', 'resumo')
  );
  $cron$
);

select cron.schedule(
  'harmonize-alerta-vespera',
  '0 21 * * *',
  $cron$
  select net.http_post(
    url := 'https://vidnlzbxaxjlmzncqhxw.supabase.co/functions/v1/alertas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerta-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'harmonize_alertas_segredo')
    ),
    body := jsonb_build_object('tipo', 'vespera')
  );
  $cron$
);
