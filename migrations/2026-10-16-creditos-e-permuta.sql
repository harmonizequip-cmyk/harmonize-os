-- ============================================================
-- CRÉDITOS DA CLIENTE (disparos e R$) E PERMUTA
--
-- STATUS: APLICADA (16/10/2026, conferida: 2 tabelas, view, 6 funções, forma permuta, anon sem execução, 2 gatilhos)
--
-- 1. Contagens da locação (locacao_contagens): a finalização pode ter mais
--    de uma contagem (troca de ponteira). Cada uma é "somar" (só entra no
--    total) ou "gerar crédito": a cliente paga tudo hoje e os disparos dessa
--    contagem viram crédito para a próxima. O crédito só vale depois que a
--    locação de origem estiver paga.
-- 2. creditos_cliente: extrato de crédito por cliente, em disparos ou em R$.
--    Entrada positiva, uso negativo. Usar crédito de disparos tira os
--    disparos antes de calcular o valor da locação (a tela calcula).
-- 3. Permuta (forma de pagamento nova): o parceiro paga com produto ou
--    serviço. Empresa: saída "Outros" com a observação. Pessoal: saída
--    "Retiradas" (que já espelha a entrada no Pessoal) e, no Pessoal, a
--    saída na categoria escolhida. O valor vira crédito em R$ e abate a
--    locação (pagamento com forma permuta). Permuta não mexe no saldo do
--    caixa (as telas tiram payment_method = 'permuta' do saldo).
-- ============================================================

alter type public.payment_method_type add value if not exists 'permuta';

create table if not exists public.locacao_contagens (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  ordem smallint not null check (ordem between 1 and 10),
  inicial bigint not null check (inicial >= 0),
  final bigint not null,
  gera_credito boolean not null default false,
  created_at timestamptz not null default now(),
  check (final > inicial),
  unique (rental_id, ordem)
);
create index if not exists locacao_contagens_rental_idx on public.locacao_contagens (rental_id);
alter table public.locacao_contagens enable row level security;
create policy "locacao_contagens_select" on public.locacao_contagens for select
  using (has_module_permission('agenda') or has_module_permission('financeiro') or has_module_permission('clientes'));
grant select on public.locacao_contagens to authenticated;
create trigger trg_somente_leitura before insert or update or delete on public.locacao_contagens for each statement execute function public.bloquear_somente_leitura();
comment on table public.locacao_contagens is
  'Contagens do equipamento numa locação (uma por ponteira). gera_credito = a cliente pagou e os disparos viram crédito. Escrita só por registrar_contagens_locacao.';

