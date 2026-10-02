-- ============================================================
-- FUNIL DE CLIENTES, PARTE 1
--
-- A etapa do cliente (Reativar / Pré-reserva / Agendamento / Cliente) não
-- é gravada: a tela calcula na hora, a partir das reservas futuras, da
-- taxa de reserva e da última locação. Por isso aqui só entram:
--   1) duas configurações de automação em settings;
--   2) uma view com a última locação concluída de cada cliente.
-- Rodar também no SQL editor do Supabase. Seguro rodar de novo.
-- ============================================================

alter table public.settings
  add column if not exists dias_ate_reativar integer not null default 45,
  add column if not exists recontato_intervalo_dias integer not null default 10;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'settings_automacao_dias_check'
  ) then
    alter table public.settings
      add constraint settings_automacao_dias_check
      check (dias_ate_reativar between 1 and 3650 and recontato_intervalo_dias between 1 and 365);
  end if;
end $$;

comment on column public.settings.dias_ate_reativar is
  'Dias sem locação concluída para o cliente sair da etapa "Cliente" e cair em "Reativar" no funil de clientes. Padrão 45.';
comment on column public.settings.recontato_intervalo_dias is
  'Intervalo, em dias, da tarefa automática de recontato de clientes nas etapas Cliente e Reativar. Padrão 10. Usado pela rotina de tarefas (Parte 2 do funil).';

create or replace view public.clientes_ultima_locacao
with (security_invoker = true) as
select
  r.client_id,
  max(r.event_date) as ultima_locacao
from public.rentals r
where r.status <> 'cancelada'
  and r.event_date <= public.hoje_local()
group by r.client_id;

comment on view public.clientes_ultima_locacao is
  'Data da última locação já ocorrida (não cancelada) de cada cliente. Base da etapa Cliente/Reativar no funil.';

grant select on public.clientes_ultima_locacao to authenticated;
