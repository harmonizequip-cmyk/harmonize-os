-- ============================================================
-- LEVA L: check (time_end >= time_start) em calendar_events
--
-- Item 10 da auditoria externa. Conferido antes de travar: rodei
--   select id, time_start, time_end from calendar_events
--    where time_start is not null and time_end is not null
--      and time_end < time_start;
-- e voltou vazio, então não há dado existente que essa regra rejeite.
-- ============================================================

alter table public.calendar_events drop constraint if exists calendar_events_time_order_check;
alter table public.calendar_events add constraint calendar_events_time_order_check
  check (time_start is null or time_end is null or time_end >= time_start);