create table if not exists public.creditos_cliente (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  tipo text not null check (tipo in ('disparos', 'valor')),
  quantidade numeric(12, 2) not null check (quantidade <> 0),
  origem text not null check (origem in ('contagem', 'permuta', 'manual', 'uso')),
  rental_id uuid references public.rentals(id) on delete cascade,
  rental_payment_id uuid references public.rental_payments(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  descricao text check (descricao is null or length(descricao) <= 300),
  data date not null default public.hoje_local(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (tipo = 'valor' or quantidade = round(quantidade))
);
create index if not exists creditos_cliente_client_idx on public.creditos_cliente (client_id, created_at desc);
create index if not exists creditos_cliente_rental_idx on public.creditos_cliente (rental_id) where rental_id is not null;
alter table public.creditos_cliente enable row level security;
create policy "creditos_cliente_select" on public.creditos_cliente for select
  using (has_module_permission('agenda') or has_module_permission('financeiro') or has_module_permission('clientes'));
grant select on public.creditos_cliente to authenticated;
create trigger trg_somente_leitura before insert or update or delete on public.creditos_cliente for each statement execute function public.bloquear_somente_leitura();
comment on table public.creditos_cliente is
  'Extrato de crédito da cliente. tipo disparos (abate disparos da próxima locação) ou valor (R$, abate como pagamento permuta). Positivo = entrada, negativo = uso. Crédito de contagem só vale com a locação de origem paga (view creditos_saldo).';

-- Linha conta no saldo? Crédito de contagem só depois da locação de origem
-- paga; uso numa locação cancelada devolve o crédito.
create or replace function public.credito_conta(p_quantidade numeric, p_origem text, p_pago boolean, p_status text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_status = 'cancelada' then 'fora'
    when p_origem = 'contagem' and not coalesce(p_pago, false) then 'aguardando'
    else 'disponivel'
  end;
$$;

create or replace view public.creditos_saldo with (security_invoker = true) as
select c.client_id,
       coalesce(sum(c.quantidade) filter (where c.tipo = 'disparos' and credito_conta(c.quantidade, c.origem, r.pago, r.status::text) = 'disponivel'), 0)::integer as disparos_disponiveis,
       coalesce(sum(c.quantidade) filter (where c.tipo = 'disparos' and credito_conta(c.quantidade, c.origem, r.pago, r.status::text) = 'aguardando'), 0)::integer as disparos_aguardando,
       coalesce(sum(c.quantidade) filter (where c.tipo = 'valor' and credito_conta(c.quantidade, c.origem, r.pago, r.status::text) = 'disponivel'), 0)::numeric(12, 2) as valor_disponivel,
       max(c.created_at) as atualizado_em
  from creditos_cliente c
  left join rentals r on r.id = c.rental_id
 group by c.client_id;
grant select on public.creditos_saldo to authenticated;
comment on view public.creditos_saldo is
  'Saldo de crédito por cliente: disparos disponíveis, disparos aguardando o pagamento da locação de origem e R$ disponível.';

create or replace function public.saldo_credito_cliente(p_client_id uuid, p_tipo text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(c.quantidade), 0)
    from creditos_cliente c
    left join rentals r on r.id = c.rental_id
   where c.client_id = p_client_id and c.tipo = p_tipo
     and credito_conta(c.quantidade, c.origem, r.pago, r.status::text) = 'disponivel';
$$;

-- Depois de finalizar/criar a locação: grava as contagens, gera o crédito
-- das que forem "gerar crédito" e usa crédito de disparos (o valor da
-- locação já foi calculado pela tela sem esses disparos).
create or replace function public.registrar_contagens_locacao(p_rental_id uuid, p_contagens jsonb, p_credito_usado integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_status text;
  v_data date;
  v_item jsonb;
  v_ordem int := 0;
  v_ini bigint;
  v_fim bigint;
  v_credito bigint := 0;
  v_partes text := '';
  v_disp numeric;
begin
  if not (has_module_permission('agenda') or has_module_permission('financeiro')) then
    raise exception 'Sem permissão para registrar contagens.';
  end if;
  select client_id, status::text, event_date into v_client, v_status, v_data from rentals where id = p_rental_id;
  if v_client is null then raise exception 'Locação não encontrada.'; end if;
  if v_status = 'cancelada' then raise exception 'Locação cancelada.'; end if;
  if exists (select 1 from locacao_contagens where rental_id = p_rental_id)
     or exists (select 1 from creditos_cliente where rental_id = p_rental_id and origem in ('contagem', 'uso') and tipo = 'disparos') then
    raise exception 'As contagens desta locação já foram registradas.';
  end if;
  if jsonb_typeof(coalesce(p_contagens, '[]'::jsonb)) <> 'array' then raise exception 'Contagens inválidas.'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_contagens, '[]'::jsonb)) loop
    v_ordem := v_ordem + 1;
    v_ini := least((v_item ->> 'inicial')::bigint, (v_item ->> 'final')::bigint);
    v_fim := greatest((v_item ->> 'inicial')::bigint, (v_item ->> 'final')::bigint);
    if v_ini is null or v_fim is null or v_fim = v_ini then raise exception 'Contagem % incompleta.', v_ordem; end if;
    insert into locacao_contagens (rental_id, ordem, inicial, final, gera_credito)
    values (p_rental_id, v_ordem, v_ini, v_fim, coalesce((v_item ->> 'gera_credito')::boolean, false));
    if coalesce((v_item ->> 'gera_credito')::boolean, false) then
      v_credito := v_credito + (v_fim - v_ini);
      v_partes := v_partes || case when v_partes = '' then '' else ', ' end || 'contagem ' || v_ordem || ': ' || v_ini || ' a ' || v_fim;
    end if;
  end loop;

  if v_credito > 0 then
    insert into creditos_cliente (client_id, tipo, quantidade, origem, rental_id, descricao, data)
    values (v_client, 'disparos', v_credito, 'contagem', p_rental_id, 'Crédito de disparos (' || v_partes || ')', v_data);
  end if;

  if coalesce(p_credito_usado, 0) > 0 then
    v_disp := saldo_credito_cliente(v_client, 'disparos');
    if p_credito_usado > v_disp then
      raise exception 'A cliente tem % disparos de crédito disponíveis, menos que os % usados.', v_disp::int, p_credito_usado;
    end if;
    insert into creditos_cliente (client_id, tipo, quantidade, origem, rental_id, descricao, data)
    values (v_client, 'disparos', -p_credito_usado, 'uso', p_rental_id, 'Usado na locação de ' || to_char(v_data, 'DD/MM/YYYY'), v_data);
  end if;

  if v_ordem > 1 or v_credito > 0 or coalesce(p_credito_usado, 0) > 0 then
    perform registrar_movimentacao('editado', 'rentals', p_rental_id, descrever_registro('rentals', p_rental_id),
      jsonb_build_object('acao_detalhada', 'Contagens registradas', 'contagens', v_ordem, 'credito_gerado', v_credito, 'credito_usado', coalesce(p_credito_usado, 0), 'client_id', v_client));
  end if;
end;
$$;

-- Ajuste manual do crédito (disparos ou R$ sem permuta). Positivo dá, negativo tira.
create or replace function public.lancar_credito_cliente(p_client_id uuid, p_tipo text, p_quantidade numeric, p_descricao text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not has_module_permission('financeiro') then raise exception 'Sem permissão para lançar crédito.'; end if;
  if p_tipo not in ('disparos', 'valor') then raise exception 'Tipo de crédito inválido.'; end if;
  if coalesce(p_quantidade, 0) = 0 then raise exception 'Informe a quantidade.'; end if;
  if p_tipo = 'disparos' and p_quantidade <> round(p_quantidade) then raise exception 'Disparos são números inteiros.'; end if;
  if nullif(btrim(p_descricao), '') is null then raise exception 'Escreva o motivo do crédito.'; end if;
  if not exists (select 1 from clients where id = p_client_id) then raise exception 'Cliente não encontrada.'; end if;
  if p_quantidade < 0 and saldo_credito_cliente(p_client_id, p_tipo) + p_quantidade < 0 then
    raise exception 'O crédito disponível não cobre essa retirada.';
  end if;
  insert into creditos_cliente (client_id, tipo, quantidade, origem, descricao)
  values (p_client_id, p_tipo, p_quantidade, 'manual', btrim(p_descricao))
  returning id into v_id;
  perform registrar_movimentacao('editado', 'cliente', p_client_id, descrever_registro('clients', p_client_id),
    jsonb_build_object('acao_detalhada', 'Crédito lançado à mão', 'tipo', p_tipo, 'quantidade', p_quantidade, 'motivo', btrim(p_descricao)));
  return v_id;
end;
$$;

-- Usa crédito em R$ para abater uma locação: vira pagamento com forma permuta.
create or replace function public.usar_credito_valor(p_rental_id uuid, p_valor numeric, p_data date default public.hoje_local())
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_pag uuid;
begin
  if not has_module_permission('financeiro') then raise exception 'Sem permissão para usar crédito.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor.'; end if;
  select client_id into v_client from rentals where id = p_rental_id;
  if v_client is null then raise exception 'Locação não encontrada.'; end if;
  if round(p_valor, 2) > round(saldo_credito_cliente(v_client, 'valor'), 2) then
    raise exception 'A cliente tem R$ % de crédito, menos que R$ %.',
      to_char(saldo_credito_cliente(v_client, 'valor'), 'FM999G990D00'), to_char(p_valor, 'FM999G990D00');
  end if;
  v_pag := registrar_pagamento_locacao(p_rental_id, 'permuta', round(p_valor, 2), p_data, null, 'Crédito da cliente');
  insert into creditos_cliente (client_id, tipo, quantidade, origem, rental_id, rental_payment_id, descricao, data)
  values (v_client, 'valor', -round(p_valor, 2), 'uso', p_rental_id, v_pag, 'Usado na locação', p_data);
  return v_pag;
end;
$$;

-- Permuta: o parceiro paga com produto/serviço. Lança a saída (empresa ou
-- pessoal), gera o crédito em R$ e, se vier de uma locação, já abate o que
-- couber no saldo dela. O que sobrar fica de crédito.
create or replace function public.registrar_permuta(
  p_client_id uuid,
  p_valor numeric,
  p_descricao text,
  p_destino text,
  p_categoria_pessoal uuid default null,
  p_rental_id uuid default null,
  p_data date default public.hoje_local()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_desc text := nullif(btrim(p_descricao), '');
  v_valor numeric := round(coalesce(p_valor, 0), 2);
  v_cat uuid;
  v_tx uuid;
  v_saldo numeric := 0;
  v_usar numeric := 0;
begin
  if not has_module_permission('financeiro') then raise exception 'Sem permissão para registrar permuta.'; end if;
  if v_valor <= 0 then raise exception 'Informe o valor da permuta.'; end if;
  if v_desc is null then raise exception 'Escreva o que veio na permuta.'; end if;
  if p_destino not in ('empresa', 'pessoal') then raise exception 'Diga se a permuta é da empresa ou pessoal.'; end if;
  select coalesce(nullif(btrim(display_name), ''), name) into v_nome from clients where id = p_client_id;
  if v_nome is null then raise exception 'Cliente não encontrada.'; end if;
  if p_rental_id is not null and not exists (select 1 from rentals where id = p_rental_id and client_id = p_client_id) then
    raise exception 'A locação não é desta cliente.';
  end if;

  if p_destino = 'empresa' then
    select id into v_cat from categories where scope = 'harmonize' and type = 'saida' and name = 'Outros' limit 1;
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, rental_id, notes, created_by)
    values ('saida', v_cat, 'Permuta: ' || v_desc || ' (' || v_nome || ')', v_valor, 'permuta', p_data, 'harmonize', p_client_id, p_rental_id,
            'Permuta da empresa', auth.uid())
    returning id into v_tx;
  else
    if not exists (select 1 from categories where id = p_categoria_pessoal and scope = 'pessoal' and type = 'saida') then
      raise exception 'Escolha a categoria do gasto pessoal.';
    end if;
    select id into v_cat from categories where scope = 'harmonize' and type = 'saida' and name = 'Retiradas' limit 1;
    -- A retirada já cria a entrada "Retirada da Harmonize" no Pessoal (gatilho espelhar_retirada).
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, client_id, notes, created_by)
    values ('saida', v_cat, 'Permuta: ' || v_desc || ' (' || v_nome || ')', v_valor, 'permuta', p_data, 'harmonize', p_client_id,
            'Permuta pessoal', auth.uid())
    returning id into v_tx;
    insert into transactions (type, category_id, description, amount, payment_method, date, scope, notes, created_by)
    values ('saida', p_categoria_pessoal, v_desc || ' (permuta com ' || v_nome || ')', v_valor, 'permuta', p_data, 'pessoal',
            'Permuta pessoal', auth.uid());
  end if;

  insert into creditos_cliente (client_id, tipo, quantidade, origem, transaction_id, descricao, data)
  values (p_client_id, 'valor', v_valor, 'permuta', v_tx, 'Permuta: ' || v_desc, p_data);

  if p_rental_id is not null then
    select coalesce(saldo, 0) into v_saldo from rentals_situacao_pagamento where rental_id = p_rental_id;
    v_usar := least(v_valor, greatest(coalesce(v_saldo, 0), 0));
    if v_usar > 0 then
      perform usar_credito_valor(p_rental_id, v_usar, p_data);
    end if;
  end if;

  perform registrar_movimentacao('criado', 'transactions', v_tx, 'Permuta: ' || v_desc || ' (' || v_nome || ')',
    jsonb_build_object('client_id', p_client_id, 'valor', v_valor, 'destino', p_destino, 'usado_na_locacao', v_usar));

  return jsonb_build_object('transacao_id', v_tx, 'usado', v_usar, 'credito', v_valor - v_usar);
end;
$$;

revoke execute on function public.credito_conta(numeric, text, boolean, text) from public, anon;
grant execute on function public.credito_conta(numeric, text, boolean, text) to authenticated, service_role;
revoke execute on function public.saldo_credito_cliente(uuid, text) from public, anon;
grant execute on function public.saldo_credito_cliente(uuid, text) to authenticated, service_role;
revoke execute on function public.registrar_contagens_locacao(uuid, jsonb, integer) from public, anon;
grant execute on function public.registrar_contagens_locacao(uuid, jsonb, integer) to authenticated, service_role;
revoke execute on function public.lancar_credito_cliente(uuid, text, numeric, text) from public, anon;
grant execute on function public.lancar_credito_cliente(uuid, text, numeric, text) to authenticated, service_role;
revoke execute on function public.usar_credito_valor(uuid, numeric, date) from public, anon;
grant execute on function public.usar_credito_valor(uuid, numeric, date) to authenticated, service_role;
revoke execute on function public.registrar_permuta(uuid, numeric, text, text, uuid, uuid, date) from public, anon;
grant execute on function public.registrar_permuta(uuid, numeric, text, text, uuid, uuid, date) to authenticated, service_role;
