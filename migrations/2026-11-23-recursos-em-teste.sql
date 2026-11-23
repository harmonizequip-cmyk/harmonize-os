-- Recursos em teste (23/11/2026, pedido do dono): recurso novo para as clientes
-- do portal só aparece depois que o dono libera em Configurações > Recursos em teste.
-- A lista fica em settings.preferencias.recursos.liberados (o dono grava como
-- qualquer preferência). Login de cliente não lê a tabela settings, então o portal
-- pergunta por esta função, que devolve só a lista de ids liberados.

create or replace function public.recursos_liberados()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select array_agg(x)
       from settings s,
            jsonb_array_elements_text(
              case when jsonb_typeof(s.preferencias -> 'recursos' -> 'liberados') = 'array'
                   then s.preferencias -> 'recursos' -> 'liberados' else '[]'::jsonb end
            ) as x
      where s.id),
    '{}'::text[]);
$$;
revoke execute on function public.recursos_liberados() from public, anon;
grant execute on function public.recursos_liberados() to authenticated, service_role;
