-- ============================================================
-- STATUS: APLICADA no Supabase (projeto vidnlzbxaxjlmzncqhxw) em 08/10/2026, pelo dono, e conferida por consulta de leitura (job harmonize-alerta-domingo, 0 22 * * 0, ativo).
--
-- Aviso de domingo no celular: todo domingo às 19h (22:00 em UTC) a função
-- "alertas" manda o fechamento da semana (faturado, recebido, a receber,
-- contas fixas do mês) e o lembrete do backup semanal, que abre
-- Configurações já com o arquivo pronto para salvar no Google Drive.
-- Mesmo formato dos dois horários que já existem (7h30 e 18h).
-- O bloco só roda onde existem pg_cron, pg_net e o cofre (vault); num
-- Postgres comum não faz nada.
-- ============================================================

do $domingo$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    perform cron.unschedule(jobid) from cron.job where jobname = 'harmonize-alerta-domingo';
    perform cron.schedule(
      'harmonize-alerta-domingo',
      '0 22 * * 0',
      $job$
      select net.http_post(
        url := 'https://vidnlzbxaxjlmzncqhxw.supabase.co/functions/v1/alertas',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-alerta-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'harmonize_alertas_segredo')
        ),
        body := jsonb_build_object('tipo', 'domingo')
      );
      $job$
    );
  else
    raise notice 'Sem pg_cron/pg_net/vault: aviso de domingo não agendado.';
  end if;
end
$domingo$;
