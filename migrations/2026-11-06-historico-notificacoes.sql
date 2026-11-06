-- Histórico das notificações enviadas ao celular (pedido do dono, 05/11/2026).
-- Quem grava são as Edge Functions (alertas e cadastro-cliente, com service_role);
-- o app só lê e marca como lida. Guarda 90 dias.

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'aviso',
  titulo text not null,
  texto text,
  url text,
  criada_em timestamptz not null default now(),
  lida_em timestamptz
);
create index if not exists notificacoes_criada_em_idx on public.notificacoes (criada_em desc);

alter table public.notificacoes enable row level security;
drop policy if exists "notificacoes_select" on public.notificacoes;
create policy "notificacoes_select" on public.notificacoes for select using (has_module_permission('dashboard'));
revoke all on public.notificacoes from anon;
grant select on public.notificacoes to authenticated;
grant all on public.notificacoes to service_role;

drop trigger if exists trg_somente_leitura on public.notificacoes;
create trigger trg_somente_leitura before insert or update or delete on public.notificacoes
  for each statement execute function public.bloquear_somente_leitura();

-- Limpeza: depois de cada gravação, some o que tem mais de 90 dias.
create or replace function public.notificacoes_limpar_antigas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from notificacoes where criada_em < now() - interval '90 days';
  return null;
end;
$$;
revoke execute on function public.notificacoes_limpar_antigas() from public, anon, authenticated;
drop trigger if exists trg_notificacoes_limpar on public.notificacoes;
create trigger trg_notificacoes_limpar after insert on public.notificacoes
  for each statement execute function public.notificacoes_limpar_antigas();

-- Marca uma notificação (ou todas, sem id) como lida.
create or replace function public.marcar_notificacoes_lidas(p_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not has_module_permission('dashboard') then
    raise exception 'Sem permissão.';
  end if;
  update notificacoes set lida_em = now()
   where lida_em is null and (p_id is null or id = p_id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.marcar_notificacoes_lidas(uuid) from public, anon;
grant execute on function public.marcar_notificacoes_lidas(uuid) to authenticated, service_role;
