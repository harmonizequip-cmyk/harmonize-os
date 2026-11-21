-- Assinatura da sessão também no portal da cliente (21/11/2026, pedido do dono).
--
-- Até aqui só o dono colhia assinaturas (pode_assinar_sessao). Agora a cliente
-- do portal, com o acesso em dia (cliente_do_usuario), colhe, vê e apaga as
-- assinaturas dos planejamentos DELA. O resto não muda: o acesso de visualização
-- continua sem nada, a triagem e o termo seguem obrigatórios na do paciente e a
-- profissional precisa ser da clínica do planejamento.

-- 1. Pode mexer nas assinaturas DESTE planejamento?
create or replace function public.pode_assinar_planejamento(p_planejamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pode_assinar_sessao()
      or exists (
        select 1 from planejamentos p
         where p.id = p_planejamento_id
           and p.client_id is not null
           and p.client_id = public.cliente_do_usuario()
      );
$$;
revoke execute on function public.pode_assinar_planejamento(uuid) from public, anon;
grant execute on function public.pode_assinar_planejamento(uuid) to authenticated, service_role;

-- 2. A tela pergunta se mostra as assinaturas: dono, ou cliente do portal em dia.
create or replace function public.pode_colher_assinaturas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pode_assinar_sessao() or public.cliente_do_usuario() is not null;
$$;
revoke execute on function public.pode_colher_assinaturas() from public, anon;
grant execute on function public.pode_colher_assinaturas() to authenticated, service_role;

-- 3. Planejamento pelo caminho do arquivo (s/<planejamento>/<sessao>/<papel>-<id>.png); nulo se não for desse jeito.
create or replace function public.planejamento_do_caminho_assinatura(p_nome text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if split_part(coalesce(p_nome, ''), '/', 1) <> 's' then return null; end if;
  return split_part(p_nome, '/', 2)::uuid;
exception when others then
  return null;
end;
$$;
revoke execute on function public.planejamento_do_caminho_assinatura(text) from public, anon;
grant execute on function public.planejamento_do_caminho_assinatura(text) to authenticated, service_role;

-- 4. Leitura das assinaturas: o dono vê todas; a cliente, as dos planejamentos dela.
drop policy if exists "assinaturas_sessao_select" on public.assinaturas_sessao;
create policy "assinaturas_sessao_select" on public.assinaturas_sessao for select
  using (public.pode_assinar_planejamento(planejamento_id));

-- 5. Gravar e apagar: a mesma regra.
create or replace function public.registrar_assinatura_sessao(
  p_planejamento_id uuid,
  p_sessao int,
  p_papel text,
  p_nome text,
  p_profissional_id uuid,
  p_registro text,
  p_imagem text,
  p_conteudo_hash text,
  p_resumo jsonb,
  p_aparelho text default null,
  p_triagem jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano planejamentos%rowtype;
  v_prof profissionais%rowtype;
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_registro text := nullif(btrim(regexp_replace(coalesce(p_registro, ''), '\s+', ' ', 'g')), '');
  v_prof_id uuid;
  v_max int;
  v_prefixo text;
  v_anterior text;
  v_id uuid;
  v_triagem jsonb;
begin
  -- O dono, ou a cliente do portal (acesso em dia) nos planejamentos dela.
  if not pode_assinar_planejamento(p_planejamento_id) then
    raise exception 'Sem permissão para colher assinaturas.';
  end if;
  select * into v_plano from planejamentos where id = p_planejamento_id;
  if v_plano.id is null then raise exception 'Planejamento não encontrado.'; end if;
  if p_papel is null or p_papel not in ('paciente', 'profissional') then
    raise exception 'Papel inválido.';
  end if;
  begin
    v_max := greatest(coalesce(nullif(v_plano.estado ->> 'sessoesTotal', '')::int, 1),
                      coalesce(nullif(v_plano.estado ->> 'sessaoAtual', '')::int, 1), 1);
  exception when others then v_max := 1;
  end;
  if p_sessao is null or p_sessao < 1 or p_sessao > least(v_max, 50) then
    raise exception 'Sessão inválida.';
  end if;
  if v_nome is null then raise exception 'Escreva o nome de quem assina.'; end if;
  if length(v_nome) > 120 then raise exception 'Nome grande demais.'; end if;
  if length(coalesce(v_registro, '')) > 60 then raise exception 'Registro grande demais.'; end if;
  v_prefixo := 's/' || p_planejamento_id::text || '/' || p_sessao::text || '/' || p_papel || '-';
  if p_imagem is null or left(p_imagem, length(v_prefixo)) <> v_prefixo or right(p_imagem, 4) <> '.png' then
    raise exception 'Caminho da assinatura inválido.';
  end if;
  if p_conteudo_hash is null or p_conteudo_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Conferência do conteúdo inválida.';
  end if;
  if p_resumo is null or jsonb_typeof(p_resumo) <> 'object' or pg_column_size(p_resumo) > 200000 then
    raise exception 'Resumo da sessão inválido.';
  end if;

  if p_papel = 'profissional' and p_profissional_id is not null then
    select * into v_prof from profissionais where id = p_profissional_id;
    if v_prof.id is null or v_prof.client_id is distinct from v_plano.client_id then
      raise exception 'Esta profissional não é da clínica deste planejamento.';
    end if;
    v_prof_id := v_prof.id;
    v_registro := coalesce(v_registro, v_prof.registro);
  end if;
  if p_papel = 'paciente' then v_registro := null; end if;

  -- Triagem de contraindicações e termo de consentimento: só na assinatura
  -- do paciente. Absoluta marcada exige a confirmação da profissional.
  if p_papel = 'paciente' and p_triagem is not null then
    if jsonb_typeof(p_triagem) <> 'object' or pg_column_size(p_triagem) > 50000 then
      raise exception 'Triagem inválida.';
    end if;
    v_triagem := p_triagem;
    if jsonb_typeof(v_triagem -> 'absolutas') = 'array' and jsonb_array_length(v_triagem -> 'absolutas') > 0
       and coalesce(v_triagem ->> 'absolutaConfirmada', 'false') <> 'true' then
      raise exception 'Contraindicação absoluta marcada: falta a confirmação da profissional.';
    end if;
    if coalesce(v_triagem #>> '{termo,aceito}', 'false') <> 'true' then
      raise exception 'Falta o paciente concordar com o termo de consentimento.';
    end if;
  end if;

  delete from assinaturas_sessao
   where planejamento_id = p_planejamento_id and sessao = p_sessao and papel = p_papel
   returning imagem into v_anterior;

  insert into assinaturas_sessao (planejamento_id, sessao, papel, nome, profissional_id, registro,
                                  imagem, conteudo_hash, resumo, aparelho, triagem)
  values (p_planejamento_id, p_sessao, p_papel, v_nome, v_prof_id, v_registro,
          p_imagem, p_conteudo_hash, p_resumo, nullif(left(btrim(coalesce(p_aparelho, '')), 300), ''), v_triagem)
  returning id into v_id;

  perform registrar_movimentacao('criado', 'assinatura_sessao', v_id,
    case when p_papel = 'paciente' then 'Assinatura do paciente ' else 'Assinatura da profissional ' end
      || v_nome || ' na Sessão ' || p_sessao
      || coalesce(' de ' || nullif(v_plano.paciente, ''), '')
      || case when v_anterior is not null then ' (substituiu a anterior)' else '' end
      || case when cliente_do_usuario() is not null then ' (pela cliente)' else '' end,
    jsonb_build_object('planejamento_id', p_planejamento_id, 'sessao', p_sessao, 'papel', p_papel,
                       'conteudo_hash', p_conteudo_hash, 'profissional_id', v_prof_id,
                       'triagem', v_triagem ->> 'situacao', 'termo_versao', v_triagem #>> '{termo,versao}'));
  return jsonb_build_object('id', v_id, 'anterior', v_anterior);
end;
$$;
revoke execute on function public.registrar_assinatura_sessao(uuid, int, text, text, uuid, text, text, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.registrar_assinatura_sessao(uuid, int, text, text, uuid, text, text, text, jsonb, text, jsonb) to authenticated, service_role;

create or replace function public.excluir_assinatura_sessao(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a assinaturas_sessao%rowtype;
begin
  select * into a from assinaturas_sessao where id = p_id;
  if a.id is null or not pode_assinar_planejamento(a.planejamento_id) then
    raise exception 'Sem permissão para apagar assinaturas.';
  end if;
  delete from assinaturas_sessao where id = p_id;
  perform registrar_movimentacao('excluido', 'assinatura_sessao', a.id,
    case when a.papel = 'paciente' then 'Assinatura do paciente ' else 'Assinatura da profissional ' end
      || a.nome || ' na Sessão ' || a.sessao || ' apagada',
    jsonb_build_object('planejamento_id', a.planejamento_id, 'sessao', a.sessao, 'papel', a.papel));
  return jsonb_build_object('caminho', a.imagem);
end;
$$;
revoke execute on function public.excluir_assinatura_sessao(uuid) from public, anon;
grant execute on function public.excluir_assinatura_sessao(uuid) to authenticated, service_role;

-- 6. Pasta "assinaturas" do Storage: a mesma regra, pelo planejamento no caminho do arquivo.
do $assinaturas$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sem Storage do Supabase: políticas da pasta das assinaturas não mudaram.';
    return;
  end if;
  drop policy if exists "assinaturas_ler" on storage.objects;
  drop policy if exists "assinaturas_enviar" on storage.objects;
  drop policy if exists "assinaturas_apagar" on storage.objects;
  create policy "assinaturas_ler" on storage.objects for select to authenticated
    using (bucket_id = 'assinaturas' and public.pode_assinar_planejamento(public.planejamento_do_caminho_assinatura(name)));
  create policy "assinaturas_enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'assinaturas' and public.pode_assinar_planejamento(public.planejamento_do_caminho_assinatura(name)));
  create policy "assinaturas_apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'assinaturas' and public.pode_assinar_planejamento(public.planejamento_do_caminho_assinatura(name)));
end
$assinaturas$;
