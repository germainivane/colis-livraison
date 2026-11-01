-- Multi-company delivery dashboard.
-- Run this once in the Supabase SQL editor before connecting the website.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('admin', 'courier')),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text,
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

-- Security-definer helpers avoid recursive membership policies.
create or replace function public.current_company_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.company_id from public.company_members m where m.user_id = (select auth.uid()) limit 1
$$;

create or replace function public.current_company_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select m.role from public.company_members m where m.user_id = (select auth.uid()) limit 1
$$;

revoke all on function public.current_company_id() from public;
revoke all on function public.current_company_role() from public;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_company_role() to authenticated;

-- Signup creates both the company and its first administrator atomically.
create or replace function public.create_company(p_company_name text, p_admin_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.company_members where user_id = v_user_id) then
    raise exception 'This account already belongs to a company';
  end if;
  insert into public.companies(name) values (trim(p_company_name)) returning id into v_company_id;
  insert into public.company_members(user_id, company_id, role, full_name)
  values (v_user_id, v_company_id, 'admin', trim(p_admin_name));
  return v_company_id;
end;
$$;

revoke all on function public.create_company(text, text) from public;
grant execute on function public.create_company(text, text) to authenticated;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.deliveries enable row level security;

revoke all on public.companies from anon, authenticated;
revoke all on public.company_members from anon, authenticated;
revoke all on public.deliveries from anon, authenticated;

grant select on public.companies to authenticated;
grant select on public.company_members to authenticated;
grant select, insert on public.deliveries to authenticated;

create policy "Members can view their company"
on public.companies for select to authenticated
using (id = (select public.current_company_id()));

create policy "Members can view their company roster"
on public.company_members for select to authenticated
using (
  company_id = (select public.current_company_id())
  and ((select public.current_company_role()) = 'admin' or user_id = (select auth.uid()))
);

create policy "Company members can view their deliveries"
on public.deliveries for select to authenticated
using (
  company_id = (select public.current_company_id())
  and (
    (select public.current_company_role()) = 'admin'
    or (select public.current_company_role()) = 'courier'
       and (courier_id = (select auth.uid()) or (courier_id is null and status = 'À attribuer'))
  )
);

create policy "Admins can create deliveries for their company"
on public.deliveries for insert to authenticated
with check (
  company_id = (select public.current_company_id())
  and created_by = (select auth.uid())
  and (select public.current_company_role()) = 'admin'
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

revoke all on function public.courier_set_delivery_status(uuid, text) from public;
grant execute on function public.courier_set_delivery_status(uuid, text) to authenticated;

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
    select 1 from public.company_members m
    where m.user_id = p_courier_id
      and m.company_id = (select public.current_company_id())
      and m.role = 'courier'
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

revoke all on function public.admin_assign_delivery(uuid, uuid) from public;
revoke all on function public.courier_accept_delivery(uuid) from public;
grant execute on function public.admin_assign_delivery(uuid, uuid) to authenticated;
grant execute on function public.courier_accept_delivery(uuid) to authenticated;

