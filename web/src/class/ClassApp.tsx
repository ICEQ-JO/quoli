import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HOSTED_SUPABASE } from "../../../shared/hosted.ts";
import { AGENT_NAMES, type AgentKind } from "../../../shared/model.ts";
import { ago, compact, usd } from "../format.ts";
import { Activity } from "./Activity.tsx";

/**
 * The Quoli account page at /app/ (#144, #151), hosted on Vercel next to the landing page. Anyone
 * signs in with GitHub; owners create a team (a class is one kind) and see their members' session
 * summaries; members join with an invite code and make the sync key their local Quoli uses. The
 * database keeps its first names (`classes`, `join_class`): a team is a row in `classes`. Everything goes through Supabase with the public key and row-level
 * security (supabase/migrations): this page holds no secret and sees only what the signed-in
 * user may see.
 */

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || HOSTED_SUPABASE.url;
const KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || HOSTED_SUPABASE.publishableKey;
/** One command sets up Quoli, links the computer through this page, and starts it (#154). */
// The permanent link: it always starts the newest version (server/cli.ts).
const START = `npx https://${location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "iceq.best" : location.host}/quoli.tgz`;
const CONNECT = `${START} connect`;
/** A code from `quoli connect` waiting for approval, kept across the sign-in redirect. */
const PENDING = "quoli.connect";

interface Account {
  computers: number;
  lastUploadAt: string | null;
  sessions: number;
}

function takeConnectCode(): string | null {
  const fromUrl = new URLSearchParams(location.search).get("connect");
  try {
    if (fromUrl && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(fromUrl)) {
      sessionStorage.setItem(PENDING, fromUrl.toUpperCase());
      history.replaceState(null, "", location.pathname);
    }
    return sessionStorage.getItem(PENDING);
  } catch {
    return fromUrl;
  }
}
const dropConnectCode = () => {
  try {
    sessionStorage.removeItem(PENDING);
  } catch {}
};

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
  const [pending, setPending] = useState<string | null>(takeConnectCode);

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
          Quoli
        </a>
        {session && client && (
          <div className="class-user">
            <span className="faint">{login(session)}</span>
            <a className="btn primary" href="/studio/">
              Open Quoli
            </a>
            <button type="button" className="btn" onClick={() => client.auth.signOut()}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main className="page class-page">
        {!client ? (
          <p className="notice">Quoli accounts are not set up for this site yet.</p>
        ) : !ready ? null : session ? (
          <SignedIn
            client={client}
            session={session}
            pending={pending}
            clearPending={() => {
              dropConnectCode();
              setPending(null);
            }}
          />
        ) : (
          <SignIn client={client} pending={pending} />
        )}
      </main>
    </div>
  );
}

const login = (s: Session) =>
  (s.user.user_metadata?.user_name as string | undefined) ??
  (s.user.user_metadata?.full_name as string | undefined) ??
  s.user.email ??
  "signed in";

