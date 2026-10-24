-- Contas PIX editáveis em Configurações (24/10/2026, etapa 2b).
-- As três contas que estavam fixas no código (lib/rental-calculator.ts) e na
-- regra do banco (rental_payments.pix_conta só aceitava eder, harmonize e
-- laser_dream) passam para a tabela contas_pix. O código de cada conta é o
-- mesmo gravado nos pagamentos, então nada muda nos pagamentos antigos.
--   1. Tabela contas_pix com as três contas de hoje.
--   2. rental_payments.pix_conta deixa a lista fixa e passa a apontar para
--      contas_pix.codigo (conta usada em pagamento não se apaga: desativa).
--   3. Escrita só por salvar_conta_pix e excluir_conta_pix.
-- Não apaga nem altera pagamentos.

create table if not exists public.contas_pix (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[a-z0-9_]{2,40}$'),
  rotulo text not null check (length(btrim(rotulo)) between 1 and 40),
  titular text not null check (length(btrim(titular)) between 1 and 120),
  tipo_chave text not null check (tipo_chave in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  chave text not null check (length(btrim(chave)) between 1 and 120),
  ordem integer not null default 0,
  ativa boolean not null default true,
  padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contas_pix_uma_padrao on public.contas_pix (padrao) where padrao;

comment on table public.contas_pix is
  'Contas PIX que recebem pagamentos (codigo = rental_payments.pix_conta). Escrita só por salvar_conta_pix e excluir_conta_pix. A padrão vem marcada nas telas de pagamento.';

insert into public.contas_pix (codigo, rotulo, titular, tipo_chave, chave, ordem, ativa, padrao)
values
  ('eder', 'Eder', 'Eder Campos de Almeida', 'cpf', '07442790623', 1, true, false),
  ('harmonize', 'Harmonize', 'Harmonize Bella Prime LTDA', 'email', 'harmonizequip@gmail.com', 2, true, true),
  ('laser_dream', 'Laser Dream', 'Laser Dream Campina Grande LTDA', 'aleatoria', 'ed21011f-1880-4293-9cb3-cdc087ac80de', 3, true, false)
on conflict (codigo) do nothing;

alter table public.contas_pix enable row level security;
drop policy if exists "contas_pix_select" on public.contas_pix;
create policy "contas_pix_select" on public.contas_pix for select
  using (has_module_permission('financeiro') or has_module_permission('agenda') or has_module_permission('configuracoes'));
grant select on public.contas_pix to authenticated;
revoke all on public.contas_pix from anon;

drop trigger if exists trg_somente_leitura on public.contas_pix;
create trigger trg_somente_leitura before insert or update or delete on public.contas_pix
  for each statement execute function public.bloquear_somente_leitura();

-- Pagamento PIX aponta para a conta pelo código (antes: lista fixa no check).
alter table public.rental_payments drop constraint if exists rental_payments_pix_conta_check;
alter table public.rental_payments drop constraint if exists rental_payments_pix_conta_fkey;
alter table public.rental_payments
  add constraint rental_payments_pix_conta_fkey foreign key (pix_conta) references public.contas_pix(codigo);
comment on column public.rental_payments.pix_conta is
  'Conta PIX que recebeu (contas_pix.codigo: eder, harmonize, laser_dream e as que o dono cadastrar). Obrigatório quando forma = pix, e só faz sentido nesse caso.';

-- Cria (p_id nulo) ou altera uma conta. O código nasce do rótulo e não muda
-- depois (é o que fica gravado nos pagamentos).
create or replace function public.salvar_conta_pix(
  p_id uuid,
  p_rotulo text,
  p_titular text,
  p_tipo_chave text,
  p_chave text,
  p_ativa boolean default true,
  p_padrao boolean default false,
  p_ordem integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rotulo text := btrim(coalesce(p_rotulo, ''));
  v_titular text := btrim(coalesce(p_titular, ''));
  v_tipo text := lower(btrim(coalesce(p_tipo_chave, '')));
  v_chave text := btrim(coalesce(p_chave, ''));
  v_antes contas_pix%rowtype;
  v_codigo text;
  v_base text;
  v_n int := 1;
  v_id uuid;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Sem permissão para mexer nas contas PIX.';
  end if;
  if v_rotulo = '' or length(v_rotulo) > 40 then
    raise exception 'Escreva um nome curto para a conta (até 40 caracteres).';
  end if;
  if v_titular = '' or length(v_titular) > 120 then
    raise exception 'Escreva o nome do titular (favorecido).';
  end if;
  if v_tipo not in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria') then
    raise exception 'Tipo de chave inválido.';
  end if;
  if v_chave = '' or length(v_chave) > 120 then
    raise exception 'Escreva a chave PIX.';
  end if;
  if v_tipo in ('cpf', 'cnpj', 'telefone') then
    v_chave := regexp_replace(v_chave, '[^0-9+]', '', 'g');
    if v_tipo = 'cpf' and length(v_chave) <> 11 then raise exception 'CPF precisa ter 11 números.'; end if;
    if v_tipo = 'cnpj' and length(v_chave) <> 14 then raise exception 'CNPJ precisa ter 14 números.'; end if;
    if v_tipo = 'telefone' and length(regexp_replace(v_chave, '\D', '', 'g')) < 10 then raise exception 'Telefone incompleto.'; end if;
  end if;
  if v_tipo = 'email' and v_chave !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if coalesce(p_padrao, false) and not coalesce(p_ativa, true) then
    raise exception 'A conta padrão precisa estar ativa.';
  end if;

  if p_id is null then
    v_base := left(regexp_replace(lower(translate(v_rotulo,
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '_', 'g'), 30);
    v_base := btrim(v_base, '_');
    if length(v_base) < 2 then v_base := 'conta'; end if;
    v_codigo := v_base;
    while exists (select 1 from contas_pix where codigo = v_codigo) loop
      v_n := v_n + 1;
      v_codigo := v_base || '_' || v_n;
    end loop;
    if coalesce(p_padrao, false) then
      update contas_pix set padrao = false where padrao;
    end if;
    insert into contas_pix (codigo, rotulo, titular, tipo_chave, chave, ordem, ativa, padrao)
    values (v_codigo, v_rotulo, v_titular, v_tipo, v_chave,
            coalesce(p_ordem, (select coalesce(max(ordem), 0) + 1 from contas_pix)),
            coalesce(p_ativa, true), coalesce(p_padrao, false))
    returning id into v_id;
    perform registrar_movimentacao('criado', 'contas_pix', v_id,
      'Conta PIX criada: ' || v_rotulo || ' (' || v_titular || ')',
      jsonb_build_object('codigo', v_codigo, 'tipo_chave', v_tipo, 'chave', v_chave));
    return v_id;
  end if;

  select * into v_antes from contas_pix where id = p_id for update;
  if not found then
    raise exception 'Conta PIX não encontrada.';
  end if;
  if v_antes.padrao and not coalesce(p_padrao, false) then
    raise exception 'Escolha outra conta como padrão antes de tirar o padrão desta.';
  end if;
  if coalesce(p_padrao, false) and not v_antes.padrao then
    update contas_pix set padrao = false where padrao;
  end if;
  update contas_pix
     set rotulo = v_rotulo, titular = v_titular, tipo_chave = v_tipo, chave = v_chave,
         ativa = coalesce(p_ativa, true), padrao = coalesce(p_padrao, false),
         ordem = coalesce(p_ordem, ordem), updated_at = now()
   where id = p_id;
  perform registrar_movimentacao('editado', 'contas_pix', p_id,
    'Conta PIX alterada: ' || v_rotulo,
    jsonb_build_object(
      'antes', jsonb_build_object('rotulo', v_antes.rotulo, 'titular', v_antes.titular, 'tipo_chave', v_antes.tipo_chave,
                                  'chave', v_antes.chave, 'ativa', v_antes.ativa, 'padrao', v_antes.padrao),
      'depois', jsonb_build_object('rotulo', v_rotulo, 'titular', v_titular, 'tipo_chave', v_tipo,
                                   'chave', v_chave, 'ativa', coalesce(p_ativa, true), 'padrao', coalesce(p_padrao, false))));
  return p_id;
end;
$$;

-- Apaga só conta que nunca recebeu pagamento e não é a padrão.
create or replace function public.excluir_conta_pix(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c contas_pix%rowtype;
  v_qtd int;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Sem permissão para mexer nas contas PIX.';
  end if;
  select * into v_c from contas_pix where id = p_id for update;
  if not found then
    raise exception 'Conta PIX não encontrada.';
  end if;
  if v_c.padrao then
    raise exception 'A conta padrão não pode ser apagada: escolha outra como padrão antes.';
  end if;
  select count(*) into v_qtd from rental_payments where pix_conta = v_c.codigo;
  if v_qtd > 0 then
    raise exception 'A conta "%" já recebeu % pagamento(s): desative em vez de apagar.', v_c.rotulo, v_qtd;
  end if;
  delete from contas_pix where id = p_id;
  perform registrar_movimentacao('excluido', 'contas_pix', p_id,
    'Conta PIX apagada: ' || v_c.rotulo,
    jsonb_build_object('codigo', v_c.codigo, 'titular', v_c.titular, 'chave', v_c.chave));
end;
$$;

revoke execute on function public.salvar_conta_pix(uuid, text, text, text, text, boolean, boolean, integer) from public, anon;
revoke execute on function public.excluir_conta_pix(uuid) from public, anon;
grant execute on function public.salvar_conta_pix(uuid, text, text, text, text, boolean, boolean, integer) to authenticated, service_role;
grant execute on function public.excluir_conta_pix(uuid) to authenticated, service_role;
