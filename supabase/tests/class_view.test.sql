-- Access rules of the class view (#144). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Three users: an instructor, two students. All synthetic.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"user_name":"teacher"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"user_name":"student-b"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"user_name":"student-c"}');

create function pg_temp.act_as(u uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_anon() returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;

-- The instructor creates a class.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.classes (name) values ('CS 101');
select is((select count(*)::int from public.classes), 1, 'instructor sees the class they created');
select is(
  (select owner from public.classes),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'the creator owns the class'
);
create temp table code on commit drop as select invite_code from public.classes;
grant select on code to authenticated, anon;

-- Student B cannot see the class before joining, then joins with the code.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.classes), 0, 'a non-member cannot see the class');
select throws_ok('select public.join_class(''nope'')', 'P0002', 'no class has that invite code',
  'a wrong invite code is refused');
select lives_ok('select public.join_class((select invite_code from code))', 'student joins with the code');
select lives_ok('select public.join_class((select invite_code from code))', 'joining twice is harmless');
select is((select count(*)::int from public.classes), 1, 'a member can see the class');
select is((select github_login from public.members), 'student-b', 'membership records the GitHub login');
select throws_ok(
  $$insert into public.members (class_id, user_id) select id, '00000000-0000-0000-0000-00000000000c' from public.classes$$,
  '42501', null, 'members cannot be added directly'
);

-- Student B makes a sync key; sync keys are never readable.
create temp table k on commit drop as select public.create_sync_key() as key;
grant select on k to authenticated, anon;
select matches((select key from k), '^qk_[0-9a-f]{48}$', 'a sync key is returned once');
select throws_ok('select * from public.sync_keys', '42501', null, 'sync keys are not readable');

-- Local Quoli uploads with the anon role and the sync key only.
select pg_temp.act_anon();
select is(
  public.submit_summaries((select key from k), jsonb_build_array(
    jsonb_build_object('sessionId', 's1', 'agent', 'claude-code', 'model', 'claude-sonnet-4-5',
      'repo', 'student-b/hw1', 'startedAt', now() + interval '1 minute', 'calls', 12,
      'failures', 1, 'loops', 0, 'usd', 0.42, 'inputTokens', 1000, 'prompt', 'ignored'),
    jsonb_build_object('sessionId', 'old', 'agent', 'codex',
      'startedAt', now() - interval '30 days')
  )),
  2,
  'summaries are accepted with a valid sync key'
);
select is(
  public.submit_summaries((select key from k), jsonb_build_array(
    jsonb_build_object('sessionId', 's1', 'agent', 'claude-code',
      'startedAt', now() + interval '1 minute', 'calls', 20)
  )),
  1,
  'a summary is updated in place'
);
select throws_ok(
  $$select public.submit_summaries('qk_wrong', '[]'::jsonb)$$,
  '28000', 'unknown sync key', 'an unknown key is refused'
);
select throws_ok(
  $$select public.submit_summaries((select key from k), '[{"sessionId":"x","agent":"cursor","startedAt":"2026-11-12T00:00:00Z"}]'::jsonb)$$,
  '23514', null, 'an unknown agent is refused'
);
select throws_ok('select * from public.session_summaries', '42501', null, 'anon reads no summaries');
select throws_ok('select public.create_sync_key()', '42501', null, 'anon cannot create keys');

-- The student sees their own summaries, both of them.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.session_summaries), 2, 'a student reads their own summaries');
select is((select calls from public.session_summaries where session_id = 's1'), 20, 'the update landed');

-- The instructor sees only sessions that started after the student joined.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select is(
  (select array_agg(session_id) from public.session_summaries),
  array['s1'],
  'instructor sees class sessions since joining, not older ones'
);
select throws_ok(
  $$update public.session_summaries set calls = 0$$,
  '42501', null, 'nobody updates summaries directly'
);

-- Student C, in no class, sees nothing of B.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.session_summaries), 0, 'other users see no summaries');
select is((select count(*)::int from public.members), 0, 'other users see no memberships');

-- Leaving the class hides the student's sessions from the instructor.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
delete from public.members;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.session_summaries), 0, 'after leaving, the instructor sees nothing');

select * from finish();
rollback;
