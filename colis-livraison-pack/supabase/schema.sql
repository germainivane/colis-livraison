-- First installation for the multi-company delivery website.
-- Run this in the Supabase SQL Editor for a new project.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.companies
  add column if not exists active boolean not null default true;

-- Platform owners are maintenance accounts managed only from the SQL Editor
-- during bootstrap and from the privileged Edge Function afterward.
create table if not exists public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('admin', 'courier')),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index if not exists company_members_company_idx on public.company_members(company_id);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  courier_id uuid references public.company_members(user_id) on delete set null,
  reference text not null,
  recipient_name text not null,
  recipient_phone text not null,
  pickup_address text not null,
  dropoff_address text not null,
  parcel_type text not null default 'Colis standard',
  status text not null default 'À attribuer'
    check (status in ('À attribuer', 'À récupérer', 'En cours', 'Livrée', 'Annulée')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (company_id, reference)
);

create index if not exists deliveries_company_created_idx on public.deliveries(company_id, created_at desc);
create index if not exists deliveries_courier_status_idx on public.deliveries(courier_id, status);

-- SECURITY DEFINER helpers avoid recursive membership policies.
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

-- These account-provisioning RPCs are callable only by the server-side
-- Edge Function using its secret key. They are never exposed to website users.
create or replace function public.provision_company_admin(
  p_user_id uuid,
  p_company_name text,
  p_full_name text,
  p_phone text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if p_user_id is null
     or char_length(trim(coalesce(p_company_name, ''))) not between 2 and 120
     or char_length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then
    raise exception 'Company name and administrator name are required';
  end if;

  insert into public.companies(name)
  values (trim(p_company_name))
  returning id into v_company_id;

  insert into public.company_members(user_id, company_id, role, full_name, phone)
  values (p_user_id, v_company_id, 'admin', trim(p_full_name), nullif(trim(coalesce(p_phone, '')), ''));

  return v_company_id;
end;
$$;

create or replace function public.provision_courier(
  p_user_id uuid,
  p_company_id uuid,
  p_full_name text,
  p_phone text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_company_id is null
     or char_length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then
    raise exception 'Courier name and company are required';
  end if;

  insert into public.company_members(user_id, company_id, role, full_name, phone)
  values (p_user_id, p_company_id, 'courier', trim(p_full_name), nullif(trim(coalesce(p_phone, '')), ''));

  return p_user_id;
end;
$$;

revoke all on function public.provision_company_admin(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.provision_courier(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.provision_company_admin(uuid, text, text, text) to service_role;
grant execute on function public.provision_courier(uuid, uuid, text, text) to service_role;

alter table public.companies enable row level security;
alter table public.platform_owners enable row level security;
alter table public.company_members enable row level security;
alter table public.deliveries enable row level security;

revoke all on public.companies from anon, authenticated;
revoke all on public.platform_owners from anon, authenticated;
revoke all on public.company_members from anon, authenticated;
revoke all on public.deliveries from anon, authenticated;

-- A signed-in owner may check only their own maintenance role in the browser.
-- No role can insert or update owner records through the Data API.
grant select on public.platform_owners to authenticated;
drop policy if exists "Owners can view their own maintenance role" on public.platform_owners;
create policy "Owners can view their own maintenance role"
on public.platform_owners for select to authenticated
using (user_id = (select auth.uid()));

grant select on public.companies to authenticated;
grant select on public.company_members to authenticated;
grant select, insert, update on public.deliveries to authenticated;

drop policy if exists "Members can view their company" on public.companies;
create policy "Members can view their company"
on public.companies for select to authenticated
using (id = (select public.current_company_id()));

drop policy if exists "Members can view their company roster" on public.company_members;
create policy "Members can view their company roster"
on public.company_members for select to authenticated
using (
  company_id = (select public.current_company_id())
  and ((select public.current_company_role()) = 'admin' or user_id = (select auth.uid()))
);

drop policy if exists "Company members can view their deliveries" on public.deliveries;
create policy "Company members can view their deliveries"
on public.deliveries for select to authenticated
using (
  company_id = (select public.current_company_id())
  and (
    (select public.current_company_role()) = 'admin'
    or ((select public.current_company_role()) = 'courier'
      and (courier_id = (select auth.uid()) or (courier_id is null and status = 'À attribuer')))
  )
);

drop policy if exists "Admins can create deliveries for their company" on public.deliveries;
create policy "Admins can create deliveries for their company"
on public.deliveries for insert to authenticated
with check (
  company_id = (select public.current_company_id())
  and created_by = (select auth.uid())
  and (select public.current_company_role()) = 'admin'
  and (courier_id is null or exists (
    select 1 from public.company_members as m
    where m.user_id = courier_id
      and m.company_id = (select public.current_company_id())
      and m.role = 'courier'
      and m.active
  ))
);

drop policy if exists "Admins can update deliveries for their company" on public.deliveries;
create policy "Admins can update deliveries for their company"
on public.deliveries for update to authenticated
using (
  company_id = (select public.current_company_id())
  and (select public.current_company_role()) = 'admin'
)
with check (
  company_id = (select public.current_company_id())
  and (select public.current_company_role()) = 'admin'
  and (courier_id is null or exists (
    select 1 from public.company_members as m
    where m.user_id = courier_id
      and m.company_id = (select public.current_company_id())
      and m.role = 'courier'
      and m.active
  ))
);

create or replace function public.courier_set_delivery_status(p_delivery_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select public.current_company_role()) <> 'courier' then
    raise exception 'Courier account required';
  end if;
  if p_status not in ('En cours', 'Livrée') then raise exception 'Invalid delivery status'; end if;
  update public.deliveries
  set status = p_status,
      delivered_at = case when p_status = 'Livrée' then now() else null end
  where id = p_delivery_id
    and company_id = (select public.current_company_id())
    and courier_id = (select auth.uid())
    and ((p_status = 'En cours' and status = 'À récupérer') or (p_status = 'Livrée' and status = 'En cours'));
  if not found then raise exception 'Delivery not found or transition is not allowed'; end if;
end;
$$;

create or replace function public.admin_assign_delivery(p_delivery_id uuid, p_courier_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select public.current_company_role()) <> 'admin' then
    raise exception 'Administrator account required';
  end if;
  if p_courier_id is not null and not exists (
    select 1 from public.company_members as m
    where m.user_id = p_courier_id
      and m.company_id = (select public.current_company_id())
      and m.role = 'courier' and m.active
  ) then raise exception 'Courier does not belong to this company'; end if;
  update public.deliveries
  set courier_id = p_courier_id,
      status = case when p_courier_id is null then 'À attribuer' else 'À récupérer' end
  where id = p_delivery_id and company_id = (select public.current_company_id());
  if not found then raise exception 'Delivery not found'; end if;
end;
$$;

create or replace function public.courier_accept_delivery(p_delivery_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select public.current_company_role()) <> 'courier' then
    raise exception 'Courier account required';
  end if;
  update public.deliveries
  set courier_id = (select auth.uid()), status = 'À récupérer'
  where id = p_delivery_id
    and company_id = (select public.current_company_id())
    and courier_id is null and status = 'À attribuer';
  if not found then raise exception 'Delivery is no longer available'; end if;
end;
$$;

revoke all on function public.courier_set_delivery_status(uuid, text) from public, anon;
revoke all on function public.admin_assign_delivery(uuid, uuid) from public, anon;
revoke all on function public.courier_accept_delivery(uuid) from public, anon;
grant execute on function public.courier_set_delivery_status(uuid, text) to authenticated;
grant execute on function public.admin_assign_delivery(uuid, uuid) to authenticated;
grant execute on function public.courier_accept_delivery(uuid) to authenticated;
