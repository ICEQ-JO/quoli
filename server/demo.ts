import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentKind } from "../shared/model.ts";
import type { Store } from "./db.ts";
import { home, projectId } from "./db.ts";
import { ingest, recordEvent } from "./ingest.ts";
import { loadManual, saveManual } from "./manual.ts";

/**
 * Builds a small sample repository ("shop") and records three synthetic
 * Claude Code sessions against it, so Quoli can be explored without
 * connecting a real agent. Everything here is authored sample data.
 */

const BASE: Record<string, string> = {
  "README.md": "# Shop\n\nStorefront (Next.js), orders API (Hono) and a receipt worker.\n",
  "package.json": JSON.stringify({ name: "shop", private: true, workspaces: ["apps/*"] }, null, 2),
  "docker-compose.yml": `services:
  api:
    build: ./apps/api
    ports: ["8080:8080"]
    depends_on: [db, redis]
  worker:
    build: ./apps/worker
    depends_on: [db, redis]
  db:
    image: postgres:16
    ports: ["5432:5432"]
  redis:
    image: redis:7
`,
  ".github/workflows/deploy.yml": `name: Deploy
on: { push: { branches: [main] } }
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx vercel deploy --prod
  images:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v6
`,
  "apps/web/package.json": JSON.stringify(
    { name: "storefront", dependencies: { next: "16.0.0", react: "19.2.0" } },
    null,
    2,
  ),
  "apps/web/vercel.json": "{}\n",
  "apps/web/app/page.tsx": `import { ProductGrid } from "../components/product-grid";\n\nexport default function Home() {\n  return <ProductGrid />;\n}\n`,
  "apps/web/app/orders/page.tsx": `import { getOrders } from "../../lib/api";\nimport { OrderRow } from "../../components/order-row";\n\nexport default async function Orders() {\n  const orders = await getOrders();\n  return <table>{orders.map((o) => <OrderRow key={o.id} order={o} />)}</table>;\n}\n`,
  "apps/web/components/product-grid.tsx": `export function ProductGrid() {\n  return <section className="grid" />;\n}\n`,
  "apps/web/components/order-row.tsx": `export function OrderRow({ order }: { order: { id: string; total: number } }) {\n  return (\n    <tr>\n      <td>{order.id}</td>\n      <td>{order.total}</td>\n    </tr>\n  );\n}\n`,
  "apps/web/lib/api.ts": `const API = process.env.API_URL ?? "http://localhost:8080";\n\nexport async function getOrders() {\n  return (await fetch(\`\${API}/orders\`)).json();\n}\n`,
  "apps/api/package.json": JSON.stringify(
    {
      name: "orders-api",
      dependencies: { hono: "4.6.0", pg: "8.13.0", ioredis: "5.4.0", stripe: "17.0.0" },
    },
    null,
    2,
  ),
  "apps/api/Dockerfile":
    'FROM node:24-slim\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "src/index.ts"]\n',
  "apps/api/src/index.ts": `import { Hono } from "hono";\nimport { orders } from "./routes/orders";\n\nconst app = new Hono();\napp.route("/orders", orders);\n\nexport default app;\n`,
  "apps/api/src/routes/orders.ts": `import { Hono } from "hono";\nimport { createOrder, listOrders } from "../services/order";\n\nexport const orders = new Hono();\n\norders.get("/", async (c) => c.json(await listOrders()));\norders.post("/", async (c) => c.json(await createOrder(await c.req.json()), 201));\n`,
  "apps/api/src/routes/orders.test.ts": `import { test } from "node:test";\nimport assert from "node:assert";\nimport { total } from "../services/order";\n\ntest("totals round to cents", () => {\n  assert.equal(total([{ price: 19.99, qty: 3, discount: 0.1 }]), 53.97);\n});\n`,
  "apps/api/src/services/order.ts": `import { db } from "../db/client";\nimport { charge } from "./payments";\n\nexport function total(items: { price: number; qty: number; discount: number }[]) {\n  return items.reduce((sum, i) => sum + i.price * i.qty * (1 - i.discount), 0);\n}\n\nexport async function listOrders() {\n  return (await db.query("select * from orders order by created_at desc")).rows;\n}\n\nexport async function createOrder(input: { items: { price: number; qty: number; discount: number }[] }) {\n  const amount = total(input.items);\n  await charge(amount);\n  return (await db.query("insert into orders (total) values ($1) returning *", [amount])).rows[0];\n}\n`,
  "apps/api/src/services/payments.ts": `import Stripe from "stripe";\n\nconst stripe = new Stripe(process.env.STRIPE_KEY ?? "");\n\nexport async function charge(amount: number) {\n  return stripe.paymentIntents.create({ amount: Math.round(amount * 100), currency: "usd" });\n}\n`,
  "apps/api/src/db/client.ts": `import pg from "pg";\n\nexport const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });\n`,
  "apps/api/src/db/schema.sql":
    "create table orders (\n  id serial primary key,\n  total numeric not null,\n  created_at timestamptz default now()\n);\n",
  "apps/api/src/cache.ts": `import Redis from "ioredis";\n\nexport const cache = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");\n`,
  "apps/worker/package.json": JSON.stringify(
    { name: "receipt-worker", dependencies: { bullmq: "5.0.0", resend: "4.0.0" } },
    null,
    2,
  ),
  "apps/worker/Dockerfile":
    'FROM node:24-slim\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "src/index.ts"]\n',
  "apps/worker/src/index.ts": `import { Worker } from "bullmq";\nimport { sendReceipt } from "./jobs/send-receipt";\n\nnew Worker("receipts", sendReceipt, { connection: { url: process.env.REDIS_URL } });\n`,
  "apps/worker/src/jobs/send-receipt.ts": `import { Resend } from "resend";\n\nconst resend = new Resend(process.env.RESEND_KEY);\n\nexport async function sendReceipt(job: { data: { email: string; orderId: string } }) {\n  await resend.emails.send({ to: job.data.email, from: "shop@example.com", subject: \`Receipt \${job.data.orderId}\`, text: "Thanks!" });\n}\n`,
};

