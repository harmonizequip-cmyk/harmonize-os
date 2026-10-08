-- ============================================================
-- STATUS: NÃO APLICADA. Rodar no Supabase (projeto vidnlzbxaxjlmzncqhxw) com o aval do dono.
--
-- Fotos do contador do HIPRO e comprovantes de pagamento.
--   Pasta privada "fotos-contador" no Storage do Supabase. Cada reserva ou
--   locação da agenda guarda até duas fotos do visor do equipamento:
--   <id do evento>/entrega.jpg e <id do evento>/busca.jpg. O app reduz a foto
--   antes de enviar (cerca de 200 KB), então o 1 GB do plano gratuito cabe
--   alguns milhares de fotos.
--   Ninguém de fora vê: a pasta não é pública e só quem tem o módulo
--   "agenda" lê, envia, troca ou apaga.
--   Pasta privada "comprovantes": comprovante de pagamento que chega pelo
--   "Compartilhar > Harmonize" do WhatsApp ou é anexado à mão.
--   locacao/<id da locação>/... e taxa/<id da reserva>/... (foto ou PDF).
--   Só quem tem o módulo "financeiro".
-- O bloco só roda onde existe o Storage do Supabase (num Postgres comum,
-- como o do teste de restauração, ele não faz nada).
-- ============================================================

do $fotos$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sem Storage do Supabase: pastas de fotos e comprovantes não criadas.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('fotos-contador', 'fotos-contador', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "fotos_contador_ler" on storage.objects;
  drop policy if exists "fotos_contador_enviar" on storage.objects;
  drop policy if exists "fotos_contador_trocar" on storage.objects;
  drop policy if exists "fotos_contador_apagar" on storage.objects;

  create policy "fotos_contador_ler" on storage.objects for select to authenticated
    using (bucket_id = 'fotos-contador' and public.has_module_permission('agenda'));
  create policy "fotos_contador_enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'fotos-contador' and public.has_module_permission('agenda'));
  create policy "fotos_contador_trocar" on storage.objects for update to authenticated
    using (bucket_id = 'fotos-contador' and public.has_module_permission('agenda'))
    with check (bucket_id = 'fotos-contador' and public.has_module_permission('agenda'));
  create policy "fotos_contador_apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'fotos-contador' and public.has_module_permission('agenda'));

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('comprovantes', 'comprovantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "comprovantes_ler" on storage.objects;
  drop policy if exists "comprovantes_enviar" on storage.objects;
  drop policy if exists "comprovantes_apagar" on storage.objects;

  create policy "comprovantes_ler" on storage.objects for select to authenticated
    using (bucket_id = 'comprovantes' and public.has_module_permission('financeiro'));
  create policy "comprovantes_enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'comprovantes' and public.has_module_permission('financeiro'));
  create policy "comprovantes_apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'comprovantes' and public.has_module_permission('financeiro'));
end
$fotos$;
