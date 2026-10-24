-- Categorias de lançamento editáveis em Configurações (24/10/2026, etapa 2b).
-- As categorias já moram na tabela categories (o lançamento guarda category_id,
-- não o nome): esta migration só acrescenta o que falta para o dono cuidar
-- delas pela tela, sem mudar nada do que existe hoje.
--   1. Colunas sistema (cadeado: não renomeia, não arquiva, não apaga),
--      arquivada (some da escolha, continua nos relatórios) e ordem.
--   2. Marca como sistema as que o banco ou o código procuram pelo nome.
--   3. Um nome por espaço e tipo (sem diferença de maiúscula/espaço).
--   4. Escrita só pelas funções salvar_categoria, arquivar_categoria e
--      excluir_categoria (as políticas de gravação direta saem).
--   5. View categorias_uso: quantos lançamentos cada categoria tem.
-- Não apaga nem altera lançamentos.

alter table public.categories add column if not exists sistema boolean not null default false;
alter table public.categories add column if not exists arquivada boolean not null default false;
alter table public.categories add column if not exists ordem integer not null default 0;

comment on column public.categories.sistema is
  'Categoria usada pelo sistema pelo nome (funções, gatilhos ou telas): não se renomeia, arquiva nem apaga.';
comment on column public.categories.arquivada is
  'Arquivada: some da lista de escolha, mas continua nos lançamentos antigos e nos relatórios.';
comment on column public.categories.ordem is
  'Ordem na lista de escolha (empate pelo nome). 0 = ordem alfabética de sempre.';

-- Categorias que o sistema procura pelo nome (conferido nas funções em 24/10/2026):
--   Locação, Mentoria (finalize_rental_reservation, create_rental, pagamentos),
--   Taxa de reserva (definir_taxa_agendamento, por 'Taxa%'),
--   Deslocamento (versões antigas de create_rental; relatórios deixam de fora),
--   Retiradas (espelhar_retirada, registrar_permuta), Outros de saída da
--   Harmonize (registrar_permuta), Empréstimo concedido e Devolução de
--   empréstimo (registrar_emprestimo, editar_emprestimo e telas), Pagamento de
--   fatura (pagar_fatura_cartao, importar_compras_cartao) e Retirada da
--   Harmonize (entrada no Pessoal criada por espelhar_retirada).
update public.categories c
   set sistema = true, arquivada = false
  from (values
    ('harmonize', 'entrada', 'Locação'),
    ('harmonize', 'entrada', 'Mentoria'),
    ('harmonize', 'entrada', 'Taxa de reserva'),
    ('harmonize', 'entrada', 'Deslocamento'),
    ('harmonize', 'entrada', 'Devolução de empréstimo'),
    ('harmonize', 'saida', 'Retiradas'),
    ('harmonize', 'saida', 'Outros'),
    ('harmonize', 'saida', 'Empréstimo concedido'),
    ('harmonize', 'saida', 'Pagamento de fatura'),
    ('pessoal', 'entrada', 'Retirada da Harmonize'),
    ('pessoal', 'saida', 'Pagamento de fatura')
  ) as s(scope, type, name)
 where c.scope::text = s.scope and c.type::text = s.type and c.name = s.name
   and not c.sistema;

create unique index if not exists categories_nome_uk
  on public.categories (scope, type, lower(btrim(name)));

-- Leitura: quem vê o financeiro, o pessoal ou as configurações. Gravação direta
-- não existe mais (só pelas funções abaixo).
drop policy if exists "categories_select" on public.categories;
drop policy if exists "categories_write" on public.categories;
drop policy if exists "categories_update" on public.categories;
create policy "categories_select" on public.categories for select
  using (has_module_permission('financeiro') or has_module_permission('configuracoes') or has_module_permission('pessoal'));

-- Quantos lançamentos cada categoria tem (respeita o RLS de quem consulta).
create or replace view public.categorias_uso
with (security_invoker = true) as
select category_id, count(*)::int as lancamentos
  from public.transactions
 where category_id is not null
 group by category_id;