const FIXED_TOTAL = `export function total(items: { price: number; qty: number; discount: number }[]) {\n  const cents = items.reduce((sum, i) => sum + Math.round(i.price * 100) * i.qty * (1 - i.discount), 0);\n  return Math.round(cents) / 100;\n}`;

const REFUNDS_ROUTE = `import { Hono } from "hono";\nimport { db } from "../db/client";\nimport { refund } from "../services/payments";\nimport { queue } from "../queue";\n\nexport const refunds = new Hono();\n\nrefunds.post("/:id/refunds", async (c) => {\n  const id = c.req.param("id");\n  const order = (await db.query("select * from orders where id = $1", [id])).rows[0];\n  if (!order) return c.json({ error: "Order not found" }, 404);\n  const result = await refund(order.payment_intent);\n  await db.query("insert into refunds (order_id, stripe_id) values ($1, $2)", [id, result.id]);\n  await queue.add("refund-email", { orderId: id });\n  return c.json({ refunded: true }, 201);\n});\n`;

/** Commit date for the sample repository's history, so it lines up with the sessions' times. */
let when = "";
const ago = (ms: number) => {
  when = new Date(Date.now() - ms).toISOString();
};
const DAY = 86_400_000;

function sh(cwd: string, ...args: string[]) {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Demo",
      GIT_AUTHOR_EMAIL: "demo@example.com",
      GIT_COMMITTER_NAME: "Demo",
      GIT_COMMITTER_EMAIL: "demo@example.com",
      GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_DATE: when,
    },
  });
}

