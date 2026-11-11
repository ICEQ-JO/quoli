import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "./db.ts";
import { home } from "./db.ts";
import { ingest } from "./ingest.ts";

/**
 * A synthetic large repository ("monorepo", ~2,400 files, ~560 commits on several
 * branches with merges) plus one recorded session spread across it. Used to check
 * that every lens stays legible at real scale: `pnpm demo --large`.
 * Everything here is generated sample data.
 */

const PACKAGES = [
  "api",
  "web",
  "worker",
  "billing",
  "auth",
  "search",
  "notifications",
  "admin",
  "shared",
  "cli",
  "infra",
  "analytics",
];
const MODULES = ["core", "routes", "services", "models", "utils", "hooks", "components", "jobs"];
const PER_MODULE = 24;

export function largeFiles(): string[] {
  const files = ["README.md", "package.json", "docker-compose.yml", ".github/workflows/ci.yml"];
  for (const pkg of PACKAGES) {
    files.push(`packages/${pkg}/package.json`, `packages/${pkg}/README.md`);
    for (const mod of MODULES) {
      for (let i = 0; i < PER_MODULE; i++) files.push(`packages/${pkg}/src/${mod}/${mod}-${i}.ts`);
      files.push(`packages/${pkg}/test/${mod}.test.ts`);
    }
  }
  return files;
}

function content(path: string, rev: number): string {
  if (path.endsWith("package.json")) {
    const name = path.split("/")[1] ?? "monorepo";
    return `${JSON.stringify({ name, private: true, dependencies: name === "api" ? { pg: "8", ioredis: "5" } : {} }, null, 2)}\n`;
  }
  if (path === "docker-compose.yml") {
    return "services:\n  api:\n    build: ./packages/api\n    depends_on: [db, redis]\n  worker:\n    build: ./packages/worker\n    depends_on: [redis]\n  db:\n    image: postgres:16\n  redis:\n    image: redis:7\n";
  }
  if (path.endsWith(".md")) return `# ${path}\n`;
  if (path.endsWith(".yml"))
    return "name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n";
  const parts = path.split("/");
  const file = parts.at(-1) ?? "";
  const n = Number(/-(\d+)\.ts$/.exec(file)?.[1] ?? 0);
  const neighbour =
    n > 0 ? `import { v${n - 1} } from "./${file.replace(/-\d+\.ts$/, `-${n - 1}`)}";\n` : "";
  return `${neighbour}export const v${n} = ${rev};\n`;
}

