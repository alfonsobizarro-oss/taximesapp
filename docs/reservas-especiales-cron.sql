-- PLANTILLA MANUAL. NO EJECUTADA. Requiere aprobación y un entorno de prueba primero.
-- Revisar pg_cron, pg_net y Vault existentes: no habilitar extensiones a ciegas.
-- Guardar en Vault, fuera del código, los secretos:
--   reservation_reminders_url = URL HTTPS de /functions/v1/reservation-reminders
--   reservation_cron_secret = mismo token que RESERVATION_CRON_SECRET en la función
-- Confirmar primero remitente, proveedor, prueba de entrega y verify_jwt=false de esta función.
-- Verificar que no existe ya un job taximes-reservation-reminders antes de crear uno.
select cron.schedule(
 'taximes-reservation-reminders',
 '* * * * *',
 $job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='reservation_reminders_url'),
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
     (select decrypted_secret from vault.decrypted_secrets where name='reservation_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 30000
 );
 $job$
);
-- Comprobar cron.job_run_details y net._http_response sin volcar secretos.
-- Una pausa operativa debe desactivar el job revisado, sin borrar reservas ni auditoría.
