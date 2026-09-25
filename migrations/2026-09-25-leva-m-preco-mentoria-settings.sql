-- ============================================================
-- LEVA M: preço da mentoria em settings
--
-- CONTEXTO
-- Mentoria tem cobrança de verdade, por paciente modelo: R$1.500,00
-- quando o pagamento é parcelado no crédito (até 10x), ou R$1.200,00
-- em qualquer outra forma de pagamento ("à vista"). Confirmado em
-- 25/09/2026. Antes disso a is_mentoria (leva K) tinha sido escopada
-- só como destaque visual, sem cobrança — corrigido aqui.
--
-- Segue o mesmo padrão já usado para o preço do HIPRO Day (settings.
-- flat_package_value etc.): os dois valores ficam em settings, editáveis
-- em Configurações, com fallback fixo em lib/rental-pricing.ts
-- (DEFAULT_MENTORIA_PRICING) para telas que não carregarem settings.
-- ============================================================

alter table public.settings
  add column if not exists mentoria_valor_avista numeric(10,2) not null default 1200.00,
  add column if not exists mentoria_valor_parcelado numeric(10,2) not null default 1500.00;

comment on column public.settings.mentoria_valor_avista is
  'Valor cobrado por paciente modelo em mentoria, em qualquer forma de pagamento exceto crédito parcelado ("à vista"). R$1.200,00 confirmado em 25/09/2026.';
comment on column public.settings.mentoria_valor_parcelado is
  'Valor cobrado por paciente modelo em mentoria, quando o pagamento é "credito" (parcelado em até 10x). R$1.500,00 confirmado em 25/09/2026.';
