-- ============================================================
-- Remove a etiqueta automática "Reagendamento" dos clientes.
-- A contagem de reagendadas (Dashboard, ficha, Funil, Locações) vem de
-- calendar_events.rescheduled e rentals.rescheduled e NÃO é afetada.
-- Rodar também no SQL editor do Supabase. Seguro rodar de novo.
-- ============================================================

drop trigger if exists trg_calendar_event_reschedule on public.calendar_events;
drop function if exists public.handle_calendar_event_reschedule();

-- client_tags tem on delete cascade: a etiqueta some de todos os clientes.
delete from public.tags where name = 'Reagendamento' and is_automatic;
