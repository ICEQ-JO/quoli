-- Connecting a computer (#154). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, raw_user_meta_data, email) values
  ('00000000-0000-0000-0000-0000000000a1', '{"user_name":"owner"}', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', '{"full_name":"Google Person"}', 'g@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', '{}', 'student@example.com');

create function pg_temp.act_as(u uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_anon() returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.h(t text) returns text language sql as $$
  select encode(extensions.digest(t, 'sha256'), 'hex');
$$;

-- The computer starts a link with the hash of its secret.
select pg_temp.act_anon();
create temp table l on commit drop as
  select public.link_start(pg_temp.h('secret-1')) as pair;
grant select on l to anon, authenticated;
select matches((select pair from l), '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', 'a short code comes back');
select throws_ok($$select public.link_start('nope')$$, '22023', null, 'only a hash is accepted');
select throws_ok($$select public.link_start(pg_temp.h('secret-1'))$$, '23505', null,
  'the same request cannot start twice');
select throws_ok('select * from public.link_requests', '42501', null, 'requests are not readable');
select is(public.link_collect('secret-1'), null, 'nothing to collect before approval');
select throws_ok($$select public.link_collect('wrong')$$, 'P0002', null, 'a wrong secret collects nothing');
select throws_ok($$select public.link_approve((select pair from l))$$, '42501', null,
  'anonymous callers cannot approve');

-- The signed-in user approves the code shown in their terminal.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((public.my_account() ->> 'computers')::int, 0, 'no computers yet');
select ok(public.link_approve(lower((select pair from l))), 'the owner approves the code');
select throws_ok($$select public.link_approve((select pair from l))$$, 'P0002', null,
  'a code is approved once');

-- The computer collects its key once; it works for uploads.
select pg_temp.act_anon();
create temp table k on commit drop as select public.link_collect('secret-1') as key;
grant select on k to anon, authenticated;
select matches((select key from k), '^qk_[0-9a-f]{48}$', 'the computer gets a sync key');
select throws_ok($$select public.link_collect('secret-1')$$, 'P0002', null, 'only once');
select is(
  public.submit_summaries((select key from k), jsonb_build_array(jsonb_build_object(
    'sessionId', 's1', 'agent', 'codex', 'startedAt', now()))),
  1, 'the key uploads summaries');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((public.my_account() ->> 'computers')::int, 1, 'one computer connected');
select is((public.my_account() ->> 'sessions')::int, 1, 'one session shared');

-- Expired requests cannot be approved.
select pg_temp.act_anon();
create temp table l2 on commit drop as select public.link_start(pg_temp.h('secret-2')) as pair;
grant select on l2 to anon, authenticated;
reset role;
update public.link_requests set created_at = now() - interval '11 minutes';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.link_approve((select pair from l2))$$, 'P0002', null,
  'an expired code is refused');

-- A member who signed in with Google is shown by name.
insert into public.classes (name) values ('Team');
create temp table code on commit drop as select invite_code from public.classes;
grant select on code to authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((public.join_class((select invite_code from code))).name, 'Team', 'joins');
select is((select github_login from public.members), 'Google Person', 'shown by name');
-- A member who signed in with only an email is shown by email.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is((public.join_class((select invite_code from code))).name, 'Team', 'joins with email only');
select is((select github_login from public.members where user_id = auth.uid()), 'student@example.com',
  'shown by email');
select * from finish();
rollback;