function SignIn({ client, pending }: { client: SupabaseClient; pending: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    // The Google button appears once Google sign-in is turned on in Supabase.
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: KEY } })
      .then((r) => r.json())
      .then((s: { external?: { google?: boolean } }) => setGoogle(!!s.external?.google))
      .catch(() => {});
  }, []);
  const signIn = async (provider: "github" | "google") => {
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/app/` },
    });
    if (error) setError(error.message);
  };
  return (
    <section className="class-hero">
      {pending && (
        <p className="notice" role="status">
          Sign in to connect your computer (code <code>{pending}</code>).
        </p>
      )}
      <h1>See how your team uses coding agents</h1>
      <p>
        Quoli runs on each person's own machine. In a team (a class, a company, a group of friends)
        members can share a summary of each session: which agent and model, how long, what it cost,
        how many calls failed or looped. Never their prompts or code.
      </p>
      <div className="class-signin">
        <button type="button" className="btn primary" onClick={() => signIn("github")}>
          Sign in with GitHub
        </button>
        {google && (
          <button type="button" className="btn" onClick={() => signIn("google")}>
            Sign in with Google
          </button>
        )}
      </div>
      <form
        className="class-email"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSending(true);
          const address = email.trim();
          const { error } = await client.auth.signInWithOtp({
            email: address,
            options: { emailRedirectTo: `${location.origin}/app/` },
          });
          setSending(false);
          if (!error) return setSentTo(address);
          setError(
            error.status === 429
              ? "Too many sign-in emails right now. Wait a minute and try again."
              : `Could not send the email: ${error.message}`,
          );
        }}
      >
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          required
          placeholder="Or your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn" disabled={sending || !email.trim()}>
          {sending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      {sentTo && (
        <p className="notice" role="status">
          Check {sentTo} for a sign-in link from Quoli and open it in this browser. It can take a
          minute; look in spam too.
        </p>
      )}
      <p className="faint">Free. Your account is created the first time you sign in.</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function SignedIn({
  client,
  session,
  pending,
  clearPending,
}: {
  client: SupabaseClient;
  session: Session;
  pending: string | null;
  clearPending: () => void;
}) {
  const me = session.user.id;
  const [account, setAccount] = useState<Account | null>(null);
  const loadAccount = useCallback(async () => {
    const { data } = await client.rpc("my_account");
    if (data) setAccount(data as Account);
  }, [client]);
  useEffect(() => {
    loadAccount();
    const t = setInterval(loadAccount, 60_000);
    return () => clearInterval(t);
  }, [loadAccount]);
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
      {pending && (
        <Approve
          client={client}
          pair={pending}
          onDone={() => {
            clearPending();
            // The computer collects its key within a couple of seconds.
            setTimeout(loadAccount, 4000);
          }}
        />
      )}
      <Computers client={client} me={me} account={account} />
      {account && (account.computers > 0 || account.sessions > 0) && (
        <Activity client={client} me={me} />
      )}
      <h2 className="class-section">Teams</h2>
      {/* Someone who owns a team sees it first; everyone else starts with joining. */}
      {teaching.length > 0 && <Teaching client={client} classes={teaching} onChange={load} />}
      <div className="class-grid">
        <Joined client={client} me={me} classes={joined} onChange={load} />
        {classes && !teaching.length && <Teaching client={client} classes={[]} onChange={load} />}
      </div>
    </>
  );
}

/* ---------- This account's computers (#154) ---------- */

function Approve({
  client,
  pair,
  onDone,
}: {
  client: SupabaseClient;
  pair: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<"ask" | "done">("ask");
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card class-approve" aria-labelledby="approve-h">
      {state === "done" ? (
        <>
          <h2 id="approve-h">Computer connected</h2>
          <p>Your terminal continues by itself in a few seconds. You can close this tab.</p>
          <button type="button" className="btn" onClick={onDone}>
            Done
          </button>
        </>
      ) : (
        <>
          <h2 id="approve-h">Connect this computer to your account?</h2>
          <p>
            Check that your terminal shows the same code: <code className="class-pair">{pair}</code>
          </p>
          <p className="faint">
            Only approve a code from a <code>connect</code> you just ran yourself. Approving lets
            that computer share session summaries as you.
          </p>
          <div className="field-row">
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                setError(null);
                const { error } = await client.rpc("link_approve", { p_pair: pair });
                if (error) return setError(error.message);
                dropConnectCode();
                setState("done");
              }}
            >
              Approve
            </button>
            <button type="button" className="btn" onClick={onDone}>
              Cancel
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Computers({
  client,
  me,
  account,
}: {
  client: SupabaseClient;
  me: string;
  account: Account | null;
}) {
  if (!account) return null;
  const command = (
    <div className="class-command">
      <code>{CONNECT}</code>
      <CopyButton text={CONNECT} />
    </div>
  );
  if (account.sessions === 0) return <GettingStarted client={client} me={me} account={account} />;
  return (
    <section className="card class-computers" aria-labelledby="computers-h">
      {account.computers === 0 ? (
        <>
          <h2 id="computers-h">Connect your computer</h2>
          <p>Run this in a terminal to link this computer to your account.</p>
          {command}
        </>
      ) : (
        <>
          <h2 id="computers-h">Your computers</h2>
          <p>
            {account.computers} {account.computers === 1 ? "connection" : "connections"} ·{" "}
            {account.lastUploadAt ? `last upload ${ago(account.lastUploadAt)}` : "no uploads yet"} ·{" "}
            {compact(account.sessions)} {account.sessions === 1 ? "session" : "sessions"} shared
          </p>
          <details className="class-more">
            <summary>Connect another computer</summary>
            {command}
          </details>
        </>
      )}
      <details className="class-more">
        <summary>Sync keys and shared data</summary>
        <SyncKey client={client} me={me} />
      </details>
    </section>
  );
}

/**
 * What a new account sees until its first session arrives: the steps from nothing to a recorded
 * session, each ticked off as the account reports it (a linked computer, a shared session).
 */
function GettingStarted({
  client,
  me,
  account,
}: {
  client: SupabaseClient;
  me: string;
  account: Account;
}) {
  const linked = account.computers > 0;
  const steps: { title: string; done: boolean; body: React.ReactNode }[] = [
    {
      title: "Check Node.js",
      done: linked,
      body: (
        <p>
          Quoli needs Node.js 22.13 or newer. Run <code>node -v</code> in a terminal; if it is older
          or missing, install the LTS from{" "}
          <a href="https://nodejs.org" target="_blank" rel="noreferrer">
            nodejs.org
          </a>
          .
        </p>
      ),
    },
    {
      title: "Run Quoli in your project",
      done: linked,
      body: (
        <>
          <p>
            Open a terminal in the project you work on and run this. It asks whether to record only
            that project or every project, offers to connect this account, and opens Quoli.
          </p>
          <div className="class-command">
            <code>{START}</code>
            <CopyButton text={START} />
          </div>
          <p className="faint">
            When it asks to connect, say yes and approve the code it shows on this page.
          </p>
        </>
      ),
    },
    {
      title: "Work with your coding agent",
      done: account.sessions > 0,
      body: (
        <p>
          Use Claude Code, Codex, OpenCode or Pi as usual, in a new session. Quoli records in the
          background, even with the terminal closed, and the session appears here when it ends.
        </p>
      ),
    },
    {
      title: "Look closer any time",
      done: false,
      body: (
        <p>
          This page shows summaries: time, cost, models, failures. For the full map of a session
          (prompts, files, diffs, Git), run the same command again; it opens on your computer at{" "}
          <code>127.0.0.1:4400</code>. Your prompts and code never leave it.
        </p>
      ),
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <section className="card class-start" aria-labelledby="start-h">
      <h2 id="start-h">Getting started</h2>
      <ol className="steps">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={s.done ? "done" : i === current ? "current" : undefined}
            aria-current={i === current ? "step" : undefined}
          >
            <span className="step-mark" aria-hidden="true">
              {s.done ? (
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <div className="step-body">
              <h3>
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
              </h3>
              {(i === current || !s.done) && s.body}
            </div>
          </li>
        ))}
      </ol>
      <details className="class-more">
        <summary>Sync keys and shared data</summary>
        <SyncKey client={client} me={me} />
      </details>
    </section>
  );
}

/* ---------- Team owner ---------- */

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
        <h2 id="teach-h">Teams you own</h2>
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
            New team name
          </label>
          <input
            id="class-name"
            className="input"
            placeholder="New team, e.g. CS 101 · Fall or Acme backend"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!name.trim()}>
            Create team
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
          Create a team to get an invite code. You will see members' sessions here once they turn on
          Team sync in Quoli.
        </p>
      ) : (
        <>
          {classes.length > 1 && (
            <div className="class-tabs" role="tablist" aria-label="Your teams">
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
    // A member's sessions from before they joined this team are not this team's.
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
  const byUser = new Map((members ?? []).map((m) => [m.user_id, m.github_login ?? "member"]));
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
          Members join at <code>{location.host}/app/</code> with this code.
        </span>
        <button
          type="button"
          className="btn danger class-delete"
          onClick={async () => {
            if (!confirm(`Delete ${c.name}? Members keep their accounts and their own summaries.`))
              return;
            const { error } = await client.from("classes").delete().eq("id", c.id);
            if (error) setError(error.message);
            else onChange();
          }}
        >
          Delete team
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <dl className="class-stats">
        <div>
          <dt>Members</dt>
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
        <p className="faint">No members yet. Share the invite code above.</p>
      ) : (
        <div className="table-wrap">
          <table className="table class-table">
            <caption className="sr-only">Members and their sessions</caption>
            <thead>
              <tr>
                <th scope="col">Member</th>
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
                        "member"
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
                            !confirm(`Remove ${s.m.github_login ?? "this member"} from ${c.name}?`)
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
                  <th scope="col">Member</th>
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

/* ---------- Member ---------- */

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
      <h2 id="join-h">Teams you joined</h2>
      <form
        className="field-row"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setNotice(null);
          const { data, error } = await client.rpc("join_class", { p_code: code.trim() });
          if (error)
            return setError(
              error.code === "P0002"
                ? "No team has that invite code. Check it with the team owner."
                : error.message,
            );
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
          placeholder="Invite code from the team owner"
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
                  if (!confirm(`Leave ${c.name}? The team owner will no longer see your sessions.`))
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
    <div className="class-keys">
      <p className="faint">
        If connecting does not work, create a sync key and paste it into Quoli on your computer:
        Settings → Team sync → Use a sync key instead.
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
    </div>
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