/** Builds the repository with git fast-import. Returns the HEAD sha. */
export function buildLargeRepo(root: string): string {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const git = (args: string[], input?: string) =>
    execFileSync("git", args, { cwd: root, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  git(["init", "-q", "-b", "main"]);
  const files = largeFiles();
  let mark = 0;
  let time = Math.floor(Date.now() / 1000) - 120 * 86_400;
  const out: string[] = [];
  const blob = (text: string) => {
    mark++;
    out.push(`blob\nmark :${mark}\ndata ${Buffer.byteLength(text)}\n${text}\n`);
    return mark;
  };
  const commit = (
    ref: string,
    message: string,
    changes: [string, string][],
    from?: number,
    merge?: number,
  ) => {
    const blobs = changes.map(([p, t]) => [p, blob(t)] as const);
    mark++;
    time += 3 * 3600;
    const who = ["Ada", "Lin", "Sam", "Noor"][mark % 4];
    out.push(
      `commit ${ref}\nmark :${mark}\nauthor ${who} <${who.toLowerCase()}@example.com> ${time} +0000\ncommitter ${who} <${who.toLowerCase()}@example.com> ${time} +0000\ndata ${Buffer.byteLength(message)}\n${message}\n` +
        (from ? `from :${from}\n` : "") +
        (merge ? `merge :${merge}\n` : "") +
        blobs.map(([p, m]) => `M 100644 :${m} ${p}\n`).join("") +
        "\n",
    );
    return mark;
  };

  let main = commit(
    "refs/heads/main",
    "Initial monorepo",
    files.map((f) => [f, content(f, 0)]),
  );
  const touch = (i: number) => {
    const f = files[(i * 37) % files.length];
    return [f, content(f, i)] as [string, string];
  };
  let rev = 1;
  for (let i = 0; i < 420; i++)
    main = commit("refs/heads/main", `Update ${touch(rev)[0]}`, [touch(rev++)], main);
  const branches = [
    "feature/search-ranking",
    "feature/billing-retries",
    "fix/auth-timeout",
    "feature/admin-audit",
    "chore/deps",
  ];
  branches.forEach((name, b) => {
    let tip = commit(`refs/heads/${name}`, `Start ${name}`, [touch(rev++)], main);
    for (let i = 0; i < 18 + b * 4; i++)
      tip = commit(`refs/heads/${name}`, `${name}: step ${i + 1}`, [touch(rev++)], tip);
    if (b < 3) main = commit("refs/heads/main", `Merge ${name}`, [touch(rev++)], main, tip);
    for (let i = 0; i < 6; i++)
      main = commit("refs/heads/main", `Update ${touch(rev)[0]}`, [touch(rev++)], main);
  });
  git(["fast-import", "--quiet"], out.join(""));
  git(["checkout", "-q", "-f", "feature/admin-audit"]);
  return git(["rev-parse", "--short", "HEAD"]).trim();
}

export function seedLargeDemo(store: Store) {
  const base = join(home(), "demo");
  const root = join(base, "monorepo");
  if (store.events("demo-large").length) return;
  const head = buildLargeRepo(root);
  const transcripts = join(base, "transcripts");
  mkdirSync(transcripts, { recursive: true });
  const transcript = join(transcripts, "demo-large.jsonl");
  const p = (rel: string) => join(root, rel);
  let t = Date.now() - 40 * 60_000;
  const lines: string[] = [];
  const send = (payload: Record<string, unknown>) => {
    t += 5000;
    writeFileSync(transcript, lines.length ? `${lines.join("\n")}\n` : "");
    ingest(
      store,
      { session_id: "demo-large", cwd: root, transcript_path: transcript, ...payload },
      new Date(t).toISOString(),
    );
  };
  send({ hook_event_name: "SessionStart", source: "startup", quoli_branch: "feature/admin-audit" });
  send({
    hook_event_name: "UserPromptSubmit",
    prompt: "Add an audit log to the admin package and record who changed billing settings.",
  });
  let n = 0;
  const tool = (
    name: string,
    input: Record<string, unknown>,
    response: unknown = { success: true },
  ) => {
    const id = `toolu_large_${n++}`;
    lines.push(
      JSON.stringify({
        type: "assistant",
        timestamp: new Date(t).toISOString(),
        message: {
          id: `msg_large_${n}`,
          model: "claude-sonnet-4-5",
          usage: {
            input_tokens: 2400,
            output_tokens: 300 + (n % 5) * 120,
            cache_read_input_tokens: 40000 + n * 900,
          },
        },
      }),
    );
    send({ hook_event_name: "PreToolUse", tool_name: name, tool_use_id: id, tool_input: input });
    send({
      hook_event_name: "PostToolUse",
      tool_name: name,
      tool_use_id: id,
      tool_input: input,
      tool_response: response,
    });
  };
  for (let i = 0; i < 14; i++)
    tool("Read", {
      file_path: p(`packages/admin/src/${MODULES[i % 8]}/${MODULES[i % 8]}-${i}.ts`),
    });
  tool(
    "Grep",
    { pattern: "billingSettings", path: "packages" },
    "packages/billing/src/services/services-3.ts",
  );
  for (let i = 0; i < 6; i++)
    tool("Read", { file_path: p(`packages/billing/src/services/services-${i}.ts`) });
  for (let i = 0; i < 9; i++) {
    tool("Edit", {
      file_path: p(`packages/admin/src/services/services-${i}.ts`),
      old_string: `export const v${i} = 0;`,
      new_string: `export const v${i} = 0;\nexport const audited${i} = true;`,
    });
  }
  for (let i = 0; i < 3; i++) {
    tool("Edit", {
      file_path: p(`packages/billing/src/routes/routes-${i}.ts`),
      old_string: `export const v${i} = 0;`,
      new_string: `export const v${i} = 0;\nrecordAudit("billing", ${i});`,
    });
  }
  tool("Write", {
    file_path: p("packages/admin/src/models/audit-log.ts"),
    content:
      "export interface AuditEntry {\n  actor: string;\n  action: string;\n  at: string;\n}\n",
  });
  tool(
    "Bash",
    { command: "npm test --workspace packages/admin" },
    { stdout: "✔ 42 passing", stderr: "" },
  );
  tool(
    "Bash",
    { command: `git commit -am "Add admin audit log"` },
    { stdout: `[feature/admin-audit ${head}] Add admin audit log\n 13 files changed`, stderr: "" },
  );
  writeFileSync(transcript, `${lines.join("\n")}\n`);
  send({ hook_event_name: "Stop" });
  send({ hook_event_name: "SessionEnd", reason: "exit" });
}
