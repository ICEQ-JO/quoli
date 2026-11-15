-- Who is working now (#25). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, raw_user_meta_data, email) values
  ('00000000-0000-0000-0000-0000000000b1', '{"user_name":"owner"}', 'o@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', '{"user_name":"ana"}', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b3', '{"user_name":"bo"}', 'b@example.com'),
  ('00000000-0000-0000-0000-0000000000b4', '{"user_name":"eve"}', 'e@example.com');

insert into public.classes (id, name, owner) values
  ('00000000-0000-0000-0000-00000000c001', 'Team', '00000000-0000-0000-0000-0000000000b1');
insert into public.members (class_id, user_id, github_login, joined_at) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b2', 'ana', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b3', 'bo', now() - interval '1 day');

insert into public.session_summaries (user_id, session_id, agent, repo, branch, started_at, ended_at, updated_at) values
  -- live
  ('00000000-0000-0000-0000-0000000000b2', 'live', 'claude-code', 'acme/shop', 'main', now() - interval '10 minutes', null, now() - interval '30 seconds'),
  -- ended
  ('00000000-0000-0000-0000-0000000000b2', 'ended', 'codex', 'acme/shop', 'main', now() - interval '1 hour', now() - interval '5 minutes', now() - interval '1 minute'),
  -- quiet for 20 minutes
  ('00000000-0000-0000-0000-0000000000b3', 'stale', 'codex', 'acme/shop', 'x', now() - interval '1 hour', null, now() - interval '20 minutes'),
  -- started before joining
  ('00000000-0000-0000-0000-0000000000b3', 'early', 'codex', 'acme/shop', 'x', now() - interval '2 days', null, now()),
  -- not a member
  ('00000000-0000-0000-0000-0000000000b4', 'outsider', 'pi', 'acme/shop', 'main', now() - interval '5 minutes', null, now());

create function pg_temp.act(u text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.team_live('00000000-0000-0000-0000-00000000c001')), 1,
  'the owner sees only the live session of a member, since joining');
select is((select member from public.team_live('00000000-0000-0000-0000-00000000c001')), 'ana',
  'with the member''s name');

select pg_temp.act('00000000-0000-0000-0000-0000000000b3');
select throws_ok($$select * from public.team_live('00000000-0000-0000-0000-00000000c001')$$,
  '42501', null, 'a member sees nothing while the setting is off');
update public.classes set members_see_live = true where id = '00000000-0000-0000-0000-00000000c001';
select is((select members_see_live from public.classes where id = '00000000-0000-0000-0000-00000000c001'),
  false, 'a member cannot turn it on');

select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
update public.classes set members_see_live = true where id = '00000000-0000-0000-0000-00000000c001';
select ok((select members_see_live from public.classes where id = '00000000-0000-0000-0000-00000000c001'),
  'the owner turns it on');

select pg_temp.act('00000000-0000-0000-0000-0000000000b3');
select is((select count(*)::int from public.team_live('00000000-0000-0000-0000-00000000c001')), 1,
  'then members see who is working now');
select is((select count(*)::int from public.session_summaries where user_id = '00000000-0000-0000-0000-0000000000b2'), 0,
  'but still cannot read another member''s summaries');

select pg_temp.act('00000000-0000-0000-0000-0000000000b4');
select throws_ok($$select * from public.team_live('00000000-0000-0000-0000-00000000c001')$$,
  '42501', null, 'a non-member sees nothing');

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.team_live('00000000-0000-0000-0000-00000000c001')$$,
  '42501', null, 'anonymous callers cannot call it');

select * from finish();
rollback;