grant select on public.categorias_uso to authenticated;
revoke all on public.categorias_uso from anon;

-- Nome que o sistema procura por pedaço ou que já é de uma categoria do sistema
-- no mesmo espaço (qualquer tipo): recusado para não confundir as funções.
create or replace function public.categoria_nome_reservado(p_scope scope_type, p_type entry_type, p_nome text, p_id uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_type = 'entrada' and lower(btrim(p_nome)) ~ '^(taxa|loca|mentoria|deslocamento)'
      then 'Nome reservado: entradas começando com Taxa, Loca, Mentoria ou Deslocamento são do sistema.'
    when exists (
      select 1 from categories c
       where c.sistema and c.scope = p_scope and c.id is distinct from p_id
         and lower(btrim(c.name)) = lower(btrim(p_nome))
    ) then 'Já existe uma categoria do sistema com esse nome.'
    else null
  end;
$$;

-- Cria (p_id nulo) ou renomeia uma categoria. Renomear não mexe nos lançamentos
-- (eles apontam pelo id), só no orçamento pessoal, que guarda o nome.
create or replace function public.salvar_categoria(
  p_id uuid,
  p_nome text,
  p_scope scope_type default 'harmonize',
  p_type entry_type default 'saida'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_cat categories%rowtype;
  v_motivo text;
  v_id uuid;
  v_ordem int;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Sem permissão para mexer nas categorias.';
  end if;
  if v_nome = '' then
    raise exception 'Escreva o nome da categoria.';
  end if;
  if length(v_nome) > 60 then
    raise exception 'Nome longo demais (máximo 60 caracteres).';
  end if;

  if p_id is null then
    if p_scope = 'pessoal' and not has_module_permission('pessoal') then
      raise exception 'Sem permissão para o Pessoal.';
    end if;
    v_motivo := categoria_nome_reservado(p_scope, p_type, v_nome, null);
    if v_motivo is not null then raise exception '%', v_motivo; end if;
    if exists (select 1 from categories where scope = p_scope and type = p_type and lower(btrim(name)) = lower(v_nome)) then
      raise exception 'Já existe a categoria "%" nesta lista.', v_nome;
    end if;
    select coalesce(max(ordem), 0) into v_ordem from categories where scope = p_scope and type = p_type;
    insert into categories (name, type, scope, is_default, sistema, arquivada, ordem)
    values (v_nome, p_type, p_scope, false, false, false, case when v_ordem > 0 then v_ordem + 1 else 0 end)
    returning id into v_id;
    perform registrar_movimentacao('criado', 'categories', v_id,
      'Categoria criada: ' || v_nome || ' (' || p_scope::text || ', ' || p_type::text || ')',
      jsonb_build_object('nome', v_nome, 'escopo', p_scope, 'tipo', p_type));
    return v_id;
  end if;

  select * into v_cat from categories where id = p_id for update;
  if not found then
    raise exception 'Categoria não encontrada.';
  end if;
  if v_cat.scope = 'pessoal' and not has_module_permission('pessoal') then
    raise exception 'Sem permissão para o Pessoal.';
  end if;
  if v_cat.sistema then
    raise exception 'A categoria "%" é do sistema e não pode ser renomeada.', v_cat.name;
  end if;
  if v_cat.name = v_nome then
    return v_cat.id;
  end if;
  v_motivo := categoria_nome_reservado(v_cat.scope, v_cat.type, v_nome, v_cat.id);
  if v_motivo is not null then raise exception '%', v_motivo; end if;
  if exists (select 1 from categories where scope = v_cat.scope and type = v_cat.type and id <> v_cat.id
                and lower(btrim(name)) = lower(v_nome)) then
    raise exception 'Já existe a categoria "%" nesta lista.', v_nome;
  end if;

  update categories set name = v_nome where id = v_cat.id;
  if v_cat.scope = 'pessoal' and v_cat.type = 'saida' then
    update orcamentos_pessoais set categoria = v_nome
     where lower(btrim(categoria)) = lower(btrim(v_cat.name));
  end if;

  perform registrar_movimentacao('editado', 'categories', v_cat.id,
    'Categoria renomeada: ' || v_cat.name || ' → ' || v_nome,
    jsonb_build_object('antes', v_cat.name, 'depois', v_nome,
      'lancamentos', (select count(*) from transactions where category_id = v_cat.id)));
  return v_cat.id;
end;
$$;

-- Arquiva (some da escolha) ou reativa.
create or replace function public.arquivar_categoria(p_id uuid, p_arquivar boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat categories%rowtype;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Sem permissão para mexer nas categorias.';
  end if;
  select * into v_cat from categories where id = p_id for update;
  if not found then
    raise exception 'Categoria não encontrada.';
  end if;
  if v_cat.scope = 'pessoal' and not has_module_permission('pessoal') then
    raise exception 'Sem permissão para o Pessoal.';
  end if;
  if v_cat.sistema and coalesce(p_arquivar, true) then
    raise exception 'A categoria "%" é do sistema e não pode ser arquivada.', v_cat.name;
  end if;
  if v_cat.arquivada = coalesce(p_arquivar, true) then
    return;
  end if;
  update categories set arquivada = coalesce(p_arquivar, true) where id = p_id;
  perform registrar_movimentacao('editado', 'categories', p_id,
    case when coalesce(p_arquivar, true) then 'Categoria arquivada: ' else 'Categoria reativada: ' end || v_cat.name,
    jsonb_build_object('arquivada', coalesce(p_arquivar, true)));
end;
$$;

-- Apaga só categoria sem nenhum lançamento, limite de gasto ou orçamento.
create or replace function public.excluir_categoria(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat categories%rowtype;
  v_qtd int;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Sem permissão para mexer nas categorias.';
  end if;
  select * into v_cat from categories where id = p_id for update;
  if not found then
    raise exception 'Categoria não encontrada.';
  end if;
  if v_cat.scope = 'pessoal' and not has_module_permission('pessoal') then
    raise exception 'Sem permissão para o Pessoal.';
  end if;
  if v_cat.sistema then
    raise exception 'A categoria "%" é do sistema e não pode ser apagada.', v_cat.name;
  end if;
  select count(*) into v_qtd from transactions where category_id = p_id;
  if v_qtd > 0 then
    raise exception 'A categoria "%" tem % lançamento(s): arquive em vez de apagar.', v_cat.name, v_qtd;
  end if;
  if exists (select 1 from expense_limits where category_id = p_id) then
    raise exception 'A categoria "%" tem limite de gasto: tire o limite antes.', v_cat.name;
  end if;
  if v_cat.scope = 'pessoal' and exists (
    select 1 from orcamentos_pessoais where lower(btrim(categoria)) = lower(btrim(v_cat.name))
  ) then
    raise exception 'A categoria "%" tem orçamento no Pessoal: tire o orçamento antes.', v_cat.name;
  end if;

  delete from categories where id = p_id;
  perform registrar_movimentacao('excluido', 'categories', p_id,
    'Categoria apagada: ' || v_cat.name,
    jsonb_build_object('nome', v_cat.name, 'escopo', v_cat.scope, 'tipo', v_cat.type));
end;
$$;

revoke execute on function public.categoria_nome_reservado(scope_type, entry_type, text, uuid) from public, anon;
revoke execute on function public.salvar_categoria(uuid, text, scope_type, entry_type) from public, anon;
revoke execute on function public.arquivar_categoria(uuid, boolean) from public, anon;
revoke execute on function public.excluir_categoria(uuid) from public, anon;
grant execute on function public.categoria_nome_reservado(scope_type, entry_type, text, uuid) to authenticated, service_role;
grant execute on function public.salvar_categoria(uuid, text, scope_type, entry_type) to authenticated, service_role;
grant execute on function public.arquivar_categoria(uuid, boolean) to authenticated, service_role;
grant execute on function public.excluir_categoria(uuid) to authenticated, service_role;
