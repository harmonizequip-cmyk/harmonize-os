-- Cidades onde a cliente também atende (pedido do dono, 10/11/2026). A cidade
-- principal continua em clients.city; as outras ficam aqui, uma por item, e
-- servem para escolher a cidade nas Melhores datas e no Encaixe. Só uma coluna
-- nova; nenhum dado existente muda.
alter table public.clients add column if not exists cidades_extras text[] not null default '{}';
comment on column public.clients.cidades_extras is
  'Outras cidades onde a cliente atende, além de city. Melhores datas deixa escolher entre elas; o Encaixe usa a mais perto.';
