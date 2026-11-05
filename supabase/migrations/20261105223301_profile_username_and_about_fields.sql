alter table public.profiles
  add column if not exists username text,
  add column if not exists about text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_username_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_username_format_check
      check (
        username is null
        or (
          username = lower(btrim(username))
          and char_length(username) between 3 and 24
          and username ~ '^[a-z0-9](?:[a-z0-9_]{1,22}[a-z0-9])$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_about_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_about_length_check
      check (about is null or char_length(btrim(about)) <= 160);
  end if;
end $$;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.get_farnaz_user_profile_v2(search_user_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, phone text, username text, about text)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.display_name, p.avatar_url,
         case when p.show_phone is true and exists (
           select 1 from public.contacts c
           where c.user_id = auth.uid()
             and c.contact_user_id = search_user_id
         ) then p.phone else null::text end as phone,
         p.username, p.about
  from public.profiles p
  where auth.uid() is not null
    and p.id = search_user_id
    and (
      exists (
        select 1 from public.messages m
        where (m.sender_id = auth.uid() and m.receiver_id = search_user_id)
           or (m.receiver_id = auth.uid() and m.sender_id = search_user_id)
      )
      or exists (
        select 1 from public.contacts c
        where c.user_id = auth.uid() and c.contact_user_id = search_user_id
      )
      or exists (
        select 1 from public.space_members sm
        where sm.user_id = search_user_id
          and private.is_space_member(sm.space_id)
      )
    )
  limit 1;
$function$;

create or replace function public.get_farnaz_user_profiles_v2(search_user_ids uuid[])
returns table(user_id uuid, display_name text, avatar_url text, phone text, username text, about text)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.display_name, p.avatar_url,
         case when p.show_phone is true and exists (
           select 1
           from public.contacts c
           where c.user_id = auth.uid()
             and c.contact_user_id = p.id
         ) then p.phone else null::text end as phone,
         p.username, p.about
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.id = any(coalesce(search_user_ids, array[]::uuid[]))
    and (
      exists (
        select 1
        from public.messages m
        where (m.sender_id = auth.uid() and m.receiver_id = p.id)
           or (m.receiver_id = auth.uid() and m.sender_id = p.id)
      )
      or exists (
        select 1
        from public.contacts c
        where c.user_id = auth.uid()
          and c.contact_user_id = p.id
      )
      or exists (
        select 1
        from public.space_members sm
        where sm.user_id = p.id
          and private.is_space_member(sm.space_id)
      )
    );
$function$;

revoke all on function public.get_farnaz_user_profile_v2(uuid) from public, anon;
revoke all on function public.get_farnaz_user_profiles_v2(uuid[]) from public, anon;
grant execute on function public.get_farnaz_user_profile_v2(uuid) to authenticated;
grant execute on function public.get_farnaz_user_profiles_v2(uuid[]) to authenticated;
