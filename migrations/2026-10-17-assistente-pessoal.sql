-- Assistente do Pessoal (17/10/2026): separa memória e conversas por espaço
-- (harmonize ou pessoal) e cria o orçamento mensal por categoria do Pessoal.
-- Não apaga nem altera dados existentes: tudo que já existe fica 'harmonize'.

alter table public.assistente_memoria
  add column if not exists escopo text not null default 'harmonize';
alter table public.assistente_conversas
  add column if not exists escopo text not null default 'harmonize';

alter table public.assistente_memoria drop constraint if exists assistente_memoria_escopo_check;
alter table public.assistente_memoria
  add constraint assistente_memoria_escopo_check check (escopo in ('harmonize', 'pessoal'));
alter table public.assistente_conversas drop constraint if exists assistente_conversas_escopo_check;
alter table public.assistente_conversas
  add constraint assistente_conversas_escopo_check check (escopo in ('harmonize', 'pessoal'));

create index if not exists assistente_conversas_escopo_idx
  on public.assistente_conversas (user_id, escopo, updated_at desc);

-- Orçamento mensal por categoria (só gastos pessoais).
create table if not exists public.orcamentos_pessoais (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (length(trim(categoria)) between 1 and 80),
  limite numeric(12,2) not null check (limite > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists orcamentos_pessoais_categoria_uk
  on public.orcamentos_pessoais (lower(trim(categoria)));

comment on table public.orcamentos_pessoais is
  'Limite mensal de gasto por categoria do Pessoal. Escrito só por salvar_orcamento_pessoal.';

alter table public.orcamentos_pessoais enable row level security;
drop policy if exists "orcamentos_pessoais_select" on public.orcamentos_pessoais;
create policy "orcamentos_pessoais_select" on public.orcamentos_pessoais for select
  using (has_module_permission('pessoal'));
grant select on public.orcamentos_pessoais to authenticated;

drop trigger if exists trg_somente_leitura on public.orcamentos_pessoais;
create trigger trg_somente_leitura before insert or update or delete on public.orcamentos_pessoais
  for each statement execute function public.bloquear_somente_leitura();

-- Define (ou troca) o limite de uma categoria; limite nulo ou zero remove.
create or replace function public.salvar_orcamento_pessoal(p_categoria text, p_limite numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat text := trim(coalesce(p_categoria, ''));
  v_id uuid;
begin
  if not has_module_permission('pessoal') then
    raise exception 'Sem permissão para mexer no orçamento pessoal.';
  end if;
  if v_cat = '' then
    raise exception 'Informe a categoria.';
  end if;

  if p_limite is null or p_limite <= 0 then
    delete from orcamentos_pessoais where lower(trim(categoria)) = lower(v_cat) returning id into v_id;
    if v_id is not null then
      perform public.registrar_movimentacao('excluido', 'orcamentos_pessoais', v_id, 'Orçamento pessoal: ' || v_cat, '{}'::jsonb);
    end if;
    return;
  end if;

  update orcamentos_pessoais set limite = p_limite, categoria = v_cat
   where lower(trim(categoria)) = lower(v_cat)
   returning id into v_id;
  if v_id is null then
    insert into orcamentos_pessoais (categoria, limite) values (v_cat, p_limite) returning id into v_id;
    perform public.registrar_movimentacao('criado', 'orcamentos_pessoais', v_id, 'Orçamento pessoal: ' || v_cat, jsonb_build_object('limite', p_limite));
  else
    perform public.registrar_movimentacao('editado', 'orcamentos_pessoais', v_id, 'Orçamento pessoal: ' || v_cat, jsonb_build_object('limite', p_limite));
  end if;
end;
$$;

revoke execute on function public.salvar_orcamento_pessoal(text, numeric) from public, anon;
grant execute on function public.salvar_orcamento_pessoal(text, numeric) to authenticated, service_role;
