-- Class view (#144): instructors see summaries of their students' agent sessions.
-- Only summaries are stored (agent, model, repo, times, tokens, cost, counts). No prompts, tool
-- input or output, file paths or code ever reach this database.
--
-- Access model:
--   * Anyone signed in (GitHub) can create a class and is its instructor (classes.owner).
--   * A student joins with the class invite code (join_class) and creates a sync key
--     (create_sync_key) to paste into their local Quoli.
--   * Local Quoli uploads with that key through submit_summaries, which runs as the key's owner.
--     Clients never write summaries directly and no service key is needed anywhere.
--   * A student reads and deletes their own summaries; an instructor reads the summaries of
--     their class members for sessions that started after the student joined.

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  invite_code text not null unique
    default encode(extensions.gen_random_bytes(6), 'hex'),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.members (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  github_login text,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create table public.sync_keys (
  key_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table public.session_summaries (
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null check (char_length(session_id) between 1 and 200),
  agent text not null check (agent in ('claude-code', 'codex', 'opencode', 'pi')),
  model text check (char_length(model) <= 200),
  repo text check (char_length(repo) <= 200),
  branch text check (char_length(branch) <= 200),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_ms bigint check (duration_ms >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  usd numeric check (usd >= 0),
  calls integer not null default 0 check (calls >= 0),
  failures integer not null default 0 check (failures >= 0),
  loops integer not null default 0 check (loops >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

create index session_summaries_started on public.session_summaries (user_id, started_at desc);
create index members_user on public.members (user_id);

alter table public.classes enable row level security;
alter table public.members enable row level security;
alter table public.sync_keys enable row level security;
alter table public.session_summaries enable row level security;

-- Helpers run as definer so policies can look across tables without recursion.
create function public.is_class_owner(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classes c where c.id = p_class and c.owner = auth.uid());
$$;

create function public.is_class_member(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m where m.class_id = p_class and m.user_id = auth.uid()
  );
$$;

-- classes: instructors manage their own; members can read the class they joined.
create policy "read own or joined classes" on public.classes for select to authenticated
  using (owner = auth.uid() or public.is_class_member(id));
create policy "create a class" on public.classes for insert to authenticated
  with check (owner = auth.uid());
create policy "rename own class" on public.classes for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy "delete own class" on public.classes for delete to authenticated
  using (owner = auth.uid());

-- members: a student sees their memberships; an instructor sees and removes their members.
-- Joining goes through join_class only.
create policy "read memberships" on public.members for select to authenticated
  using (user_id = auth.uid() or public.is_class_owner(class_id));
create policy "leave or remove" on public.members for delete to authenticated
  using (user_id = auth.uid() or public.is_class_owner(class_id));

-- sync_keys: no direct access at all; see create_sync_key and revoke_sync_keys.

-- session_summaries: read your own, or your class members' since they joined; delete your own.
create policy "read own or class summaries" on public.session_summaries for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.members m
      where m.user_id = session_summaries.user_id
        and public.is_class_owner(m.class_id)
        and session_summaries.started_at >= m.joined_at
    )
  );
create policy "delete own summaries" on public.session_summaries for delete to authenticated
  using (user_id = auth.uid());

-- Joins a class by invite code; returns the class. Idempotent.
create function public.join_class(p_code text)
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
    (select u.raw_user_meta_data ->> 'user_name' from auth.users u where u.id = auth.uid())
  )
  on conflict (class_id, user_id) do nothing;
  return c;
end;
$$;

-- Creates a sync key for the signed-in user and returns it once; only its hash is stored.
create function public.create_sync_key()
returns text language plpgsql security definer set search_path = '' as $$
declare
  k text := 'qk_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if (select count(*) from public.sync_keys where user_id = auth.uid()) >= 5 then
    raise exception 'at most 5 sync keys; revoke the old ones first' using errcode = '54000';
  end if;
  insert into public.sync_keys (key_hash, user_id)
  values (encode(extensions.digest(k, 'sha256'), 'hex'), auth.uid());
  return k;
end;
$$;

-- Revokes every sync key of the signed-in user; returns how many.
create function public.revoke_sync_keys()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from public.sync_keys where user_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Upserts up to 200 session summaries for the owner of a sync key. Called by local Quoli with
-- the public (anon) key: the sync key is the only credential. Unknown fields are ignored.
create function public.submit_summaries(p_key text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  r jsonb;
  n integer := 0;
begin
  select k.user_id into owner
  from public.sync_keys k
  where k.key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex');
  if owner is null then
    raise exception 'unknown sync key' using errcode = '28000';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'rows must be an array of at most 200 summaries' using errcode = '22023';
  end if;
  update public.sync_keys set last_used_at = now()
  where key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.session_summaries as s (
      user_id, session_id, agent, model, repo, branch, started_at, ended_at, duration_ms,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, usd, calls, failures,
      loops, updated_at
    ) values (
      owner,
      r ->> 'sessionId',
      r ->> 'agent',
      r ->> 'model',
      r ->> 'repo',
      r ->> 'branch',
      (r ->> 'startedAt')::timestamptz,
      (r ->> 'endedAt')::timestamptz,
      (r ->> 'durationMs')::bigint,
      coalesce((r ->> 'inputTokens')::bigint, 0),
      coalesce((r ->> 'outputTokens')::bigint, 0),
      coalesce((r ->> 'cacheReadTokens')::bigint, 0),
      coalesce((r ->> 'cacheWriteTokens')::bigint, 0),
      (r ->> 'usd')::numeric,
      coalesce((r ->> 'calls')::integer, 0),
      coalesce((r ->> 'failures')::integer, 0),
      coalesce((r ->> 'loops')::integer, 0),
      now()
    )
    on conflict (user_id, session_id) do update set
      agent = excluded.agent, model = excluded.model, repo = excluded.repo,
      branch = excluded.branch, started_at = excluded.started_at, ended_at = excluded.ended_at,
      duration_ms = excluded.duration_ms, input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens, cache_read_tokens = excluded.cache_read_tokens,
      cache_write_tokens = excluded.cache_write_tokens, usd = excluded.usd,
      calls = excluded.calls, failures = excluded.failures, loops = excluded.loops,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Function access: everything signed-in users call, plus submit_summaries for local Quoli.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.create_sync_key() to authenticated;
grant execute on function public.revoke_sync_keys() to authenticated;
grant execute on function public.is_class_owner(uuid) to authenticated;
grant execute on function public.is_class_member(uuid) to authenticated;
grant execute on function public.submit_summaries(text, jsonb) to anon, authenticated;

-- Table access: explicit grants (newer Supabase projects grant nothing by default), then RLS.
-- anon gets no table access at all; memberships and summaries are written only by the functions
-- above; sync keys are never readable.
revoke all on public.classes, public.members, public.sync_keys, public.session_summaries
  from anon, authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, delete on public.members to authenticated;
grant select, delete on public.session_summaries to authenticated;
