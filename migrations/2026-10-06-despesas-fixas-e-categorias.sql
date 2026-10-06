-- ============================================================
-- STATUS: ESCRITA, AINDA NÃO APLICADA (aguarda o dono rodar).
--
-- Quadro "Este mês" do Dashboard: quanto falta para pagar as contas fixas
-- do mês e quantas locações isso representa.
--   1. settings.despesas_fixas: lista editável em Configurações, cada item
--      {"nome": text, "valor": number, "tipo": "negocio" | "pessoal"}.
--   2. Categorias de saída novas: "Parcela de equipamento" e "Impostos",
--      para tirar de "Outros"/"Retiradas" o que não é nem uma coisa nem outra.
-- Não mexe em lançamentos (isso vai em scripts separados, com prévia).
-- ============================================================

alter table public.settings
  add column if not exists despesas_fixas jsonb not null default '[]'::jsonb;

alter table public.settings
  drop constraint if exists settings_despesas_fixas_lista;
alter table public.settings
  add constraint settings_despesas_fixas_lista check (jsonb_typeof(despesas_fixas) = 'array');

comment on column public.settings.despesas_fixas is
  'Contas fixas do mês, editadas em Configurações: [{"nome","valor","tipo": negocio|pessoal}]. Base do quadro "Este mês" do Dashboard.';

insert into public.categories (name, type, scope, is_default)
select v.name, 'saida', 'harmonize', true
  from (values ('Parcela de equipamento'), ('Impostos')) v(name)
 where not exists (
   select 1 from public.categories c
    where c.name = v.name and c.type = 'saida' and c.scope = 'harmonize'
 );
