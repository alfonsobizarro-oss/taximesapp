-- Additive migration. Apply only AFTER reviewing against the actual pilot schema.
-- No existing shift is replaced and no browser role receives access or a new policy.
begin;
create table public.tx_adviser_status (
  user_id text primary key,
  user_kind text generated always as ('users'::text) stored,
  body jsonb not null check (jsonb_typeof(body) = 'object' and body ?& array['userId','status','until','updatedAt','updatedLocal','shiftIds'] and body->>'userId' = user_id and body->>'status' in ('available','busy','away')),
  foreign key (user_kind,user_id) references public.tx_records(kind,id)
);
create table public.tx_substitutions (
  id text primary key,
  shift_kind text generated always as ('shifts'::text) stored,
  shift_id text generated always as (body->>'shiftId') stored not null,
  body jsonb not null check (jsonb_typeof(body) = 'object' and body ?& array['id','shiftId','status','originalShift','adviserId','requestedBy','requestedAt','from','end'] and body->>'id' = id and body->>'status' in ('pending','accepted','cancelled') and jsonb_typeof(body->'originalShift') = 'object'),
  foreign key (shift_kind,shift_id) references public.tx_records(kind,id)
);
create unique index tx_substitutions_pending_shift on public.tx_substitutions(shift_id) where body->>'status' = 'pending';
create table public.tx_coordination_events (
  sequence bigint generated always as identity primary key,
  id uuid not null unique,
  event jsonb not null check (jsonb_typeof(event) = 'object' and event->>'id' = id::text and event ?& array['at','type','actorId','recordId','before','after'])
);
alter table public.tx_adviser_status enable row level security;
alter table public.tx_substitutions enable row level security;
alter table public.tx_coordination_events enable row level security;
revoke all on public.tx_adviser_status, public.tx_substitutions, public.tx_coordination_events from public, anon, authenticated, service_role;
grant select, insert, update on public.tx_adviser_status, public.tx_substitutions to service_role;
-- Append-only even for the application's server role; only the database owner can repair it.
grant select, insert on public.tx_coordination_events to service_role;
revoke all on sequence public.tx_coordination_events_sequence_seq from public, anon, authenticated, service_role;
grant usage on sequence public.tx_coordination_events_sequence_seq to service_role;

-- Establish a baseline without inventing earlier history or editing the original shifts.
insert into public.tx_coordination_events(id,event)
select v.id, jsonb_build_object('id',v.id,'at',now(),'actorId','migration','actorName','Sistema · Migración',
  'type','shift_baseline','recordId',r.id,'before',null,'after',r.body)
from public.tx_records r cross join lateral (select gen_random_uuid() as id where r.kind = 'shifts') v
where r.kind = 'shifts';

create function public.tx_load_coordination() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_set(base, '{state}', (base->'state') || jsonb_build_object(
    'adviserStatuses', coalesce((select jsonb_agg(body order by user_id) from public.tx_adviser_status),'[]'::jsonb),
    'substitutions', coalesce((select jsonb_agg(body order by body->>'requestedAt' desc, id) from public.tx_substitutions
      where body->>'status' = 'pending' or body->>'end' >= to_char((now() at time zone 'Europe/Madrid') - interval '7 days','YYYY-MM-DD"T"HH24:MI')),'[]'::jsonb)))
  from public.tx_load() base;
$$;

create function public.tx_commit_coordination(expected_version bigint, next_state jsonb, new_events jsonb) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare next_version bigint; item jsonb; previous jsonb;
begin
  if jsonb_typeof(coalesce(next_state->'adviserStatuses','[]'::jsonb)) is distinct from 'array'
    or jsonb_typeof(coalesce(next_state->'substitutions','[]'::jsonb)) is distinct from 'array'
    or jsonb_typeof(new_events) is distinct from 'array' then raise exception 'TX_INVALID_COORDINATION'; end if;
  -- Reuse the workspace lock/version check. Failure anywhere rolls back ALL four writes:
  -- existing workspace records, statuses, substitutions, and append-only history.
  next_version := public.tx_commit(expected_version, next_state);
  for item in select value from jsonb_array_elements(coalesce(next_state->'adviserStatuses','[]'::jsonb)) loop
    insert into public.tx_adviser_status(user_id,body) values(item->>'userId',item)
    on conflict(user_id) do update set body=excluded.body where tx_adviser_status.body is distinct from excluded.body;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(next_state->'substitutions','[]'::jsonb)) loop
    select body into previous from public.tx_substitutions where id=item->>'id';
    if previous is not null then
      if previous->>'status' <> 'pending' and previous is distinct from item then raise exception 'TX_TERMINAL_SUBSTITUTION'; end if;
      if (previous - array['status','cancelledAt','cancelledBy','cancellationReason','acceptedAt','acceptedBy','effectiveFrom','replacementShiftId'])
        is distinct from (item - array['status','cancelledAt','cancelledBy','cancellationReason','acceptedAt','acceptedBy','effectiveFrom','replacementShiftId'])
        then raise exception 'TX_IMMUTABLE_REQUEST'; end if;
    end if;
    insert into public.tx_substitutions(id,body) values(item->>'id',item)
    on conflict(id) do update set body=excluded.body where tx_substitutions.body is distinct from excluded.body;
  end loop;
  insert into public.tx_coordination_events(id,event)
    select (value->>'id')::uuid,value from jsonb_array_elements(new_events);
  return next_version;
end $$;
revoke all on function public.tx_load_coordination(), public.tx_commit_coordination(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.tx_load_coordination(), public.tx_commit_coordination(bigint,jsonb,jsonb) to service_role;
commit;
