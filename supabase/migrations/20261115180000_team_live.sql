-- Who is working now (#25): live session summaries of a team's members. Presence needs no new
-- upload: Team sync re-sends a session's summary every minute while it has activity, and sends its
-- end time when it ends. A session counts as live while it has no end and its summary was updated
-- in the last 5 minutes.
--
-- The team owner always sees it. Members see each other only when the owner turns on
-- members_see_live (off by default); members' summaries stay otherwise owner-only.

alter table public.classes add column members_see_live boolean not null default false;

create function public.team_live(p_class uuid)
returns table (
  user_id uuid,
  member text,
  agent text,
  model text,
  repo text,
  branch text,
  started_at timestamptz,
  updated_at timestamptz,
  usd numeric,
  calls integer,
  failures integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (
    public.is_class_owner(p_class)
    or (
      public.is_class_member(p_class)
      and (select c.members_see_live from public.classes c where c.id = p_class)
    )
  ) then
    raise exception 'not allowed to see this team' using errcode = '42501';
  end if;
  return query
    select s.user_id, m.github_login, s.agent, s.model, s.repo, s.branch, s.started_at,
           s.updated_at, s.usd, s.calls, s.failures
    from public.session_summaries s
    join public.members m on m.user_id = s.user_id and m.class_id = p_class
    where s.ended_at is null
      and s.updated_at > now() - interval '5 minutes'
      and s.started_at >= m.joined_at
    order by s.started_at;
end;
$$;

revoke execute on function public.team_live(uuid) from public, anon;
grant execute on function public.team_live(uuid) to authenticated;
