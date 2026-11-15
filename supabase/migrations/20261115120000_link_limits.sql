-- Account linking (#16): one client can no longer fill the shared pool of link requests and block
-- everyone else, and the approval page can show how old a request is.
--
-- The client is the first address in X-Forwarded-For, as Supabase documents for the Data API
-- (supabase.com/docs/guides/api/securing-your-api). A client that forges that header can spread
-- its requests over made-up addresses; the global cap still bounds the table.

create table public.link_starts (
  client text not null,
  at timestamptz not null default now()
);
create index link_starts_client_at on public.link_starts (client, at);
alter table public.link_starts enable row level security;
revoke all on public.link_starts from anon, authenticated;

create or replace function public.link_start(p_code_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  symbols constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  p text;
  who text := coalesce(nullif(trim(split_part(
    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'not a link request' using errcode = '22023';
  end if;
  delete from public.link_requests where created_at < now() - interval '10 minutes';
  delete from public.link_starts where at < now() - interval '10 minutes';
  if (select count(*) from public.link_starts where client = who) >= 10 then
    raise exception 'too many connect attempts from this network; try again in a few minutes'
      using errcode = '54000';
  end if;
  if (select count(*) from public.link_requests) >= 10000 then
    raise exception 'too many computers are connecting right now; try again in a few minutes'
      using errcode = '54000';
  end if;
  insert into public.link_starts (client) values (who);
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
    end;
  end loop;
end;
$$;

-- How long ago a code still waiting for approval was started, in whole seconds; null when there is
-- no such code. Signed-in users only; reveals nothing about who started it.
create function public.link_age(p_pair text)
returns integer language sql stable security definer set search_path = '' as $$
  select extract(epoch from now() - created_at)::integer
  from public.link_requests
  where pair = upper(trim(coalesce(p_pair, '')))
    and user_id is null
    and created_at >= now() - interval '10 minutes';
$$;

revoke execute on function public.link_age(text) from public, anon;
grant execute on function public.link_age(text) to authenticated;
