-- ============================================================
-- CRÉDITOS: AJUSTES (corrigir contagens, ponteira por contagem, permuta pessoal)
--
-- STATUS: AGUARDANDO O DONO
--
-- 1. Cada contagem pode dizer qual ponteira (aplicador) foi usada. A view
--    aplicadores_uso passa a dar os disparos dessa contagem para ela; o
--    resto da locação segue a montagem no HIPRO, como antes.
-- 2. corrigir_contagens_locacao: na edição da locação, troca as contagens
--    e refaz o crédito gerado e o usado por ela. Recusa se o crédito que
--    ela gerou já foi usado em outra locação e ficaria faltando.
-- 3. Permuta pessoal: o gasto lançado no Pessoal fica amarrado ao crédito;
--    apagar a permuta (a saída da Harmonize) apaga também esse gasto.
-- ============================================================

alter table public.locacao_contagens add column if not exists aplicador_id uuid references public.aplicadores(id) on delete set null;
comment on column public.locacao_contagens.aplicador_id is
  'Ponteira usada nesta contagem. Preenchida: os disparos dela vão para este aplicador em aplicadores_uso (em vez da montagem do dia).';

alter table public.creditos_cliente add column if not exists transaction_extra_id uuid references public.transactions(id) on delete set null;
comment on column public.creditos_cliente.transaction_extra_id is
  'Permuta pessoal: o gasto lançado no Pessoal. Some junto quando a linha do crédito é apagada.';

-- Disparos por aplicador: última leitura + locações pela montagem (menos os
-- disparos das contagens com ponteira definida) + contagens com esta ponteira.
create or replace view public.aplicadores_uso
with (security_invoker = true) as
select
  a.id,
  a.nome,
  a.numero_serie,
  a.garantia_disparos,
  a.contador_base,
  a.contador_base_em,
  a.ativo,
  m.equipment_id,
  m.desde as montado_desde,
  a.contador_base + coalesce((
    select sum(r.shots - coalesce((
             select sum(lc.final - lc.inicial) from public.locacao_contagens lc
              where lc.rental_id = r.id and lc.aplicador_id is not null), 0))
      from public.aplicador_montagens h
      join public.rentals_contabilizaveis r
        on r.equipment_id = h.equipment_id
       and r.event_date >= h.desde
       and (h.ate is null or r.event_date < h.ate)
     where h.aplicador_id = a.id
       and r.event_date > a.contador_base_em
       and not exists (
         select 1 from public.calendar_events ce
          where ce.rental_id = r.id and ce.is_mentoria
       )
  ), 0)::bigint
  + coalesce((
    select sum(lc.final - lc.inicial)
      from public.locacao_contagens lc
      join public.rentals_contabilizaveis r on r.id = lc.rental_id
     where lc.aplicador_id = a.id
       and r.event_date > a.contador_base_em
       and not exists (
         select 1 from public.calendar_events ce
          where ce.rental_id = r.id and ce.is_mentoria
       )
  ), 0)::bigint as disparos
from public.aplicadores a
left join public.aplicador_montagens m on m.aplicador_id = a.id and m.ate is null;

comment on view public.aplicadores_uso is
  'Disparos estimados de cada aplicador: última leitura do contador + disparos das locações (fora mentoria) do HIPRO em que estava montado, depois da leitura; contagem com ponteira definida (locacao_contagens.aplicador_id) vai para essa ponteira.';

-- Grava contagens, crédito gerado e crédito usado (uso interno das duas funções abaixo).
create or replace function public.gravar_contagens_locacao(p_rental_id uuid, p_contagens jsonb, p_credito_usado integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_data date;
  v_item jsonb;
  v_ordem int := 0;
  v_ini bigint;
  v_fim bigint;
  v_ap uuid;
  v_credito bigint := 0;
  v_partes text := '';
  v_disp numeric;
begin
  select client_id, event_date into v_client, v_data from rentals where id = p_rental_id;
  if jsonb_typeof(coalesce(p_contagens, '[]'::jsonb)) <> 'array' then raise exception 'Contagens inválidas.'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_contagens, '[]'::jsonb)) loop
    v_ordem := v_ordem + 1;
    v_ini := least((v_item ->> 'inicial')::bigint, (v_item ->> 'final')::bigint);
    v_fim := greatest((v_item ->> 'inicial')::bigint, (v_item ->> 'final')::bigint);
    if v_ini is null or v_fim is null or v_fim = v_ini then raise exception 'Contagem % incompleta.', v_ordem; end if;
    v_ap := nullif(v_item ->> 'aplicador_id', '')::uuid;
    if v_ap is not null and not exists (select 1 from aplicadores where id = v_ap) then
      raise exception 'Ponteira da contagem % não encontrada.', v_ordem;
    end if;
    insert into locacao_contagens (rental_id, ordem, inicial, final, gera_credito, aplicador_id)
    values (p_rental_id, v_ordem, v_ini, v_fim, coalesce((v_item ->> 'gera_credito')::boolean, false), v_ap);
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
end;
$$;

