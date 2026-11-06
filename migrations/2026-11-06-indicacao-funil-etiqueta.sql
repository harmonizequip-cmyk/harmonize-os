-- Quem veio por indicação (indicado_por preenchido ou origem 'indicacao') ganha a
-- etiqueta "Indicação" e, se ainda é lead nas etapas iniciais, vai para Interesse
-- (stage 'qualificado'). Pedido do dono, 05/11/2026.

insert into public.tags (name, color, is_automatic)
values ('Indicação', '#E8789A', true)
on conflict (name) do nothing;

create or replace function public.indicacao_marcar_no_funil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag uuid;
begin
  if new.is_test then return new; end if;
  if new.indicado_por is null and coalesce(new.origem, '') <> 'indicacao' then return new; end if;
  if tg_op = 'UPDATE'
     and new.indicado_por is not distinct from old.indicado_por
     and new.origem is not distinct from old.origem then
    return new;
  end if;
  select id into v_tag from tags where name = 'Indicação';
  if v_tag is null then
    insert into tags (name, color, is_automatic) values ('Indicação', '#E8789A', true)
    on conflict (name) do nothing returning id into v_tag;
    if v_tag is null then select id into v_tag from tags where name = 'Indicação'; end if;
  end if;
  insert into client_tags (client_id, tag_id) values (new.id, v_tag) on conflict do nothing;
  if not coalesce(new.is_client, false) and new.stage in ('lead', 'contato', 'nutricao', 'em_contato') then
    update clients set stage = 'qualificado' where id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.indicacao_marcar_no_funil() from public, anon, authenticated;
drop trigger if exists trg_indicacao_marcar_no_funil on public.clients;
create trigger trg_indicacao_marcar_no_funil after insert or update of indicado_por, origem on public.clients
  for each row execute function public.indicacao_marcar_no_funil();

-- Quem já veio por indicação antes deste SQL: etiqueta para todos e Interesse para lead
-- nas etapas iniciais (prévia de 06/11/2026: 5 com etiqueta, 2 leads mudam de etapa).
insert into client_tags (client_id, tag_id)
select c.id, t.id from clients c cross join tags t
 where t.name = 'Indicação' and not c.is_test
   and (c.indicado_por is not null or c.origem = 'indicacao')
on conflict do nothing;
update clients set stage = 'qualificado'
 where not is_test and not coalesce(is_client, false)
   and stage in ('lead', 'contato', 'nutricao', 'em_contato')
   and (indicado_por is not null or origem = 'indicacao');
