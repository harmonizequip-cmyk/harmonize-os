-- Desconto de parceiro (28/11/2026, pedido do dono): cada cliente parceira pode
-- ter um percentual de desconto que a calculadora aplica sozinho como
-- "Cupom PARCEIRO (N%)". Vazio = só parceira (sem desconto), como antes.
alter table public.clients
  add column if not exists desconto_parceiro numeric(5,2);
alter table public.clients
  drop constraint if exists clients_desconto_parceiro_faixa;
alter table public.clients
  add constraint clients_desconto_parceiro_faixa
  check (desconto_parceiro is null or (desconto_parceiro > 0 and desconto_parceiro <= 100));
comment on column public.clients.desconto_parceiro is
  'Percentual de desconto de parceiro (0 a 100), aplicado sozinho na calculadora como "Cupom PARCEIRO". Nulo = sem desconto.';
