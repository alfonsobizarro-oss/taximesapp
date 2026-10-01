-- Local-only preparation. Does not configure a provider, secrets, cron or remote execution.
begin;
alter table public.tx_reservation_mail
 add column kind text not null default 'reminder' check (kind in ('reminder','assignment','change')),
 add column context jsonb;

create or replace function public.tx_load_reservations() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_set(base,'{state}',(base->'state')||jsonb_build_object('reservationMail',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'reservation_id',reservation_id,'revision',revision,'state',state,'sent_at',sent_at,'last_error',last_error)) from public.tx_reservation_mail),'[]'::jsonb),'reservations',coalesce((select jsonb_agg(body order by body->>'start',id) from public.tx_reservations),'[]'::jsonb))) from public.tx_load_coordination() base;
$$;

create or replace function public.tx_commit_reservations(expected_version bigint,next_state jsonb,new_events jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare v bigint; item jsonb;
begin
 if jsonb_typeof(coalesce(next_state->'reservations','[]'::jsonb)) is distinct from 'array' or jsonb_typeof(new_events) is distinct from 'array' then raise exception 'TX_INVALID_RESERVATIONS'; end if;
 v:=public.tx_commit_coordination(expected_version,next_state,coalesce((select jsonb_agg(value) from jsonb_array_elements(new_events) where value->>'type' not like 'reservation.%'),'[]'::jsonb));
 for item in select value from jsonb_array_elements(coalesce(next_state->'reservations','[]'::jsonb)) loop
  insert into public.tx_reservations(id,body) values(item->>'id',item) on conflict(id) do update set body=excluded.body where tx_reservations.body is distinct from excluded.body;
 end loop;
 insert into public.tx_reservation_events(id,event) select (value->>'id')::uuid,value from jsonb_array_elements(new_events) where value->>'type' like 'reservation.%';
 -- Same transaction/row lock as state, notices and audit. No provider calls under lock.
 update public.tx_reservation_mail m set state='obsolete',lease=null,lease_until=null
 where state in ('pending','sending') and not exists(select 1 from public.tx_reservations r join public.tx_records u on u.kind='users' and u.id=m.user_id
  where r.id=m.reservation_id and r.body->>'assignedTo'=m.user_id and r.body->>'status'='assigned'
    and (case when m.kind='reminder' then coalesce(r.body->>'reminderRevision',r.body->>'revision')=m.revision
         else coalesce(r.body->>'assignmentRevision',r.body->>'acceptedAt')=coalesce(m.context->'after'->>'assignmentRevision',m.context->'after'->>'acceptedAt') end)
    and (m.kind='change' or r.body->>'releaseRequest' is null) and u.body->>'status'='active' and u.body->>'role'='reservation' and u.body->'reservationTypes' ? (r.body->>'kind'));
 -- Preserve 24h reminders for appointments with enough lead time. A minor edit keeps
 -- reminderRevision, including sent jobs. Short-notice acceptance uses assignment mail.
 insert into public.tx_reservation_mail(id,reservation_id,revision,user_id,due_at,kind)
 select r.id||':'||coalesce(r.body->>'reminderRevision',r.body->>'revision'),r.id,coalesce(r.body->>'reminderRevision',r.body->>'revision'),r.body->>'assignedTo',(r.body->>'start')::timestamptz-interval '24 hours','reminder'
 from public.tx_reservations r join public.tx_records u on u.kind='users' and u.id=r.body->>'assignedTo'
 where r.body->>'status'='assigned' and r.body->>'releaseRequest' is null and u.body->>'status'='active' and u.body->>'role'='reservation' and u.body->'reservationTypes' ? (r.body->>'kind')
   and (r.body->>'start')::timestamptz >= now()+interval '24 hours'
 on conflict(id) do nothing;
 -- Event snapshots are immutable; separate kinds cannot collide with the reminder.
 insert into public.tx_reservation_mail(id,reservation_id,revision,user_id,due_at,kind,context)
 select (e->>'recordId')||':'||(e->'after'->>'revision')||':'||case when e->>'type'='reservation.accept' then 'assignment' else 'change' end,
   e->>'recordId',e->'after'->>'revision',e->'after'->>'assignedTo',(e->>'at')::timestamptz,
   case when e->>'type'='reservation.accept' then 'assignment' else 'change' end,
   jsonb_build_object('at',e->'at','before',e->'before','after',e->'after','changes',e->'changes','requiresReconfirmation',coalesce(e->'requiresReconfirmation','false'::jsonb))
 from jsonb_array_elements(new_events) e
 where e->'after'->>'status'='assigned' and e->'after'->>'assignedTo' is not null and (e->>'type'='reservation.save' or e->'after'->>'releaseRequest' is null)
   and (e->>'type'='reservation.accept' or (e->>'type'='reservation.save' and jsonb_array_length(coalesce(e->'changes','[]'::jsonb))>0))
 on conflict(id) do nothing;
 return v;
end $$;
-- Changes to a service still assigned can be notified after its start; assignments
-- and reminders become obsolete at start as before. Completed/cancelled jobs are
-- invalidated by commit and checked again by the worker.
create or replace function public.tx_claim_reservation_mail() returns setof public.tx_reservation_mail
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.tx_workspace where id=true for update;
 update public.tx_reservation_mail set state='review',last_error='Revisar entrega antes de reintentar: ventana de idempotencia agotada.' where state in ('pending','sending') and first_attempt_at < now()-interval '23 hours';
 update public.tx_reservation_mail m set state='obsolete' where kind<>'change' and state in ('pending','sending') and exists(select 1 from public.tx_reservations r where r.id=m.reservation_id and (r.body->>'start')::timestamptz<=now());
 return query with candidate as (
 select id from public.tx_reservation_mail where due_at<=now() and (state='pending' or (state='sending' and lease_until<now())) order by due_at,id limit 1 for update skip locked
 ) update public.tx_reservation_mail m set state='sending',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1 from candidate c where m.id=c.id returning m.*;
end $$;
-- Existing service_role-only grants, RLS and leased claiming/retry window are retained.
commit;
