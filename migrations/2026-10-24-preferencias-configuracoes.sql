-- Preferências configuráveis em Configurações (24/10/2026, pedido do dono).
-- Uma coluna jsonb só em settings guarda os números, listas e chaves que antes
-- estavam fixos no código (meta do mês, cadência do Relacionamento, encaixe,
-- deslocamento, listas, avisos do Dashboard, planejador, recibo). Os valores
-- padrão e a validação ficam em lib/preferencias.ts: coluna vazia = padrão de
-- sempre, então nada muda até o dono salvar alguma coisa.
-- Não apaga nem altera dados existentes.

alter table public.settings
  add column if not exists preferencias jsonb not null default '{}'::jsonb;

alter table public.settings
  drop constraint if exists settings_preferencias_objeto;
alter table public.settings
  add constraint settings_preferencias_objeto check (jsonb_typeof(preferencias) = 'object');

comment on column public.settings.preferencias is
  'Preferências de Configurações em JSON (metas, relacionamento, encaixe, deslocamento, listas, dashboard, planejador, recibo). Padrões em lib/preferencias.ts.';