function write(root: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** The worktree a second agent works in, beside the demo repository (#17). */
const webhooksTree = (root: string) => join(dirname(root), "shop-webhooks");

function buildRepo(root: string) {
  rmSync(root, { recursive: true, force: true });
  rmSync(webhooksTree(root), { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  sh(root, "init", "-q", "-b", "main");
  const {
    "apps/worker/package.json": w,
    "apps/worker/Dockerfile": wd,
    "apps/worker/src/index.ts": wi,
    "apps/worker/src/jobs/send-receipt.ts": ws,
    ...first
  } = BASE;
  write(root, first);
  sh(root, "add", "-A");
  ago(10 * DAY);
  sh(root, "commit", "-qm", "Scaffold storefront and orders API");
  write(root, {
    "apps/worker/package.json": w,
    "apps/worker/Dockerfile": wd,
    "apps/worker/src/index.ts": wi,
    "apps/worker/src/jobs/send-receipt.ts": ws,
  });
  sh(root, "add", "-A");
  ago(9 * DAY);
  sh(root, "commit", "-qm", "Add receipt worker");
  const order = BASE["apps/api/src/services/order.ts"].replace(
    /export function total[\s\S]*?\n}/,
    FIXED_TOTAL,
  );
  write(root, { "apps/api/src/services/order.ts": order });
  ago(2 * DAY - 3 * 60_000);
  sh(root, "commit", "-qam", "Fix rounding in order totals");
  sh(root, "checkout", "-qb", "feature/search");
  write(root, {
    "apps/web/components/search.tsx":
      'export function Search() {\n  return <input type="search" />;\n}\n',
  });
  sh(root, "add", "-A");
  ago(5 * DAY);
  sh(root, "commit", "-qm", "Add search box");
  sh(root, "checkout", "-q", "main");
  sh(root, "checkout", "-qb", "feature/refunds");
  write(root, {
    "apps/api/src/db/schema.sql": `${BASE["apps/api/src/db/schema.sql"]}\nalter table orders add column payment_intent text;\n`,
  });
  ago(90 * 60_000);
  sh(root, "commit", "-qam", "Store payment intent on orders");
  // A parallel agent in its own worktree, branched from main: its schema change lands on the same
  // lines as the refunds branch's, so the two branches conflict (#17).
  sh(root, "branch", "feature/webhooks", "main");
  sh(root, "worktree", "add", "-q", webhooksTree(root), "feature/webhooks");
  write(webhooksTree(root), {
    "apps/api/src/db/schema.sql": `${BASE["apps/api/src/db/schema.sql"]}\nalter table orders add column refunded_at timestamptz;\n`,
  });
  ago(8 * 60_000);
  sh(webhooksTree(root), "commit", "-qam", "Record when an order is refunded");
  // Working-tree changes left by the refunds session.
  write(root, {
    "apps/api/src/routes/refunds.ts": REFUNDS_ROUTE,
    "apps/api/src/routes/refunds.test.ts": `import { test } from "node:test";\nimport assert from "node:assert";\nimport { refunds } from "./refunds";\n\ntest("unknown order is a 404", async () => {\n  const res = await refunds.request("/999/refunds", { method: "POST" });\n  assert.equal(res.status, 404);\n});\n`,
    "apps/api/src/queue.ts": `import { Queue } from "bullmq";\n\nexport const queue = new Queue("receipts", { connection: { url: process.env.REDIS_URL } });\n`,
    "apps/api/src/services/payments.ts": `${BASE["apps/api/src/services/payments.ts"]}\nexport async function refund(paymentIntent: string) {\n  return stripe.refunds.create({ payment_intent: paymentIntent });\n}\n`,
    "apps/api/src/index.ts": BASE["apps/api/src/index.ts"]
      .replace(
        `import { orders } from "./routes/orders";\n`,
        `import { orders } from "./routes/orders";\nimport { refunds } from "./routes/refunds";\n`,
      )
      .replace(
        `app.route("/orders", orders);\n`,
        `app.route("/orders", orders);\napp.route("/orders", refunds);\n`,
      ),
    "apps/api/src/db/schema.sql": `${BASE["apps/api/src/db/schema.sql"]}\nalter table orders add column payment_intent text;\n\ncreate table refunds (\n  id serial primary key,\n  order_id int references orders(id),\n  stripe_id text not null,\n  created_at timestamptz default now()\n);\n`,
    "apps/worker/src/jobs/send-refund-email.ts": `import { Resend } from "resend";\n\nconst resend = new Resend(process.env.RESEND_KEY);\n\nexport async function sendRefundEmail(job: { data: { email: string; orderId: string } }) {\n  await resend.emails.send({ to: job.data.email, from: "shop@example.com", subject: \`Refund for \${job.data.orderId}\`, text: "Your refund is on its way." });\n}\n`,
    "apps/web/components/order-row.tsx": `export function OrderRow({ order }: { order: { id: string; total: number } }) {\n  return (\n    <tr>\n      <td>{order.id}</td>\n      <td>{order.total}</td>\n      <td>\n        <form action={\`/api/orders/\${order.id}/refunds\`} method="post">\n          <button type="submit">Refund</button>\n        </form>\n      </td>\n    </tr>\n  );\n}\n`,
  });
}

type Step =
  | { prompt: string }
  | {
      tool: string;
      input: Record<string, unknown>;
      output?: unknown;
      fail?: boolean;
      agent?: string;
      secs?: number;
      /** Claude Code's `mcp_server` field on MCP tool calls. */
      mcp?: { name: string; source: string };
    }
  | { subagent: string; type: string; start: boolean }
  /** Any other hook event as Claude Code sends it (instruction files, compaction, commands). */
  | { hook: Record<string, unknown> };

function record(
  store: Store,
  opts: {
    id: string;
    root: string;
    branch: string;
    start: number;
    steps: Step[];
    end: boolean;
    transcripts: string;
    /** Another agent's session: events go through `recordEvent`, token usage straight to the store. */
    agent?: { kind: AgentKind; version: string; model: string };
    /** The agent's final reply, sent on Stop like `last_assistant_message`. */
    reply?: string;
  },
) {
  const { id, root } = opts;
  let t = opts.start;
  const at = () => new Date(t).toISOString();
  const transcript = join(opts.transcripts, `${id}.jsonl`);
  const lines: string[] = [];
  const subLines = new Map<string, string[]>();
  let msg = 0;
  const usage = (
    agent: string,
    input: number,
    output: number,
    cacheRead: number,
    cacheWrite: number,
  ) => {
    if (opts.agent) {
      store.upsertUsage({
        messageId: `msg_${id}_${msg++}`,
        sessionId: id,
        agentId: agent,
        model: opts.agent.model,
        at: at(),
        input,
        output,
        cacheRead,
        cacheWrite,
      });
      return;
    }
    const line = JSON.stringify({
      type: "assistant",
      timestamp: at(),
      message: {
        id: `msg_${id}_${msg++}`,
        model: agent === "main" ? "claude-sonnet-4-5" : "claude-haiku-4-5",
        usage: {
          input_tokens: input,
          output_tokens: output,
          cache_read_input_tokens: cacheRead,
          cache_creation_input_tokens: cacheWrite,
        },
      },
    });
    if (agent === "main") lines.push(line);
    else subLines.set(agent, [...(subLines.get(agent) ?? []), line]);
  };
  const flush = () => {
    writeFileSync(transcript, lines.length ? `${lines.join("\n")}\n` : "");
    for (const [agent, l] of subLines)
      writeFileSync(join(opts.transcripts, `${id}-${agent}.jsonl`), `${l.join("\n")}\n`);
  };
  const send = (payload: Record<string, unknown>) => {
    if (opts.agent) {
      const { kind, version } = opts.agent;
      const p = { session_id: id, cwd: root, quoli_agent_version: version, ...payload };
      recordEvent(store, p, kind, at());
      return;
    }
    flush();
    ingest(store, { session_id: id, cwd: root, transcript_path: transcript, ...payload }, at());
  };

  send({ hook_event_name: "SessionStart", source: "startup", quoli_branch: opts.branch });
  let n = 0;
  // Context shrinks after a compaction: later requests resend less cached history.
  let compacted = 0;
  for (const step of opts.steps) {
    t += 4000;
    if ("hook" in step) {
      if (step.hook.hook_event_name === "PostCompact") compacted = n * 1500 + 6000;
      send(step.hook);
      continue;
    }
    if ("prompt" in step) {
      send({ hook_event_name: "UserPromptSubmit", prompt: step.prompt });
      continue;
    }
    if ("subagent" in step) {
      if (!step.start) usage(step.subagent, 3200, 900, 14000, 2600);
      if (!step.start) flush();
      send({
        hook_event_name: step.start ? "SubagentStart" : "SubagentStop",
        agent_id: step.subagent,
        agent_type: step.type,
        ...(step.start
          ? {}
          : { agent_transcript_path: join(opts.transcripts, `${id}-${step.subagent}.jsonl`) }),
      });
      continue;
    }
    const toolUseId = `toolu_${id}_${n++}`;
    const agent = step.agent;
    usage(
      agent ?? "main",
      1800 + n * 120,
      260 + (n % 4) * 180,
      22000 + n * 1500 - compacted,
      n % 5 === 0 ? 4200 : 0,
    );
    const common = {
      tool_name: step.tool,
      tool_input: step.input,
      tool_use_id: toolUseId,
      ...(agent ? { agent_id: agent, agent_type: "Explore" } : {}),
      ...(step.mcp ? { mcp_server: step.mcp } : {}),
    };
    send({ hook_event_name: "PreToolUse", ...common });
    t += (step.secs ?? 2) * 1000;
    send({
      hook_event_name: step.fail ? "PostToolUseFailure" : "PostToolUse",
      ...common,
      ...(step.fail ? { error: step.output } : { tool_response: step.output ?? { success: true } }),
    });
  }
  usage("main", 2400, 1100, 61000 - compacted, 0);
  t += 3000;
  send({
    hook_event_name: "Stop",
    ...(opts.reply ? { last_assistant_message: opts.reply } : {}),
  });
  if (opts.end) {
    t += 1000;
    send({ hook_event_name: "SessionEnd", reason: "exit" });
  }
}

/** An OpenCode or Pi file input as stored: the agent's `path`, plus the `file_path` its adapter adds. */
const ocPath = (path: string) => ({ path, file_path: path });

export function seedDemo(store: Store) {
  const base = join(home(), "demo");
  const root = join(base, "shop");
  if (store.events("demo-refunds").length && existsSync(join(root, ".git"))) return;
  const transcripts = join(base, "transcripts");
  buildRepo(root);
  mkdirSync(transcripts, { recursive: true });
  const p = (rel: string) => join(root, rel);
  const now = Date.now();
  // One service added by hand, as a user would through the Infra lens. Synthetic, no connection.
  if (!loadManual(store, projectId(root)).length) {
    saveManual(store, projectId(root), [
      {
        id: "m-00000001",
        of: null,
        name: "Product images",
        kind: "external",
        provider: "aws",
        url: "https://console.aws.amazon.com/s3/",
        sourceDir: "apps/web",
      },
    ]);
  }

  record(store, {
    id: "demo-rounding",
    reply:
      "Fixed the rounding in `formatTotal`: totals are now rounded once, after summing, instead of per line. Added a test for three items at $0.10 that used to show $0.29. All checkout tests pass.",
    root,
    branch: "main",
    start: now - 2 * 86_400_000,
    end: true,
    transcripts,
    steps: [
      {
        prompt:
          "Order totals are off by a cent when a discount applies. Find the bug and fix it with a test.",
      },
      {
        tool: "Grep",
        input: { pattern: "function total", path: "apps/api" },
        output: "apps/api/src/services/order.ts",
      },
      { tool: "Read", input: { file_path: p("apps/api/src/services/order.ts") } },
      { tool: "Read", input: { file_path: p("apps/api/src/routes/orders.test.ts") } },
      {
        tool: "Bash",
        input: { command: "pnpm --filter orders-api test" },
        fail: true,
        output: "✖ totals round to cents\n  expected 53.97, got 53.973000000000006",
        secs: 9,
      },
      {
        tool: "Edit",
        input: {
          file_path: p("apps/api/src/services/order.ts"),
          old_string:
            "  return items.reduce((sum, i) => sum + i.price * i.qty * (1 - i.discount), 0);",
          new_string:
            "  const cents = items.reduce((sum, i) => sum + Math.round(i.price * 100) * i.qty * (1 - i.discount), 0);\n  return Math.round(cents) / 100;",
        },
      },
      {
        tool: "Bash",
        input: { command: "pnpm --filter orders-api test" },
        output: { stdout: "✔ totals round to cents\nℹ pass 1\nℹ fail 0", stderr: "" },
        secs: 8,
      },
      {
        tool: "Bash",
        input: { command: 'git commit -am "Fix rounding in order totals"' },
        output: { stdout: "[main 3f2a1c9] Fix rounding in order totals", stderr: "" },
      },
    ],
  });

  record(store, {
    id: "demo-refunds",
    root,
    branch: "feature/refunds",
    start: now - 95 * 60_000,
    end: true,
    transcripts,
    steps: [
      {
        hook: {
          hook_event_name: "InstructionsLoaded",
          file_path: p("CLAUDE.md"),
          memory_type: "Project",
          load_reason: "session_start",
        },
      },
      {
        hook: {
          hook_event_name: "InstructionsLoaded",
          file_path: "/home/you/.claude/CLAUDE.md",
          memory_type: "User",
          load_reason: "session_start",
        },
      },
      {
        hook: {
          hook_event_name: "UserPromptExpansion",
          expansion_type: "slash_command",
          command_name: "plan",
          command_args: "refunds",
          command_source: "project",
          prompt: "/plan refunds",
        },
      },
      {
        prompt:
          "Add refunds: POST /orders/:id/refunds should refund through Stripe, record it in the database and email the customer. Add tests.",
      },
      { tool: "Read", input: { file_path: p("apps/api/src/routes/orders.ts") } },
      { tool: "Read", input: { file_path: p("apps/api/src/services/payments.ts") } },
      { tool: "Read", input: { file_path: p("apps/api/src/db/schema.sql") } },
      {
        tool: "Skill",
        input: { skill: "api-conventions" },
        output: "Loaded skill api-conventions",
      },
      {
        tool: "mcp__stripe__search_documentation",
        input: { query: "refund a payment intent" },
        mcp: { name: "stripe", source: "user" },
        fail: true,
        output: "MCP error -32001: Request timed out",
        secs: 30,
      },
      {
        tool: "mcp__stripe__search_documentation",
        input: { query: "refund a payment intent" },
        mcp: { name: "stripe", source: "user" },
        output: "stripe.refunds.create({ payment_intent }) refunds the full amount by default.",
        secs: 3,
      },
      {
        tool: "mcp__stripe__get_api_reference",
        input: { object: "refund" },
        mcp: { name: "stripe", source: "user" },
        output: "Refund object: id, amount, payment_intent, status, reason…",
      },
      {
        tool: "Task",
        input: {
          description: "Find how customer emails are sent",
          subagent_type: "Explore",
          prompt: "How does the worker send receipt emails?",
        },
        output:
          "Receipts are sent by apps/worker/src/jobs/send-receipt.ts through Resend, queued on the BullMQ 'receipts' queue.",
        secs: 20,
      },
      { subagent: "agent-email", type: "Explore", start: true },
      {
        tool: "Glob",
        input: { pattern: "apps/worker/**/*.ts" },
        agent: "agent-email",
        output: "apps/worker/src/index.ts\napps/worker/src/jobs/send-receipt.ts",
      },
      { tool: "Read", input: { file_path: p("apps/worker/src/index.ts") }, agent: "agent-email" },
      {
        tool: "Read",
        input: { file_path: p("apps/worker/src/jobs/send-receipt.ts") },
        agent: "agent-email",
      },
      { subagent: "agent-email", type: "Explore", start: false },
      { hook: { hook_event_name: "PreCompact", trigger: "auto" } },
      { hook: { hook_event_name: "PostCompact", trigger: "auto" } },
      {
        hook: {
          hook_event_name: "InstructionsLoaded",
          file_path: p("CLAUDE.md"),
          memory_type: "Project",
          load_reason: "compact",
        },
      },
      {
        tool: "Edit",
        input: {
          file_path: p("apps/api/src/db/schema.sql"),
          old_string: "alter table orders add column payment_intent text;\n",
          new_string:
            "alter table orders add column payment_intent text;\n\ncreate table refunds (\n  id serial primary key,\n  order_id int references orders(id),\n  stripe_id text not null,\n  created_at timestamptz default now()\n);\n",
        },
      },
      {
        tool: "Edit",
        input: {
          file_path: p("apps/api/src/services/payments.ts"),
          old_string:
            '  return stripe.paymentIntents.create({ amount: Math.round(amount * 100), currency: "usd" });\n}\n',
          new_string:
            '  return stripe.paymentIntents.create({ amount: Math.round(amount * 100), currency: "usd" });\n}\n\nexport async function refund(paymentIntent: string) {\n  return stripe.refunds.create({ payment_intent: paymentIntent });\n}\n',
        },
      },
      {
        tool: "Write",
        input: {
          file_path: p("apps/api/src/queue.ts"),
          content:
            'import { Queue } from "bullmq";\n\nexport const queue = new Queue("receipts", { connection: { url: process.env.REDIS_URL } });\n',
        },
      },
      {
        tool: "Write",
        input: { file_path: p("apps/api/src/routes/refunds.ts"), content: REFUNDS_ROUTE },
      },
      {
        tool: "Edit",
        input: {
          file_path: p("apps/api/src/index.ts"),
          old_string: 'app.route("/orders", orders);',
          new_string: 'app.route("/orders", orders);\napp.route("/orders", refunds);',
        },
      },
      {
        tool: "Write",
        input: {
          file_path: p("apps/api/src/routes/refunds.test.ts"),
          content: 'test("unknown order is a 404", …)',
        },
      },
      {
        tool: "Bash",
        input: { command: "pnpm --filter orders-api test" },
        fail: true,
        output:
          "✖ unknown order is a 404\n  ReferenceError: refunds is not defined\n    at apps/api/src/index.ts:6",
        secs: 11,
      },
      {
        tool: "Edit",
        input: {
          file_path: p("apps/api/src/index.ts"),
          old_string: 'import { orders } from "./routes/orders";',
          new_string:
            'import { orders } from "./routes/orders";\nimport { refunds } from "./routes/refunds";',
        },
      },
      {
        tool: "Bash",
        input: { command: "pnpm --filter orders-api test" },
        output: {
          stdout: "✔ totals round to cents\n✔ unknown order is a 404\nℹ pass 2\nℹ fail 0",
          stderr: "",
        },
        secs: 10,
      },
      {
        tool: "Write",
        input: {
          file_path: p("apps/worker/src/jobs/send-refund-email.ts"),
          content: "export async function sendRefundEmail(…)",
        },
      },
      { prompt: "Also add a refund button on the orders page." },
      { tool: "Read", input: { file_path: p("apps/web/app/orders/page.tsx") } },
      { tool: "Read", input: { file_path: p("apps/web/components/order-row.tsx") } },
      {
        tool: "Edit",
        input: {
          file_path: p("apps/web/components/order-row.tsx"),
          old_string: "      <td>{order.total}</td>\n",
          new_string: `      <td>{order.total}</td>\n      <td>\n        <form action={\`/api/orders/\${order.id}/refunds\`} method="post">\n          <button type="submit">Refund</button>\n        </form>\n      </td>\n`,
        },
      },
      {
        tool: "Bash",
        input: { command: "pnpm --filter storefront typecheck" },
        output: { stdout: "", stderr: "" },
        secs: 14,
      },
    ],
  });

  // Synthetic sessions from the other supported agents, in the shape their adapters produce.
  record(store, {
    id: "demo-codex-search",
    root,
    branch: "feature/search",
    start: now - 26 * 3_600_000,
    end: true,
    transcripts,
    agent: { kind: "codex", version: "0.163.0", model: "gpt-5.3-codex" },
    steps: [
      { prompt: "Wire the search box into the product grid so it filters by name." },
      {
        tool: "shell",
        input: { command: ["bash", "-lc", 'rg -n "ProductGrid" apps/web'] },
        output: "apps/web/app/page.tsx:1\napps/web/components/product-grid.tsx:1",
      },
      { tool: "shell", input: { command: ["bash", "-lc", "cat apps/web/components/search.tsx"] } },
      {
        tool: "apply_patch",
        input: {
          input:
            '*** Begin Patch\n*** Update File: apps/web/components/product-grid.tsx\n@@\n-export function ProductGrid() {\n-  return <section className="grid" />;\n+export function ProductGrid({ query = "" }: { query?: string }) {\n+  return <section className="grid" data-query={query} />;\n*** End Patch',
        },
      },
      {
        tool: "apply_patch",
        input: {
          input:
            "*** Begin Patch\n*** Update File: apps/web/app/page.tsx\n@@\n-  return <ProductGrid />;\n+  return (\n+    <>\n+      <Search />\n+      <ProductGrid />\n+    </>\n+  );\n*** End Patch",
        },
      },
      {
        tool: "shell",
        input: { command: ["bash", "-lc", "pnpm --filter storefront typecheck"] },
        fail: true,
        output: "app/page.tsx:5:8 - error TS2304: Cannot find name 'Search'.",
        secs: 12,
      },
      // A short synthetic loop: the same typecheck fails again before the real fix.
      {
        tool: "apply_patch",
        input: {
          input:
            '*** Begin Patch\n*** Update File: apps/web/app/page.tsx\n@@\n-      <Search />\n+      <Search query="" />\n*** End Patch',
        },
      },
      {
        tool: "shell",
        input: { command: ["bash", "-lc", "pnpm --filter storefront typecheck"] },
        fail: true,
        output: "app/page.tsx:5:8 - error TS2304: Cannot find name 'Search'.",
        secs: 11,
      },
      {
        tool: "apply_patch",
        input: {
          input:
            '*** Begin Patch\n*** Update File: apps/web/app/page.tsx\n@@\n-      <Search query="" />\n+      <Search />\n*** End Patch',
        },
      },
      {
        tool: "shell",
        input: { command: ["bash", "-lc", "pnpm --filter storefront typecheck"] },
        fail: true,
        output: "app/page.tsx:5:8 - error TS2304: Cannot find name 'Search'.",
        secs: 12,
      },
      {
        tool: "apply_patch",
        input: {
          input:
            '*** Begin Patch\n*** Update File: apps/web/app/page.tsx\n@@\n import { ProductGrid } from "../components/product-grid";\n+import { Search } from "../components/search";\n*** End Patch',
        },
      },
      {
        tool: "shell",
        input: { command: ["bash", "-lc", "pnpm --filter storefront typecheck"] },
        output: { stdout: "", stderr: "" },
        secs: 11,
      },
    ],
  });

  record(store, {
    id: "demo-opencode-docs",
    reply:
      "Documented the six environment variables the API reads in `docs/env.md`, with defaults and which ones are required in production. `DATABASE_URL` and `JWT_SECRET` have no default, so the API refuses to start without them.",
    root,
    branch: "main",
    start: now - 6 * 3_600_000,
    end: true,
    transcripts,
    agent: { kind: "opencode", version: "2.0.32", model: "claude-sonnet-4-5" },
    steps: [
      { prompt: "Document the environment variables the API needs." },
      { tool: "grep", input: { pattern: "process.env", path: "apps/api" } },
      { tool: "read", input: ocPath(p("apps/api/src/db/client.ts")) },
      { tool: "read", input: ocPath(p("apps/api/src/services/payments.ts")) },
      {
        tool: "write",
        input: {
          ...ocPath(p("apps/api/.env.example")),
          content: "DATABASE_URL=\nSTRIPE_KEY=\nREDIS_URL=redis://localhost:6379\n",
        },
      },
    ],
  });

  record(store, {
    id: "demo-pi-pool",
    root,
    branch: "main",
    start: now - 4 * 3_600_000,
    end: true,
    transcripts,
    agent: { kind: "pi", version: "0.75.3", model: "claude-sonnet-4-5" },
    steps: [
      { prompt: "Make the database pool size configurable." },
      { tool: "grep", input: { pattern: "max:", path: p("apps/api/src") } },
      { tool: "read", input: ocPath(p("apps/api/src/db/client.ts")) },
      {
        tool: "edit",
        input: {
          ...ocPath(p("apps/api/src/db/client.ts")),
          old_string: "max: 10,\n",
          new_string: "max: Number(process.env.DB_POOL_MAX ?? 10),\n",
        },
      },
      {
        tool: "bash",
        input: { command: "pnpm --filter api typecheck" },
        output: "Done in 6.1s",
        secs: 7,
      },
    ],
  });

  // A live Codex session in the webhooks worktree that edits the files the refunds session edited.
  const w = (rel: string) => join(webhooksTree(root), rel);
  record(store, {
    id: "demo-codex-webhooks",
    root: webhooksTree(root),
    branch: "feature/webhooks",
    start: now - 5 * 60_000,
    end: false,
    transcripts,
    agent: { kind: "codex", version: "0.163.0", model: "gpt-5.3-codex" },
    steps: [
      { prompt: "Handle Stripe refund webhooks: mark the order refunded when Stripe confirms." },
      {
        tool: "shell",
        input: { command: ["bash", "-lc", `cat ${w("apps/api/src/db/schema.sql")}`] },
      },
      {
        tool: "apply_patch",
        input: {
          input:
            "*** Begin Patch\n*** Update File: apps/api/src/db/schema.sql\n@@\n+alter table orders add column refunded_at timestamptz;\n*** End Patch",
        },
      },
      {
        tool: "apply_patch",
        input: {
          input:
            "*** Begin Patch\n*** Update File: apps/api/src/services/payments.ts\n@@\n+export function onRefundSucceeded(event: { data: { object: { payment_intent: string } } }) {\n+  return event.data.object.payment_intent;\n+}\n*** End Patch",
        },
      },
      {
        tool: "shell",
        input: { command: ["bash", "-lc", "pnpm --filter orders-api test"] },
        output: "✔ webhook marks the order refunded\nℹ pass 1\nℹ fail 0",
        secs: 7,
      },
    ],
  });

  record(store, {
    id: "demo-worker",
    reply:
      "Failed email jobs are retried by BullMQ with its default settings: 3 attempts with exponential backoff starting at 1 second. After the third failure the job moves to the failed set and nothing alerts on it. I did not change anything.",
    root,
    branch: "feature/refunds",
    start: now - 3 * 60_000,
    end: false,
    transcripts,
    steps: [
      { prompt: "How does the worker retry failed email jobs? Don't change anything yet." },
      { tool: "Read", input: { file_path: p("apps/worker/src/index.ts") } },
      { tool: "Grep", input: { pattern: "attempts|backoff", path: "apps" }, output: "No matches" },
      {
        tool: "WebSearch",
        input: { query: "bullmq default retry attempts" },
        output: "BullMQ does not retry by default; set attempts and backoff per job.",
      },
    ],
  });
}
