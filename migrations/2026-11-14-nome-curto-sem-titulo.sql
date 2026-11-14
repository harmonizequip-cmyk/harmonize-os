-- Nome curto da cliente (Dra. Ana) para o link de indicação e as mensagens.
-- Correção de 14/11/2026: quando o campo "Nome" começa com "DR." ou "DRA." e o
-- cadastro não tem tratamento nem nome de exibição, a função devolvia só "Dr."
-- (o título era tomado como primeiro nome). Agora o título é tirado do começo,
-- vira o tratamento, e o primeiro nome vem logo depois (mesma regra de lib/saudacao.ts).
create or replace function public.nome_curto_cliente(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select nullif(btrim(c.treatment), '') as trat,
           nullif(btrim(c.display_name), '') as exib,
           btrim(coalesce(c.name, '')) as nome
      from clients c where c.id = p_client_id
  ), partes as (
    select trat, exib, nome,
           (regexp_match(nome, '^(dr|dra|doutor|doutora)\.?(\s+|$)', 'i'))[1] as titulo,
           regexp_replace(nome, '^(dr|dra|doutora|doutor)\.?(\s+|$)', '', 'i') as resto
      from base
  ), prim as (
    select trat, titulo,
           coalesce(
             (regexp_match(regexp_replace(coalesce(exib, ''), '^(dr|dra|doutora|doutor)\.?\s+', '', 'i'), '^[^\s().,\-0-9]+'))[1],
             (regexp_match(resto, '^[^\s().,\-0-9]+'))[1]
           ) as pn
      from partes
  )
  select nullif(btrim(
           coalesce(coalesce(trat, case lower(titulo) when 'dr' then 'Dr.' when 'doutor' then 'Dr.'
                                                      when 'dra' then 'Dra.' when 'doutora' then 'Dra.' end) || ' ', '')
           || initcap(lower(pn))), '')
    from prim
   where pn is not null;
$$;
revoke execute on function public.nome_curto_cliente(uuid) from public, anon, authenticated;
grant execute on function public.nome_curto_cliente(uuid) to service_role;
