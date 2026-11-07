-- Tabela de preço antiga por cliente (pedido do dono, 07/11/2026): quem tem a
-- marca abre a calculadora, a edição da locação e o contrato pela tabela antiga
-- (aluguel R$ 497 + R$ 0,12/0,10/0,08 por disparo, mínimo 15.000). Só uma
-- coluna nova; nenhum dado existente muda.
alter table public.clients add column if not exists tabela_antiga boolean not null default false;
comment on column public.clients.tabela_antiga is
  'Cliente ainda na tabela de preço antiga (aluguel R$ 497 + disparo). A calculadora abre nela, com opção de trocar na locação.';
