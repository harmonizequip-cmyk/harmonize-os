-- Item 7: indicação. Guarda quem indicou cada cliente/lead (outro cliente
-- já cadastrado). Só registro por enquanto: o benefício ao indicador será
-- definido depois. Se o indicador for excluído, o vínculo some e o
-- indicado continua cadastrado.
alter table public.clients
  add column if not exists indicado_por uuid references public.clients(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_indicado_por_nao_proprio'
  ) then
    alter table public.clients
      add constraint clients_indicado_por_nao_proprio check (indicado_por is null or indicado_por <> id);
  end if;
end $$;

create index if not exists clients_indicado_por_idx on public.clients (indicado_por) where indicado_por is not null;

comment on column public.clients.indicado_por is
  'Cliente que indicou este cadastro (opcional). Base para contar indicações e, no futuro, conceder benefício.';
