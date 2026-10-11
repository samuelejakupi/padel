-- Installazione dell'area admin. I ruoli sono legati agli UUID, non ai nomi modificabili.
create schema if not exists private;
create table if not exists public.admin_members (
  profile_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.admin_members enable row level security;
revoke all on public.admin_members from public, anon, authenticated;
grant select on public.admin_members to authenticated;
grant all on public.admin_members to service_role;
create policy "Leggi solo il tuo ruolo admin" on public.admin_members
  for select to authenticated using (profile_id = (select auth.uid()));
insert into public.admin_members(profile_id)
select p.id from public.profiles p join auth.users u on u.id = p.id
where lower(u.email) in ('samu@theboyz.local', 'dani@theboyz.local')
on conflict do nothing;

create table if not exists public.member_logins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{1,31}$')
);
alter table public.member_logins enable row level security;
revoke all on public.member_logins from public, anon, authenticated;
grant all on public.member_logins to service_role;
create policy "Directory gestita solo dal backend" on public.member_logins
  for all to service_role using (true) with check (true);
insert into public.member_logins(profile_id, username)
select p.id, split_part(lower(u.email), '@', 1)
from public.profiles p join auth.users u on u.id = p.id
where u.email like '%@theboyz.local'
on conflict do nothing;

-- Directory limitata al nome pubblico e al nome di accesso; nessuna email o UUID.
-- Il login mostrava già i nomi del gruppo prima dell'autenticazione.
create or replace function private.login_directory()
returns table(username text, display_name text)
language sql stable security definer set search_path = ''
as $$ select l.username, p.display_name from public.member_logins l
join public.profiles p on p.id = l.profile_id order by lower(p.display_name), l.username $$;
revoke all on function private.login_directory() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.login_directory() to anon, authenticated;
create or replace function public.list_login_users()
returns table(username text, display_name text)
language sql stable security invoker set search_path = ''
as $$ select * from private.login_directory() $$;
revoke all on function public.list_login_users() from public;
grant execute on function public.list_login_users() to anon, authenticated;

-- Solo Auth Admin può impostare app_metadata. user_metadata non autorizza iscrizioni.
create or replace function private.provision_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare member_name text; login_name text;
begin
  if coalesce(new.raw_app_meta_data->>'theboyz_provisioned', '') <> 'true' then
    raise exception 'Registrazione pubblica disabilitata';
  end if;
  member_name := trim(new.raw_user_meta_data->>'display_name');
  login_name := split_part(lower(new.email), '@', 1);
  if member_name is null or length(member_name) not between 2 and 40
    or new.email <> login_name || '@theboyz.local' then
    raise exception 'Dati utente non validi';
  end if;
  insert into public.profiles(id, display_name) values(new.id, member_name);
  insert into public.member_logins(profile_id, username) values(new.id, login_name);
  return new;
end $$;
revoke all on function private.provision_member() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.provision_member();
