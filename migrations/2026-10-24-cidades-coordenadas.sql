-- Cidades do encaixe no banco (24/10/2026, etapa 2b).
-- A lista fixa de lib/cidades-coordenadas.ts (posição de cada cidade, usada no
-- encaixe de datas livres para medir distância em linha reta) passa para a
-- tabela cidades_coordenadas, editável em Configurações > Cidades. A migration
-- copia exatamente as cidades de hoje; o app continua com a lista fixa de
-- reserva se a tabela não puder ser lida.
--   1. normalizar_cidade(texto): igual a normalizarCidade do app
--      ("JOÃO PESSOA - PB" vira "joao pessoa").
--   2. Tabela cidades_coordenadas (nome normalizado único).
--   3. Escrita só por salvar_cidade e excluir_cidade.
-- Não apaga nem altera dados existentes.

create or replace function public.normalizar_cidade(p_nome text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(regexp_replace(
    lower(translate(coalesce(p_nome, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '\s*[-/,(].*$', ''), '\s+', ' ', 'g'));
$$;

create table if not exists public.cidades_coordenadas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (nome <> '' and nome = public.normalizar_cidade(nome)),
  nome_exibicao text not null check (length(btrim(nome_exibicao)) between 1 and 80),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);

comment on table public.cidades_coordenadas is
  'Posição das cidades para o encaixe de datas livres (distância em linha reta). nome = normalizar_cidade(nome_exibicao). Escrita só por salvar_cidade e excluir_cidade.';

-- Cidades de hoje (geradas de lib/cidades-coordenadas.ts por script).
insert into public.cidades_coordenadas (nome, nome_exibicao, uf, latitude, longitude)
values
  ('recife', 'Recife', 'PE', -8.0476, -34.877),
  ('olinda', 'Olinda', 'PE', -8.0089, -34.8553),
  ('paulista', 'Paulista', 'PE', -7.9408, -34.8728),
  ('jaboatao dos guararapes', 'Jaboatão dos Guararapes', 'PE', -8.1128, -35.0147),
  ('jaboatao', 'Jaboatão', 'PE', -8.1128, -35.0147),
  ('camaragibe', 'Camaragibe', 'PE', -8.0236, -34.9814),
  ('sao lourenco da mata', 'São Lourenço da Mata', 'PE', -8.0022, -35.0181),
  ('moreno', 'Moreno', 'PE', -8.1186, -35.0922),
  ('abreu e lima', 'Abreu e Lima', 'PE', -7.9008, -34.8986),
  ('igarassu', 'Igarassu', 'PE', -7.8342, -34.9064),
  ('itamaraca', 'Itamaracá', 'PE', -7.7478, -34.8256),
  ('ilha de itamaraca', 'Ilha de Itamaracá', 'PE', -7.7478, -34.8256),
  ('cabo de santo agostinho', 'Cabo de Santo Agostinho', 'PE', -8.2836, -35.0353),
  ('ipojuca', 'Ipojuca', 'PE', -8.3986, -35.0639),
  ('porto de galinhas', 'Porto de Galinhas', 'PE', -8.5039, -35.0047),
  ('escada', 'Escada', 'PE', -8.3592, -35.2236),
  ('sirinhaem', 'Sirinhaém', 'PE', -8.5908, -35.1161),
  ('tamandare', 'Tamandaré', 'PE', -8.76, -35.1047),
  ('palmares', 'Palmares', 'PE', -8.6833, -35.5917),
  ('vitoria de santo antao', 'Vitória de Santo Antão', 'PE', -8.1181, -35.2914),
  ('gravata', 'Gravatá', 'PE', -8.2011, -35.5647),
  ('bezerros', 'Bezerros', 'PE', -8.2333, -35.7967),
  ('caruaru', 'Caruaru', 'PE', -8.2836, -35.9761),
  ('bonito', 'Bonito', 'PE', -8.4703, -35.7286),
  ('bom jardim', 'Bom Jardim', 'PE', -7.7961, -35.5872),
  ('limoeiro', 'Limoeiro', 'PE', -7.8742, -35.45),
  ('carpina', 'Carpina', 'PE', -7.8508, -35.2544),
  ('surubim', 'Surubim', 'PE', -7.8331, -35.7547),
  ('goiana', 'Goiana', 'PE', -7.5606, -35.0025),
  ('timbauba', 'Timbaúba', 'PE', -7.505, -35.3183),
  ('santa cruz do capibaribe', 'Santa Cruz do Capibaribe', 'PE', -7.9572, -36.2047),
  ('toritama', 'Toritama', 'PE', -8.0067, -36.0567),
  ('belo jardim', 'Belo Jardim', 'PE', -8.3356, -36.4242),
  ('pesqueira', 'Pesqueira', 'PE', -8.3578, -36.6964),
  ('garanhuns', 'Garanhuns', 'PE', -8.8828, -36.4969),
  ('arcoverde', 'Arcoverde', 'PE', -8.4189, -37.0539),
  ('serra talhada', 'Serra Talhada', 'PE', -7.9858, -38.2958),
  ('sao jose do egito', 'São José do Egito', 'PE', -7.4789, -37.2742),
  ('petrolina', 'Petrolina', 'PE', -9.3986, -40.5008),
  ('joao pessoa', 'João Pessoa', 'PB', -7.1153, -34.861),
  ('cabedelo', 'Cabedelo', 'PB', -6.9811, -34.8339),
  ('bayeux', 'Bayeux', 'PB', -7.125, -34.9322),
  ('santa rita', 'Santa Rita', 'PB', -7.1139, -34.9781),
  ('conde', 'Conde', 'PB', -7.2597, -34.9075),
  ('mamanguape', 'Mamanguape', 'PB', -6.8386, -35.1261),
  ('sape', 'Sapé', 'PB', -7.0936, -35.2333),
  ('itabaiana', 'Itabaiana', 'PB', -7.3286, -35.3322),
  ('guarabira', 'Guarabira', 'PB', -6.8547, -35.49),
  ('campina grande', 'Campina Grande', 'PB', -7.2306, -35.8811),
  ('remigio', 'Remígio', 'PB', -6.9497, -35.8017),
  ('esperanca', 'Esperança', 'PB', -7.0225, -35.8597),
  ('areia', 'Areia', 'PB', -6.9628, -35.6919),
  ('queimadas', 'Queimadas', 'PB', -7.3583, -35.8981),
  ('monteiro', 'Monteiro', 'PB', -7.8894, -37.12),
  ('patos', 'Patos', 'PB', -7.0244, -37.28),
  ('pombal', 'Pombal', 'PB', -6.7703, -37.8017),
  ('sousa', 'Sousa', 'PB', -6.7592, -38.2311),
  ('cajazeiras', 'Cajazeiras', 'PB', -6.89, -38.5569),
  ('maceio', 'Maceió', 'AL', -9.6658, -35.735),
  ('arapiraca', 'Arapiraca', 'AL', -9.7525, -36.6611),
  ('penedo', 'Penedo', 'AL', -10.29, -36.5858),
  ('natal', 'Natal', 'RN', -5.7945, -35.211),
  ('parnamirim', 'Parnamirim', 'RN', -5.9156, -35.2628),
  ('mossoro', 'Mossoró', 'RN', -5.1875, -37.3442),
  ('aracaju', 'Aracaju', 'SE', -10.9472, -37.0731),
  ('fortaleza', 'Fortaleza', 'CE', -3.7319, -38.5267),
  ('salvador', 'Salvador', 'BA', -12.9714, -38.5014),
  ('sao paulo', 'São Paulo', 'SP', -23.5505, -46.6333)
on conflict (nome) do nothing;

alter table public.cidades_coordenadas enable row level security;
drop policy if exists "cidades_coordenadas_select" on public.cidades_coordenadas;
create policy "cidades_coordenadas_select" on public.cidades_coordenadas for select
  using (has_module_permission('agenda') or has_module_permission('dashboard') or has_module_permission('configuracoes'));
grant select on public.cidades_coordenadas to authenticated;
revoke all on public.cidades_coordenadas from anon;

drop trigger if exists trg_somente_leitura on public.cidades_coordenadas;
create trigger trg_somente_leitura before insert or update or delete on public.cidades_coordenadas
  for each statement execute function public.bloquear_somente_leitura();

-- Cria ou atualiza (pelo nome normalizado) uma cidade.
create or replace function public.salvar_cidade(
  p_nome text,
  p_latitude numeric,
  p_longitude numeric,
  p_uf text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exibir text := regexp_replace(btrim(regexp_replace(coalesce(p_nome, ''), '\s*[-/,(].*$', '')), '\s+', ' ', 'g');
  v_nome text := normalizar_cidade(p_nome);
  v_uf text := nullif(upper(btrim(coalesce(p_uf, ''))), '');
  v_antes cidades_coordenadas%rowtype;
  v_id uuid;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Sem permissão para mexer nas cidades.';
  end if;
  if v_nome = '' or length(v_exibir) > 80 then
    raise exception 'Escreva o nome da cidade.';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Latitude ou longitude inválida.';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF deve ter duas letras (ex.: PE).';
  end if;

  select * into v_antes from cidades_coordenadas where nome = v_nome for update;
  if found then
    update cidades_coordenadas
       set nome_exibicao = v_exibir, uf = coalesce(v_uf, uf), latitude = round(p_latitude, 6), longitude = round(p_longitude, 6)
     where id = v_antes.id;
    perform registrar_movimentacao('editado', 'cidades_coordenadas', v_antes.id,
      'Cidade alterada: ' || v_exibir,
      jsonb_build_object('antes', jsonb_build_object('lat', v_antes.latitude, 'lon', v_antes.longitude, 'uf', v_antes.uf),
                         'depois', jsonb_build_object('lat', round(p_latitude, 6), 'lon', round(p_longitude, 6), 'uf', coalesce(v_uf, v_antes.uf))));
    return v_antes.id;
  end if;

  insert into cidades_coordenadas (nome, nome_exibicao, uf, latitude, longitude)
  values (v_nome, v_exibir, v_uf, round(p_latitude, 6), round(p_longitude, 6))
  returning id into v_id;
  perform registrar_movimentacao('criado', 'cidades_coordenadas', v_id,
    'Cidade cadastrada: ' || v_exibir,
    jsonb_build_object('nome', v_nome, 'lat', round(p_latitude, 6), 'lon', round(p_longitude, 6), 'uf', v_uf));
  return v_id;
end;
$$;

create or replace function public.excluir_cidade(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c cidades_coordenadas%rowtype;
begin
  if not has_module_permission('configuracoes') then
    raise exception 'Sem permissão para mexer nas cidades.';
  end if;
  select * into v_c from cidades_coordenadas where id = p_id for update;
  if not found then
    raise exception 'Cidade não encontrada.';
  end if;
  delete from cidades_coordenadas where id = p_id;
  perform registrar_movimentacao('excluido', 'cidades_coordenadas', p_id,
    'Cidade removida: ' || v_c.nome_exibicao,
    jsonb_build_object('nome', v_c.nome, 'lat', v_c.latitude, 'lon', v_c.longitude, 'uf', v_c.uf));
end;
$$;

revoke execute on function public.normalizar_cidade(text) from public, anon;
revoke execute on function public.salvar_cidade(text, numeric, numeric, text) from public, anon;
revoke execute on function public.excluir_cidade(uuid) from public, anon;
grant execute on function public.normalizar_cidade(text) to authenticated, service_role;
grant execute on function public.salvar_cidade(text, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.excluir_cidade(uuid) to authenticated, service_role;
