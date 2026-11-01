-- Keep company data and delivery history while disabling access for its members.
alter table public.companies
  add column if not exists active boolean not null default true;

create or replace function public.current_company_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.company_id
  from public.company_members as m
  join public.companies as c on c.id = m.company_id and c.active
  where m.user_id = (select auth.uid()) and m.active
  limit 1
$$;

create or replace function public.current_company_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select m.role
  from public.company_members as m
  join public.companies as c on c.id = m.company_id and c.active
  where m.user_id = (select auth.uid()) and m.active
  limit 1
$$;

revoke all on function public.current_company_id() from public, anon;
revoke all on function public.current_company_role() from public, anon;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_company_role() to authenticated;
