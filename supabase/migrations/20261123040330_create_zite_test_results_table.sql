create table if not exists public.zite_test_results (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

alter table public.zite_test_results enable row level security;
revoke all on public.zite_test_results from anon, authenticated;
grant insert, select on public.zite_test_results to service_role;
