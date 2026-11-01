-- Triagem de contraindicações e termo de consentimento na assinatura do
-- paciente (Planejador HIPRO, "Colher assinaturas"; pedido do dono a partir
-- do e-book do HIPRO, cap. 8, 22 e 24). 01/11/2026.
--
-- 1) assinaturas_sessao.triagem (jsonb, nulo nas assinaturas antigas e na da
--    profissional): condições marcadas (absolutas e relativas), confirmação
--    da profissional, disparo teste, versão e texto do termo aceito.
--    Fica FORA do conteudo_hash (o hash continua só do atendimento).
-- 2) registrar_assinatura_sessao ganha p_triagem jsonb default null no fim.
--    Chamada sem ele funciona como antes. A assinatura antiga (10 parâmetros)
--    é apagada para não haver duas versões; revoke/grant na nova.
-- Pode rodar mais de uma vez.

alter table public.assinaturas_sessao add column if not exists triagem jsonb;
alter table public.assinaturas_sessao drop constraint if exists assinaturas_sessao_triagem_objeto;
alter table public.assinaturas_sessao add constraint assinaturas_sessao_triagem_objeto
  check (triagem is null or jsonb_typeof(triagem) = 'object');
comment on column public.assinaturas_sessao.triagem is
  'Só na assinatura do paciente: triagem de contraindicações (situacao sem/relativa/absoluta, marcadas, absolutas, relativas, nomes, disparoTeste, relativaLiberada, absolutaConfirmada) e termo de consentimento aceito (termo.versao, termo.texto, termo.resumo). Fora do conteudo_hash.';

drop function if exists public.registrar_assinatura_sessao(uuid, int, text, text, uuid, text, text, text, jsonb, text);

-- Registra (ou substitui) a assinatura de um papel numa sessão. Devolve o id
-- novo e o caminho da imagem anterior (para a tela apagar o arquivo).
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
  if not pode_assinar_sessao() then
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
      || case when v_anterior is not null then ' (substituiu a anterior)' else '' end,
    jsonb_build_object('planejamento_id', p_planejamento_id, 'sessao', p_sessao, 'papel', p_papel,
                       'conteudo_hash', p_conteudo_hash, 'profissional_id', v_prof_id,
                       'triagem', v_triagem ->> 'situacao', 'termo_versao', v_triagem #>> '{termo,versao}'));
  return jsonb_build_object('id', v_id, 'anterior', v_anterior);
end;
$$;
revoke execute on function public.registrar_assinatura_sessao(uuid, int, text, text, uuid, text, text, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.registrar_assinatura_sessao(uuid, int, text, text, uuid, text, text, text, jsonb, text, jsonb) to authenticated, service_role;
