-- Additive, server-only, reviewed locally. Requires adviser_coordination first.
begin;
create table public.tx_reservations (
 id text primary key,
 body jsonb not null check(jsonb_typeof(body)='object' and body->>'id'=id
   and body ?& array['start','kind','status','revision','pickup','destination']
   and body->>'kind' in ('MONOVOLUMEN','ADAPTADO')
   and body->>'status' in ('pending','assigned','completed','cancelled')
   and (body->>'status' not in ('assigned','completed') or body->>'assignedTo' is not null))
);
create table public.tx_reservation_events (
 sequence bigint generated always as identity primary key,
 id uuid not null unique,
 event jsonb not null check(jsonb_typeof(event)='object' and event->>'id'=id::text and event ?& array['at','type','actorId','recordId','before','after'])
);
create table public.tx_reservation_mail (
 id text primary key, reservation_id text not null references public.tx_reservations(id),
 revision text not null, user_id text not null, due_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','obsolete','review')),
 lease uuid, lease_until timestamptz, first_attempt_at timestamptz,
 attempts integer not null default 0, sent_at timestamptz, provider_id text,
 last_error text, payload jsonb
);
create index tx_reservation_mail_due on public.tx_reservation_mail(due_at) where state in ('pending','sending');
alter table public.tx_reservations enable row level security;
alter table public.tx_reservation_events enable row level security;
alter table public.tx_reservation_mail enable row level security;
revoke all on public.tx_reservations,public.tx_reservation_events,public.tx_reservation_mail from public,anon,authenticated,service_role;
grant select,insert,update on public.tx_reservations,public.tx_reservation_mail to service_role;
grant select,insert on public.tx_reservation_events to service_role;
revoke all on sequence public.tx_reservation_events_sequence_seq from public,anon,authenticated,service_role;
grant usage on sequence public.tx_reservation_events_sequence_seq to service_role;

create function public.tx_load_reservations() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_set(base,'{state}',(base->'state')||jsonb_build_object('reservationMail',coalesce((select jsonb_agg(jsonb_build_object('reservation_id',reservation_id,'revision',revision,'state',state,'sent_at',sent_at,'last_error',last_error)) from public.tx_reservation_mail),'[]'::jsonb),'reservations',coalesce((select jsonb_agg(body order by body->>'start',id) from public.tx_reservations),'[]'::jsonb))) from public.tx_load_coordination() base;
$$;
create function public.tx_commit_reservations(expected_version bigint,next_state jsonb,new_events jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare v bigint; item jsonb;
begin
 if jsonb_typeof(coalesce(next_state->'reservations','[]'::jsonb)) is distinct from 'array' or jsonb_typeof(new_events) is distinct from 'array' then raise exception 'TX_INVALID_RESERVATIONS'; end if;
 v:=public.tx_commit_coordination(expected_version,next_state,coalesce((select jsonb_agg(value) from jsonb_array_elements(new_events) where value->>'type' not like 'reservation.%'),'[]'::jsonb));
 for item in select value from jsonb_array_elements(coalesce(next_state->'reservations','[]'::jsonb)) loop
  insert into public.tx_reservations(id,body) values(item->>'id',item) on conflict(id) do update set body=excluded.body where tx_reservations.body is distinct from excluded.body;
 end loop;
 insert into public.tx_reservation_events(id,event) select (value->>'id')::uuid,value from jsonb_array_elements(new_events) where value->>'type' like 'reservation.%';
 -- The same lock/transaction protects reservation, permissions, audit, and reminder creation.
 update public.tx_reservation_mail m set state='obsolete',lease=null,lease_until=null
 where state in ('pending','sending') and not exists(select 1 from public.tx_reservations r join public.tx_records u on u.kind='users' and u.id=m.user_id
  where r.id=m.reservation_id and r.body->>'revision'=m.revision and r.body->>'assignedTo'=m.user_id and r.body->>'status'='assigned'
    and r.body->>'releaseRequest' is null and u.body->>'status'='active' and u.body->>'role'='reservation' and u.body->'reservationTypes' ? (r.body->>'kind'));
 insert into public.tx_reservation_mail(id,reservation_id,revision,user_id,due_at)
 select r.id||':'||(r.body->>'revision'),r.id,r.body->>'revision',r.body->>'assignedTo',(r.body->>'start')::timestamptz-interval '24 hours'
 from public.tx_reservations r join public.tx_records u on u.kind='users' and u.id=r.body->>'assignedTo'
 where r.body->>'status'='assigned' and r.body->>'releaseRequest' is null and u.body->>'status'='active' and u.body->>'role'='reservation' and u.body->'reservationTypes' ? (r.body->>'kind')
 on conflict(id) do nothing;
 return v;
end $$;
-- Leased outbox. Provider retries use one immutable payload and idempotency key.
-- Stop after 23 hours: Resend's deduplication window is 24 hours; ambiguous jobs need review.
create function public.tx_claim_reservation_mail() returns setof public.tx_reservation_mail
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.tx_workspace where id=true for update;
 update public.tx_reservation_mail set state='review',last_error='Revisar entrega antes de reintentar: ventana de idempotencia agotada.' where state in ('pending','sending') and first_attempt_at < now()-interval '23 hours';
 update public.tx_reservation_mail m set state='obsolete' where state in ('pending','sending') and exists(select 1 from public.tx_reservations r where r.id=m.reservation_id and (r.body->>'start')::timestamptz<=now());
 return query with candidate as (
 select id from public.tx_reservation_mail where due_at<=now() and (state='pending' or (state='sending' and lease_until<now())) order by due_at limit 1 for update skip locked
 ) update public.tx_reservation_mail m set state='sending',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1 from candidate c where m.id=c.id returning m.*;
end $$;
revoke all on function public.tx_load_reservations(),public.tx_commit_reservations(bigint,jsonb,jsonb),public.tx_claim_reservation_mail() from public,anon,authenticated;
grant execute on function public.tx_load_reservations(),public.tx_commit_reservations(bigint,jsonb,jsonb),public.tx_claim_reservation_mail() to service_role;
commit;
