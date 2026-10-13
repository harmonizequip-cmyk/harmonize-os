-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 13/10/2026, pelo dono, e conferida por consulta de leitura (taxas pendentes de parceiro 0, gatilhos 2, anon sem acesso).
-- Parceiro não paga taxa de reserva, também nas reservas que já existiam.
--   A taxa nasce no insert (definir_taxa_ao_criar_evento), olhando se o
--   cliente é parceiro naquele momento. Quem virava parceiro depois, ou
--   reserva que trocava de cliente, ficava com a taxa pendente e era
--   cobrada (ex.: DR. EDUARDO, reserva de 03/11/2026).
--   1. Cliente marcado como parceiro: as taxas pendentes dele viram
--      "não se aplica" e as tarefas de cobrança somem.
--   2. Reserva que passa para um cliente parceiro: mesma coisa.
--   3. Acerto das que já estão assim.
-- Taxa já paga fica como está (é dinheiro que entrou).
-- ============================================================

create or replace function public.isentar_taxa_de_parceiro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parceiro and not coalesce(old.parceiro, false) then
    update calendar_events
       set taxa_status = 'nao_aplica'
     where client_id = new.id
       and taxa_status = 'pendente';
    delete from tasks
     where client_id = new.id
       and type = 'cobranca_taxa'
       and status = 'pendente';
  end if;
  return new;
end;
$$;

revoke execute on function public.isentar_taxa_de_parceiro() from public, anon;
grant execute on function public.isentar_taxa_de_parceiro() to authenticated, service_role;

drop trigger if exists clients_isentar_taxa_parceiro on public.clients;
create trigger clients_isentar_taxa_parceiro
  after update of parceiro on public.clients
  for each row execute function public.isentar_taxa_de_parceiro();

create or replace function public.isentar_taxa_ao_trocar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.taxa_status = 'pendente'
     and new.client_id is distinct from old.client_id
     and exists (select 1 from clients where id = new.client_id and parceiro) then
    new.taxa_status := 'nao_aplica';
    delete from tasks where event_id = new.id and type = 'cobranca_taxa' and status = 'pendente';
  end if;
  return new;
end;
$$;

revoke execute on function public.isentar_taxa_ao_trocar_cliente() from public, anon;
grant execute on function public.isentar_taxa_ao_trocar_cliente() to authenticated, service_role;

drop trigger if exists calendar_events_isentar_taxa_parceiro on public.calendar_events;
create trigger calendar_events_isentar_taxa_parceiro
  before update of client_id on public.calendar_events
  for each row execute function public.isentar_taxa_ao_trocar_cliente();

-- Acerto: taxas pendentes de quem já é parceiro.
delete from public.tasks t
 using public.clients c
 where c.id = t.client_id and c.parceiro
   and t.type = 'cobranca_taxa' and t.status = 'pendente';

update public.calendar_events ce
   set taxa_status = 'nao_aplica'
  from public.clients c
 where c.id = ce.client_id and c.parceiro
   and ce.taxa_status = 'pendente';