create or replace function public.registrar_contagens_locacao(p_rental_id uuid, p_contagens jsonb, p_credito_usado integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_status text;
begin
  if not (has_module_permission('agenda') or has_module_permission('financeiro')) then
    raise exception 'Sem permissão para registrar contagens.';
  end if;
  select client_id, status::text into v_client, v_status from rentals where id = p_rental_id;
  if v_client is null then raise exception 'Locação não encontrada.'; end if;
  if v_status = 'cancelada' then raise exception 'Locação cancelada.'; end if;
  if exists (select 1 from locacao_contagens where rental_id = p_rental_id)
     or exists (select 1 from creditos_cliente where rental_id = p_rental_id and origem in ('contagem', 'uso') and tipo = 'disparos') then
    raise exception 'As contagens desta locação já foram registradas.';
  end if;
  perform gravar_contagens_locacao(p_rental_id, p_contagens, p_credito_usado);
  if jsonb_array_length(coalesce(p_contagens, '[]'::jsonb)) > 1 or coalesce(p_credito_usado, 0) > 0
     or exists (select 1 from locacao_contagens where rental_id = p_rental_id and gera_credito) then
    perform registrar_movimentacao('editado', 'rentals', p_rental_id, descrever_registro('rentals', p_rental_id),
      jsonb_build_object('acao_detalhada', 'Contagens registradas', 'contagens', jsonb_array_length(coalesce(p_contagens, '[]'::jsonb)),
                         'credito_usado', coalesce(p_credito_usado, 0), 'client_id', v_client));
  end if;
end;
$$;

-- Edição da locação: troca as contagens e refaz o crédito gerado e o usado.
create or replace function public.corrigir_contagens_locacao(p_rental_id uuid, p_contagens jsonb, p_credito_usado integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_status text;
begin
  if not (has_module_permission('agenda') or has_module_permission('financeiro')) then
    raise exception 'Sem permissão para corrigir contagens.';
  end if;
  select client_id, status::text into v_client, v_status from rentals where id = p_rental_id;
  if v_client is null then raise exception 'Locação não encontrada.'; end if;
  if v_status = 'cancelada' then raise exception 'Locação cancelada.'; end if;

  delete from locacao_contagens where rental_id = p_rental_id;
  delete from creditos_cliente where rental_id = p_rental_id and tipo = 'disparos' and origem in ('contagem', 'uso');
  perform gravar_contagens_locacao(p_rental_id, p_contagens, p_credito_usado);

  -- O crédito gerado aqui pode já ter sido usado em outra locação.
  if exists (
    select 1 from creditos_cliente c left join rentals r on r.id = c.rental_id
     where c.client_id = v_client and c.tipo = 'disparos'
       and credito_conta(c.quantidade, c.origem, r.pago, r.status::text) <> 'fora'
     having sum(c.quantidade) < 0
  ) then
    raise exception 'O crédito desta locação já foi usado em outra e ficaria faltando. Corrija a outra locação primeiro.';
  end if;

  perform registrar_movimentacao('editado', 'rentals', p_rental_id, descrever_registro('rentals', p_rental_id),
    jsonb_build_object('acao_detalhada', 'Contagens corrigidas', 'contagens', jsonb_array_length(coalesce(p_contagens, '[]'::jsonb)),
                       'credito_usado', coalesce(p_credito_usado, 0), 'client_id', v_client));
end;
$$;

-- Permuta (mesma de antes) guardando o gasto pessoal no crédito.
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
  v_tx_pessoal uuid;
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
            'Permuta pessoal', auth.uid())
    returning id into v_tx_pessoal;
  end if;

  insert into creditos_cliente (client_id, tipo, quantidade, origem, transaction_id, transaction_extra_id, descricao, data)
  values (p_client_id, 'valor', v_valor, 'permuta', v_tx, v_tx_pessoal, 'Permuta: ' || v_desc, p_data);

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

-- Apagou a permuta (a saída da Harmonize leva a linha do crédito junto): o gasto pessoal vai também.
create or replace function public.creditos_apagar_gasto_pessoal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.transaction_extra_id is not null then
    delete from transactions where id = old.transaction_extra_id;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_creditos_apagar_gasto_pessoal on public.creditos_cliente;
create trigger trg_creditos_apagar_gasto_pessoal after delete on public.creditos_cliente
  for each row execute function public.creditos_apagar_gasto_pessoal();

revoke execute on function public.gravar_contagens_locacao(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.gravar_contagens_locacao(uuid, jsonb, integer) to service_role;
revoke execute on function public.registrar_contagens_locacao(uuid, jsonb, integer) from public, anon;
grant execute on function public.registrar_contagens_locacao(uuid, jsonb, integer) to authenticated, service_role;
revoke execute on function public.corrigir_contagens_locacao(uuid, jsonb, integer) from public, anon;
grant execute on function public.corrigir_contagens_locacao(uuid, jsonb, integer) to authenticated, service_role;
revoke execute on function public.registrar_permuta(uuid, numeric, text, text, uuid, uuid, date) from public, anon;
grant execute on function public.registrar_permuta(uuid, numeric, text, text, uuid, uuid, date) to authenticated, service_role;
revoke execute on function public.creditos_apagar_gasto_pessoal() from public, anon, authenticated;
