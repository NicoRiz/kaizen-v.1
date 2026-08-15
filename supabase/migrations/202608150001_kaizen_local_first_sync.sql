create table if not exists public.kaizen_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  primary key (user_id, collection, id)
);

create table if not exists public.kaizen_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  migration_version integer not null default 1,
  migration_completed_at timestamptz,
  last_successful_sync_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kaizen_records_user_collection_updated_idx
  on public.kaizen_records (user_id, collection, updated_at desc);

create index if not exists kaizen_records_user_deleted_idx
  on public.kaizen_records (user_id, deleted_at)
  where deleted_at is not null;

create or replace function public.kaizen_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kaizen_records_set_updated_at on public.kaizen_records;
create trigger kaizen_records_set_updated_at
  before update on public.kaizen_records
  for each row
  execute function public.kaizen_set_updated_at();

drop trigger if exists kaizen_sync_state_set_updated_at on public.kaizen_sync_state;
create trigger kaizen_sync_state_set_updated_at
  before update on public.kaizen_sync_state
  for each row
  execute function public.kaizen_set_updated_at();

alter table public.kaizen_records enable row level security;
alter table public.kaizen_sync_state enable row level security;

drop policy if exists "Users can read own kaizen records" on public.kaizen_records;
create policy "Users can read own kaizen records"
  on public.kaizen_records
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own kaizen records" on public.kaizen_records;
create policy "Users can insert own kaizen records"
  on public.kaizen_records
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own kaizen records" on public.kaizen_records;
create policy "Users can update own kaizen records"
  on public.kaizen_records
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own kaizen records" on public.kaizen_records;
create policy "Users can delete own kaizen records"
  on public.kaizen_records
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own kaizen sync state" on public.kaizen_sync_state;
create policy "Users can read own kaizen sync state"
  on public.kaizen_sync_state
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own kaizen sync state" on public.kaizen_sync_state;
create policy "Users can insert own kaizen sync state"
  on public.kaizen_sync_state
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own kaizen sync state" on public.kaizen_sync_state;
create policy "Users can update own kaizen sync state"
  on public.kaizen_sync_state
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own kaizen sync state" on public.kaizen_sync_state;
create policy "Users can delete own kaizen sync state"
  on public.kaizen_sync_state
  for delete
  to authenticated
  using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'kaizen_records'
  ) then
    alter publication supabase_realtime add table public.kaizen_records;
  end if;
end;
$$;
