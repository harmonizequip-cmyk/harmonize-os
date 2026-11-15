-- Planejador: digitar o nome do paciente não cria mais um cadastro por pausa (14/11/2026).
-- O salvamento automático gravava o plano a cada pausa na digitação e `salvar_planejamento`
-- criava um paciente novo para cada nome parcial (R, RI, RIA, RIANN...), que ficavam sem planejamento.
-- 1) A função agora apaga o cadastro anterior quando ele é recente (menos de 1 dia), está vazio
--    (sem WhatsApp, nascimento, observações, autorização de fotos nem fotos) e não tem outro planejamento.
-- 2) Limpeza dos cadastros que já sobraram: só os criados a partir de 14/11/2026, vazios e sem planejamento.

create or replace function public.salvar_planejamento(p_id uuid, p_client_id uuid, p_calendar_event_id uuid, p_estado jsonb, p_total integer default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_e jsonb := coalesce(p_estado, '{}'::jsonb);
  v_data date;
  v_retorno date;
  v_saldo integer;
  v_cliente uuid := cliente_do_usuario();
  v_client_id uuid := p_client_id;
  v_evento uuid := p_calendar_event_id;
  v_nome text;
  v_paciente uuid;
  v_antigo uuid;
begin
  if v_cliente is null and not has_module_permission('agenda') then
    raise exception 'Sem permissão para salvar planejamentos.';
  end if;
  if v_cliente is not null then
    v_client_id := v_cliente;
    if v_id is null then
      v_evento := null;
    else
      select calendar_event_id into v_evento from planejamentos where id = v_id and client_id = v_cliente;
      if not found then raise exception 'Planejamento não encontrado.'; end if;
    end if;
  end if;
  if jsonb_typeof(v_e) <> 'object' then
    raise exception 'Planejamento inválido.';
  end if;
  if pg_column_size(v_e) > 2000000 then
    raise exception 'Planejamento grande demais.';
  end if;
  begin v_data := nullif(v_e ->> 'data', '')::date; exception when others then v_data := null; end;
  begin v_retorno := nullif(v_e ->> 'dataRetorno', '')::date; exception when others then v_retorno := null; end;
  begin v_saldo := coalesce(nullif(v_e ->> 'saldoTotal', '')::integer, 0); exception when others then v_saldo := 0; end;

  -- Paciente: o escolhido na tela (se for da mesma cliente) ou o de mesmo nome; sem nenhum, cria.
  v_nome := nullif(btrim(regexp_replace(coalesce(v_e ->> 'paciente', ''), '\s+', ' ', 'g')), '');
  if v_nome is not null then
    begin
      select id, nome into v_paciente, v_nome from pacientes
       where id = nullif(v_e ->> 'pacienteId', '')::uuid and client_id is not distinct from v_client_id;
    exception when others then v_paciente := null;
    end;
    if v_paciente is null then
      v_nome := nullif(btrim(regexp_replace(coalesce(v_e ->> 'paciente', ''), '\s+', ' ', 'g')), '');
      select id, nome into v_paciente, v_nome from pacientes
       where client_id is not distinct from v_client_id
         and normalizar_nome_paciente(nome) = normalizar_nome_paciente(v_nome)
       order by created_at limit 1;
      if v_paciente is null then
        v_nome := nullif(btrim(regexp_replace(coalesce(v_e ->> 'paciente', ''), '\s+', ' ', 'g')), '');
        insert into pacientes (client_id, nome) values (v_client_id, v_nome) returning id into v_paciente;
      end if;
    end if;
    v_e := v_e || jsonb_build_object('paciente', v_nome, 'pacienteId', v_paciente::text);
  else
    v_e := v_e - 'pacienteId';
  end if;

  if v_id is null then
    insert into planejamentos (client_id, calendar_event_id, paciente, paciente_id, data, data_retorno, procedimento, saldo_total, total_disparos, estado)
    values (v_client_id, v_evento, v_nome, v_paciente, coalesce(v_data, hoje_local()), v_retorno,
            nullif(btrim(v_e ->> 'procNome'), ''), v_saldo, greatest(coalesce(p_total, 0), 0), v_e)
    returning id into v_id;
    perform registrar_movimentacao('criado', 'planejamento', v_id,
      'Planejamento HIPRO criado' || coalesce(' para ' || v_nome, '')
        || case when v_cliente is not null then ' (pela cliente)' else '' end,
      jsonb_build_object('client_id', v_client_id, 'calendar_event_id', v_evento, 'paciente_id', v_paciente));
  else
    select paciente_id into v_antigo from planejamentos where id = v_id;
    update planejamentos set
      client_id = v_client_id,
      calendar_event_id = v_evento,
      paciente = v_nome,
      paciente_id = v_paciente,
      data = coalesce(v_data, data),
      data_retorno = v_retorno,
      procedimento = nullif(btrim(v_e ->> 'procNome'), ''),
      saldo_total = v_saldo,
      total_disparos = greatest(coalesce(p_total, 0), 0),
      estado = v_e,
      updated_at = now()
    where id = v_id and (v_cliente is null or client_id = v_cliente);
    if not found then raise exception 'Planejamento não encontrado.'; end if;
    -- Digitar o nome salva o plano várias vezes (R, RI, RIA...) e cada pausa criava um paciente.
    -- O cadastro que ficou para trás, recente, sem dados e sem outro planejamento, é apagado.
    if v_antigo is not null and v_antigo is distinct from v_paciente then
      delete from pacientes pa
       where pa.id = v_antigo
         and pa.created_at > now() - interval '1 day'
         and pa.whatsapp is null and pa.nascimento is null and pa.observacoes is null
         and pa.fotos_autorizadas_em is null
         and not exists (select 1 from planejamentos p where p.paciente_id = pa.id)
         and not exists (select 1 from paciente_fotos f where f.paciente_id = pa.id);
    end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.salvar_planejamento(uuid, uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.salvar_planejamento(uuid, uuid, uuid, jsonb, integer) to authenticated, service_role;

-- Limpeza dos cadastros vazios que sobraram (G, Gen, Geni, Geni B, Geni Bandei, R, RI, RIA, RIANN, RIHANNA).
delete from public.pacientes pa
 where pa.created_at >= '2026-11-14'
   and pa.whatsapp is null and pa.nascimento is null and pa.observacoes is null
   and pa.fotos_autorizadas_em is null
   and not exists (select 1 from public.planejamentos p where p.paciente_id = pa.id)
   and not exists (select 1 from public.paciente_fotos f where f.paciente_id = pa.id);
