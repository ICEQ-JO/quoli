import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AGENT_NAMES, type AgentKind } from "../../../shared/model.ts";
import { ago, compact, usd } from "../format.ts";

/**
 * Quoli Classes (#144), hosted on Vercel next to the landing page. Instructors create a class and
 * see their students' session summaries; students join with an invite code and make the sync key
 * their local Quoli uses. Everything goes through Supabase with the public key and row-level
 * security (supabase/migrations): this page holds no secret and sees only what the signed-in
 * user may see.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

interface ClassRow {
  id: string;
  name: string;
  invite_code: string;
  owner: string;
  created_at: string;
}
interface Member {
  class_id: string;
  user_id: string;
  github_login: string | null;
  joined_at: string;
}
interface Summary {
  user_id: string;
  session_id: string;
  agent: AgentKind;
  model: string | null;
  repo: string | null;
  branch: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  usd: number | null;
  calls: number;
  failures: number;
  loops: number;
}

const message = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : String(e);

export function ClassApp() {
  const client = useMemo(() => (SUPABASE_URL && KEY ? createClient(SUPABASE_URL, KEY) : null), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!client) return;
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [client]);

  return (
    <div className="class-shell">
      <header className="class-top">
        <a className="class-brand" href="/landing/">
          <span className="class-logo" aria-hidden="true" />
          Quoli <span className="faint">Classes</span>
        </a>
        {session && client && (
          <div className="class-user">
            <span className="faint">{login(session)}</span>
            <button type="button" className="btn" onClick={() => client.auth.signOut()}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main className="page class-page">
        {!client ? (
          <p className="notice">The class service is not configured for this site yet.</p>
        ) : !ready ? null : session ? (
          <SignedIn client={client} session={session} />
        ) : (
          <SignIn client={client} />
        )}
      </main>
    </div>
  );
}

const login = (s: Session) =>
  (s.user.user_metadata?.user_name as string | undefined) ?? s.user.email ?? "signed in";

function SignIn({ client }: { client: SupabaseClient }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="class-hero">
      <h1>See how your class uses coding agents</h1>
      <p>
        Students share a summary of each session from Quoli on their own machine: which agent and
        model, how long, what it cost, how many calls failed or looped. Never their prompts or code.
      </p>
      <button
        type="button"
        className="btn primary"
        onClick={async () => {
          const { error } = await client.auth.signInWithOAuth({
            provider: "github",
            options: { redirectTo: location.href },
          });
          if (error) setError(error.message);
        }}
      >
        Sign in with GitHub
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function SignedIn({ client, session }: { client: SupabaseClient; session: Session }) {
  const me = session.user.id;
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await client.from("classes").select("*").order("created_at");
    if (error) setError(error.message);
    else setClasses(data as ClassRow[]);
  }, [client]);
  useEffect(() => {
    load();
  }, [load]);

  const teaching = classes?.filter((c) => c.owner === me) ?? [];
  const joined = classes?.filter((c) => c.owner !== me) ?? [];
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {/* Someone who teaches sees their classes first; everyone else starts with joining. */}
      {teaching.length > 0 && <Teaching client={client} classes={teaching} onChange={load} />}
      <div className="class-grid">
        <Joined client={client} me={me} classes={joined} onChange={load} />
        <SyncKey client={client} me={me} />
      </div>
      {classes && !teaching.length && <Teaching client={client} classes={[]} onChange={load} />}
    </>
  );
}

/* ---------- Instructor ---------- */

