-- Kaizen keeps domain records in the existing local-first JSONB store.
-- New collections (areas, habits, habitLogs) therefore require no destructive
-- table rewrite. These partial expression indexes keep bounded dashboard and
-- history queries efficient while preserving every existing GTD record.

create index if not exists kaizen_records_area_lookup_idx
  on public.kaizen_records (user_id, collection, ((data ->> 'areaId')))
  where deleted_at is null
    and collection in ('projects', 'projectActions', 'nextActions', 'habits');

create index if not exists kaizen_records_habit_status_idx
  on public.kaizen_records (user_id, ((data ->> 'status')), ((data ->> 'startDate')))
  where deleted_at is null
    and collection = 'habits';

create index if not exists kaizen_records_habit_log_range_idx
  on public.kaizen_records (
    user_id,
    ((data ->> 'habitId')),
    ((data ->> 'date')) desc
  )
  where deleted_at is null
    and collection = 'habitLogs';

comment on index public.kaizen_records_area_lookup_idx is
  'Supports Area dashboards without duplicating Projects, Habits or Next Actions.';

comment on index public.kaizen_records_habit_log_range_idx is
  'Supports bounded Habit history and Rhythm calculations.';
