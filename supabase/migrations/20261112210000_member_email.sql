-- Sign in with email (#156): members without a GitHub login or a name are shown to the owners of
-- the teams they join by their email address, so an instructor can tell students apart. The
-- email is visible only to owners of teams the member chose to join.
create or replace function public.join_class(p_code text)
returns public.classes language plpgsql security definer set search_path = '' as $$
declare
  c public.classes;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  select * into c from public.classes where invite_code = lower(trim(p_code));
  if c.id is null then
    raise exception 'no class has that invite code' using errcode = 'P0002';
  end if;
  insert into public.members (class_id, user_id, github_login)
  values (
    c.id,
    auth.uid(),
    (select coalesce(
       u.raw_user_meta_data ->> 'user_name',
       u.raw_user_meta_data ->> 'full_name',
       u.raw_user_meta_data ->> 'name',
       u.email)
     from auth.users u where u.id = auth.uid())
  )
  on conflict (class_id, user_id) do nothing;
  return c;
end;
$$;
