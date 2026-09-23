-- Server-only storage for the pilot. Browser roles cannot read or mutate it.
create table public.tx_workspace (
  id boolean primary key default true check(id),
  version bigint not null default 0,
  initialized boolean not null default false,
  owner_email text,
  categories jsonb not null default '[]'
);
create table public.tx_records (
  kind text not null check(kind in ('users','members','incidents','shifts','messages','documents','polls','notifications','audit','coverageRequests')),
  id text not null,
  position integer not null,
  body jsonb not null check(jsonb_typeof(body)='object' and body->>'id'=id),
  primary key(kind,id)
);
create table public.tx_files (
  id uuid primary key,
  owner uuid not null references auth.users(id),
  name text not null,
  type text not null,
  size bigint not null check(size between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index tx_files_owner_idx on public.tx_files(owner);
alter table public.tx_workspace enable row level security;
alter table public.tx_records enable row level security;
alter table public.tx_files enable row level security;
revoke all on public.tx_workspace, public.tx_records, public.tx_files from anon, authenticated;
grant all on public.tx_workspace, public.tx_records, public.tx_files to service_role;
insert into public.tx_workspace(id) values(true);

create function public.tx_load() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('version', w.version, 'initialized',w.initialized,'owner_email',w.owner_email,'state',
    jsonb_build_object('categories',w.categories) ||
    (select jsonb_object_agg(k,coalesce((select jsonb_agg(r.body order by r.position) from public.tx_records r where r.kind=k),'[]'::jsonb))
      from unnest(array['users','members','incidents','shifts','messages','documents','polls','notifications','audit','coverageRequests']) as k))
  from public.tx_workspace w where w.id=true;
$$;
create function public.tx_commit(expected_version bigint, next_state jsonb) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare current_version bigint; collection text; next_version bigint;
begin
  select version into current_version from public.tx_workspace where id=true for update;
  if current_version <> expected_version then raise exception 'TX_CONFLICT'; end if;
  foreach collection in array array['users','members','incidents','shifts','messages','documents','polls','notifications','audit','coverageRequests'] loop
    if jsonb_typeof(next_state->collection) is distinct from 'array' then raise exception 'TX_INVALID_STATE'; end if;
    delete from public.tx_records r where kind=collection and not exists(select 1 from jsonb_array_elements(next_state->collection) e where e->>'id'=r.id);
    insert into public.tx_records(kind,id,position,body)
      select collection,e.value->>'id',e.ordinality::integer,e.value from jsonb_array_elements(next_state->collection) with ordinality e
    on conflict(kind,id) do update set position=excluded.position,body=excluded.body
      where tx_records.position is distinct from excluded.position or tx_records.body is distinct from excluded.body;
  end loop;
  update public.tx_workspace set version=version+1,initialized=true,categories=next_state->'categories' where id=true returning version into next_version;
  return next_version;
end $$;
revoke all on function public.tx_load(), public.tx_commit(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.tx_load(), public.tx_commit(bigint,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('taximes-private','taximes-private',false,10485760);
