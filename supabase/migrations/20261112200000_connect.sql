-- Connect a computer to a Quoli account (#154) without copying a sync key.
--
--   1. Local Quoli makes a random secret, keeps it, and calls link_start with its SHA-256. It gets
--      a short code (ABCD-EFGH) to show in the terminal and open in the browser.
--   2. The signed-in user sees the same code on the account page and approves it (link_approve).
--   3. Local Quoli calls link_collect with the secret every few seconds. Once approved, it gets a
--      new sync key for that user, exactly once, and the request is deleted.
--
-- Requests expire after 10 minutes. Anonymous callers can only start and collect; the table is
-- never readable. The secret is never stored, only its hash.

create table public.link_requests (
  code_hash text primary key,
  pair text not null unique,
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.link_requests enable row level security;
revoke all on public.link_requests from anon, authenticated;

-- Starts a link request; returns the short code. 32 symbols without look-alikes (no 0/O, 1/I).
create function public.link_start(p_code_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  symbols constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  p text;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'not a link request' using errcode = '22023';
  end if;
  delete from public.link_requests where created_at < now() - interval '10 minutes';
  if (select count(*) from public.link_requests) >= 1000 then
    raise exception 'too many computers are connecting right now; try again in a few minutes'
      using errcode = '54000';
  end if;
  loop
    b := extensions.gen_random_bytes(8);
    p := '';
    for i in 0..7 loop
      p := p || substr(symbols, get_byte(b, i) % 32 + 1, 1) || case when i = 3 then '-' else '' end;
    end loop;
    begin
      insert into public.link_requests (code_hash, pair) values (p_code_hash, p);
      return p;
    exception when unique_violation then
      if exists (select 1 from public.link_requests where code_hash = p_code_hash) then
        raise exception 'that link request already exists' using errcode = '23505';
      end if;
      -- A clash on the short code: draw another.
    end;
  end loop;
end;
$$;

-- Approves a pending code for the signed-in user.
create function public.link_approve(p_pair text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  update public.link_requests
  set user_id = auth.uid(), approved_at = now()
  where pair = upper(trim(coalesce(p_pair, '')))
    and user_id is null
    and created_at >= now() - interval '10 minutes';
  if not found then
    raise exception 'that code has expired or was already used; run connect again'
      using errcode = 'P0002';
  end if;
  return true;
end;
$$;

-- Collects an approved request with the secret: returns a new sync key once, or null while the
-- request waits for approval. A user keeps at most 5 keys; the least recently used goes first.
create function public.link_collect(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r public.link_requests;
  k text;
begin
  select * into r from public.link_requests
  where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex');
  if r.code_hash is null or r.created_at < now() - interval '10 minutes' then
    raise exception 'this link expired; run connect again' using errcode = 'P0002';
  end if;
  if r.user_id is null then
    return null;
  end if;
  delete from public.link_requests where code_hash = r.code_hash;
  delete from public.sync_keys where key_hash in (
    select key_hash from public.sync_keys where user_id = r.user_id
    order by coalesce(last_used_at, created_at) desc offset 4
  );
  k := 'qk_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.sync_keys (key_hash, user_id)
  values (encode(extensions.digest(k, 'sha256'), 'hex'), r.user_id);
  return k;
end;
$$;

-- What the account page shows about the signed-in user: connected computers and shared sessions.
create function public.my_account()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'computers', (select count(*) from public.sync_keys where user_id = auth.uid()),
    'lastUploadAt', (select max(last_used_at) from public.sync_keys where user_id = auth.uid()),
    'sessions', (select count(*) from public.session_summaries where user_id = auth.uid())
  );
$$;

-- Members who signed in with Google have no GitHub login: show their name instead.
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
       u.raw_user_meta_data ->> 'name')
     from auth.users u where u.id = auth.uid())
  )
  on conflict (class_id, user_id) do nothing;
  return c;
end;
$$;

revoke execute on function public.link_start(text), public.link_approve(text),
  public.link_collect(text), public.my_account() from public, anon;
grant execute on function public.link_start(text) to anon, authenticated;
grant execute on function public.link_collect(text) to anon, authenticated;
grant execute on function public.link_approve(text) to authenticated;
grant execute on function public.my_account() to authenticated;
