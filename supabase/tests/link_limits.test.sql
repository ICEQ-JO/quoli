-- Account linking limits (#16). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, raw_user_meta_data, email) values
  ('00000000-0000-0000-0000-0000000000a1', '{}', 'owner@example.com');

create function pg_temp.act_anon(ip text) returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', '{"role":"anon"}', true),
         set_config('request.headers', json_build_object('x-forwarded-for', ip || ', 10.0.0.1')::text, true);
$$;
create function pg_temp.h(t text) returns text language sql as $$
  select encode(extensions.digest(t, 'sha256'), 'hex');
$$;

select pg_temp.act_anon('203.0.113.7');
select lives_ok(
  $$select public.link_start(pg_temp.h('s' || g)) from generate_series(1, 10) g$$,
  'ten requests from one client are fine');
select throws_ok($$select public.link_start(pg_temp.h('s11'))$$, '54000', null,
  'the eleventh from the same client is refused');
select pg_temp.act_anon('198.51.100.9');
create temp table l on commit drop as select public.link_start(pg_temp.h('other')) as pair;
grant select on l to anon, authenticated;
select ok((select pair from l) is not null, 'another client is not blocked');
select throws_ok('select * from public.link_starts', '42501', null, 'the counter is not readable');
select throws_ok($$select public.link_age((select pair from l))$$, '42501', null,
  'anonymous callers cannot look at codes');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
         json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
select ok(public.link_age(lower((select pair from l))) between 0 and 5, 'a fresh code is seconds old');
select is(public.link_age('ZZZZ-ZZZZ'), null, 'an unknown code has no age');

select * from finish();
rollback;