function Teaching({
  client,
  classes,
  onChange,
}: {
  client: SupabaseClient;
  classes: ClassRow[];
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = classes.find((c) => c.id === open) ?? classes[0] ?? null;
  return (
    <section className="card" aria-labelledby="teach-h">
      <div className="class-head">
        <h2 id="teach-h">Classes you teach</h2>
        <form
          className="field-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const { data, error } = await client
              .from("classes")
              .insert({ name: name.trim() })
              .select()
              .single();
            if (error) return setError(error.message);
            setName("");
            setOpen((data as ClassRow).id);
            onChange();
          }}
        >
          <label htmlFor="class-name" className="sr-only">
            New class name
          </label>
          <input
            id="class-name"
            className="input"
            placeholder="New class, e.g. CS 101 · Fall"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!name.trim()}>
            Create class
          </button>
        </form>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!classes.length ? (
        <p className="faint">
          Create a class to get an invite code for your students. You will see their sessions here
          once they turn on Class sync in Quoli.
        </p>
      ) : (
        <>
          {classes.length > 1 && (
            <div className="class-tabs" role="tablist" aria-label="Your classes">
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={c.id === current?.id}
                  className={c.id === current?.id ? "on" : ""}
                  onClick={() => setOpen(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {current && (
            <ClassView key={current.id} client={client} c={current} onChange={onChange} />
          )}
        </>
      )}
    </section>
  );
}

interface StudentRow {
  m: Member;
  sessions: number;
  last: string | null;
  calls: number;
  failures: number;
  loops: number;
  usd: number;
  unpriced: number;
  agents: Set<AgentKind>;
}

function ClassView({
  client,
  c,
  onChange,
}: {
  client: SupabaseClient;
  c: ClassRow;
  onChange: () => void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [rows, setRows] = useState<Summary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const m = await client.from("members").select("*").eq("class_id", c.id).order("joined_at");
    if (m.error) return setError(m.error.message);
    const list = m.data as Member[];
    setMembers(list);
    if (!list.length) return setRows([]);
    const s = await client
      .from("session_summaries")
      .select("*")
      .in(
        "user_id",
        list.map((x) => x.user_id),
      )
      .order("started_at", { ascending: false })
      .limit(2000);
    if (s.error) setError(s.error.message);
    else setRows(s.data as Summary[]);
  }, [client, c.id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const students: StudentRow[] = (members ?? []).map((m) => {
    // A student's sessions from before they joined this class are not this class's.
    const mine = rows.filter((r) => r.user_id === m.user_id && r.started_at >= m.joined_at);
    return {
      m,
      sessions: mine.length,
      last: mine[0]?.started_at ?? null,
      calls: mine.reduce((n, r) => n + r.calls, 0),
      failures: mine.reduce((n, r) => n + r.failures, 0),
      loops: mine.reduce((n, r) => n + r.loops, 0),
      usd: mine.reduce((n, r) => n + Number(r.usd ?? 0), 0),
      unpriced: mine.filter((r) => r.usd === null).length,
      agents: new Set(mine.map((r) => r.agent)),
    };
  });
  const byUser = new Map((members ?? []).map((m) => [m.user_id, m.github_login ?? "student"]));
  const total = students.reduce((n, s) => n + s.usd, 0);
  const sessions = students.reduce((n, s) => n + s.sessions, 0);
  const activeWeek = students.filter(
    (s) => s.last && Date.now() - Date.parse(s.last) < 7 * 86_400_000,
  ).length;

  return (
    <div className="class-view">
      <div className="class-invite">
        <span className="faint">Invite code</span>
        <code>{c.invite_code}</code>
        <CopyButton text={c.invite_code} />
        <span className="faint">
          Students join at <code>{location.host}/class/</code> with this code.
        </span>
        <button
          type="button"
          className="btn danger class-delete"
          onClick={async () => {
            if (!confirm(`Delete ${c.name}? Students stay; their summaries stay theirs.`)) return;
            const { error } = await client.from("classes").delete().eq("id", c.id);
            if (error) setError(error.message);
            else onChange();
          }}
        >
          Delete class
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <dl className="class-stats">
        <div>
          <dt>Students</dt>
          <dd>{members?.length ?? "…"}</dd>
        </div>
        <div>
          <dt>Active this week</dt>
          <dd>{activeWeek}</dd>
        </div>
        <div>
          <dt>Sessions</dt>
          <dd>{compact(sessions)}</dd>
        </div>
        <div>
          <dt>Estimated spend</dt>
          <dd>{usd(total)}</dd>
        </div>
      </dl>
      {members && !members.length ? (
        <p className="faint">No students yet. Share the invite code above.</p>
      ) : (
        <div className="table-wrap">
          <table className="table class-table">
            <caption className="sr-only">Students and their sessions</caption>
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Agents</th>
                <th scope="col" className="num">
                  Sessions
                </th>
                <th scope="col">Last session</th>
                <th scope="col" className="num">
                  Calls
                </th>
                <th scope="col" className="num">
                  Failed
                </th>
                <th scope="col" className="num">
                  Loops
                </th>
                <th scope="col" className="num">
                  Spend
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {students
                .sort((a, b) => (b.last ?? "").localeCompare(a.last ?? ""))
                .map((s) => (
                  <tr key={s.m.user_id}>
                    <td className="strong">
                      {s.m.github_login ? (
                        <a
                          href={`https://github.com/${s.m.github_login}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {s.m.github_login}
                        </a>
                      ) : (
                        "student"
                      )}
                    </td>
                    <td className="faint">
                      {[...s.agents].map((a) => AGENT_NAMES[a]).join(", ") || "—"}
                    </td>
                    <td className="num">{s.sessions}</td>
                    <td className="nowrap">{s.last ? ago(s.last) : "not yet"}</td>
                    <td className="num">{compact(s.calls)}</td>
                    <td className={`num ${s.failures ? "warn" : ""}`}>{s.failures}</td>
                    <td className={`num ${s.loops ? "warn" : ""}`}>{s.loops}</td>
                    <td
                      className="num"
                      title={
                        s.unpriced
                          ? `${s.unpriced} sessions with unpriced models are not included`
                          : undefined
                      }
                    >
                      {s.unpriced === s.sessions ? "—" : `${usd(s.usd)}${s.unpriced ? "+" : ""}`}
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          if (
                            !confirm(`Remove ${s.m.github_login ?? "this student"} from ${c.name}?`)
                          )
                            return;
                          const { error } = await client
                            .from("members")
                            .delete()
                            .eq("class_id", c.id)
                            .eq("user_id", s.m.user_id);
                          if (error) setError(error.message);
                          else load();
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <details className="class-recent">
          <summary>Recent sessions</summary>
          <div className="table-wrap">
            <table className="table class-table">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Agent · model</th>
                  <th scope="col">Repository</th>
                  <th scope="col">Started</th>
                  <th scope="col" className="num">
                    Minutes
                  </th>
                  <th scope="col" className="num">
                    Calls
                  </th>
                  <th scope="col" className="num">
                    Failed
                  </th>
                  <th scope="col" className="num">
                    Loops
                  </th>
                  <th scope="col" className="num">
                    Spend
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r) => (
                  <tr key={`${r.user_id}:${r.session_id}`}>
                    <td>{byUser.get(r.user_id)}</td>
                    <td className="faint">
                      {AGENT_NAMES[r.agent]}
                      {r.model ? ` · ${r.model}` : ""}
                    </td>
                    <td>
                      {r.repo ? (
                        <a href={`https://github.com/${r.repo}`} target="_blank" rel="noreferrer">
                          {r.repo}
                        </a>
                      ) : (
                        <span className="faint">—</span>
                      )}
                      {r.branch && <span className="faint"> · {r.branch}</span>}
                    </td>
                    <td className="nowrap">{ago(r.started_at)}</td>
                    <td className="num">
                      {r.duration_ms === null
                        ? "live"
                        : Math.max(1, Math.round(r.duration_ms / 60_000))}
                    </td>
                    <td className="num">{r.calls}</td>
                    <td className={`num ${r.failures ? "warn" : ""}`}>{r.failures}</td>
                    <td className={`num ${r.loops ? "warn" : ""}`}>{r.loops}</td>
                    <td className="num">{r.usd === null ? "—" : usd(Number(r.usd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

/* ---------- Student ---------- */

function Joined({
  client,
  me,
  classes,
  onChange,
}: {
  client: SupabaseClient;
  me: string;
  classes: ClassRow[];
  onChange: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section className="card" aria-labelledby="join-h">
      <h2 id="join-h">Classes you joined</h2>
      <form
        className="field-row"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setNotice(null);
          const { data, error } = await client.rpc("join_class", { p_code: code.trim() });
          if (error) return setError(error.message);
          setCode("");
          setNotice(`Joined ${(data as ClassRow).name}. Next: create your sync key.`);
          onChange();
        }}
      >
        <label htmlFor="join-code" className="sr-only">
          Invite code
        </label>
        <input
          id="join-code"
          className="input mono"
          placeholder="Invite code from your instructor"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="btn" disabled={!code.trim()}>
          Join
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {classes.length > 0 && (
        <ul className="class-list">
          {classes.map((c) => (
            <li key={c.id}>
              <span className="strong">{c.name}</span>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  if (
                    !confirm(`Leave ${c.name}? Your instructor will no longer see your sessions.`)
                  )
                    return;
                  const { error } = await client
                    .from("members")
                    .delete()
                    .eq("class_id", c.id)
                    .eq("user_id", me);
                  if (error) setError(message(error));
                  else onChange();
                }}
              >
                Leave
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SyncKey({ client, me }: { client: SupabaseClient; me: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shared, setShared] = useState<number | null>(null);
  const count = useCallback(async () => {
    const { count } = await client
      .from("session_summaries")
      .select("session_id", { count: "exact", head: true })
      .eq("user_id", me);
    setShared(count ?? 0);
  }, [client, me]);
  useEffect(() => {
    count();
  }, [count]);
  return (
    <section className="card" aria-labelledby="key-h">
      <h2 id="key-h">Your sync key</h2>
      <p className="faint">
        Paste it into Quoli on your computer: Settings → Class sync. Then turn on “Send session
        summaries to my class”.
      </p>
      {key ? (
        <div className="class-key">
          <code>{key}</code>
          <CopyButton text={key} />
          <p className="faint">
            Shown once. Keep it private: it lets Quoli share summaries as you.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            setError(null);
            const { data, error } = await client.rpc("create_sync_key");
            if (error) setError(error.message);
            else setKey(data as string);
          }}
        >
          Create sync key
        </button>
      )}
      <div className="class-key-actions">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const { data, error } = await client.rpc("revoke_sync_keys");
            if (error) return setError(error.message);
            setKey(null);
            setNotice(
              `Revoked ${data} ${data === 1 ? "key" : "keys"}. Quoli stops sharing until you add a new one.`,
            );
          }}
        >
          Revoke my keys
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={!shared}
          onClick={async () => {
            if (!confirm("Delete every summary you have shared? This cannot be undone.")) return;
            const { error } = await client.from("session_summaries").delete().eq("user_id", me);
            if (error) return setError(error.message);
            setNotice("Deleted your shared summaries.");
            count();
          }}
        >
          Delete what I shared{shared ? ` (${shared})` : ""}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
