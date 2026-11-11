import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join, normalize } from "node:path";
import { parse } from "yaml";
import type { InfraMap, Link, Service, ServiceKind, ServiceMetrics } from "../shared/model.ts";
import { git } from "./ingest.ts";

type Files = { list: string[]; read: (path: string) => string | null };

const IMAGE_KINDS: [RegExp, ServiceKind][] = [
  [/postgres|mysql|mariadb|mongo|cockroach|clickhouse/, "database"],
  [/redis|valkey|memcached/, "cache"],
  [/rabbitmq|kafka|nats|redpanda/, "queue"],
  [/nginx|caddy|traefik/, "web"],
];

const DEPENDENCIES: { match: RegExp; id: string; name: string; kind: ServiceKind }[] = [
  {
    match: /^(pg|postgres|@neondatabase\/serverless|drizzle-orm\/pg)$/,
    id: "postgres",
    name: "Postgres",
    kind: "database",
  },
  { match: /^(mysql2?)$/, id: "mysql", name: "MySQL", kind: "database" },
  { match: /^(mongoose|mongodb)$/, id: "mongodb", name: "MongoDB", kind: "database" },
  {
    match: /^(redis|ioredis|@upstash\/redis|bullmq|bull)$/,
    id: "redis",
    name: "Redis",
    kind: "cache",
  },
  { match: /^stripe$/, id: "stripe", name: "Stripe", kind: "external" },
  { match: /^@supabase\/supabase-js$/, id: "supabase", name: "Supabase", kind: "external" },
  { match: /^@anthropic-ai\/sdk$/, id: "anthropic", name: "Anthropic API", kind: "external" },
  { match: /^openai$/, id: "openai", name: "OpenAI API", kind: "external" },
  {
    match: /^(resend|@sendgrid\/mail|nodemailer)$/,
    id: "email",
    name: "Email provider",
    kind: "external",
  },
  { match: /^@aws-sdk\/client-s3$/, id: "s3", name: "S3 storage", kind: "external" },
];

const TF_KINDS: [RegExp, ServiceKind][] = [
  [/db_instance|rds|sql_database|_sql_|dynamodb|database/, "database"],
  [/elasticache|redis/, "cache"],
  [/sqs|sns|pubsub|queue/, "queue"],
  [/lambda|function/, "function"],
  [/ecs|container|cloud_run|app_service|instance$/, "container"],
];

export function infraMap(root: string): InfraMap {
  const list = (git(root, ["ls-files", "-co", "--exclude-standard"]) ?? "")
    .split("\n")
    .filter(Boolean);
  const read = (p: string) => {
    try {
      return readFileSync(join(root, p), "utf8");
    } catch {
      return null;
    }
  };
  const map = detectInfra({ list, read });
  attachDockerMetrics(map.services);
  return map;
}

/** Pure detection over a file listing; exported for tests. */
export function detectInfra({ list, read }: Files): InfraMap {
  const services = new Map<string, Service>();
  const links: Link[] = [];
  const add = (s: Omit<Service, "metrics" | "ports"> & { ports?: string[] }) => {
    if (!services.has(s.id)) services.set(s.id, { ports: [], metrics: null, ...s });
    return services.get(s.id) as Service;
  };
  const link = (from: string, to: string, kind: Link["kind"], basis: Link["basis"]) => {
    if (from !== to && !links.some((l) => l.from === from && l.to === to))
      links.push({ from, to, kind, basis });
  };
  const dirOf = (p: string) => (dirname(p) === "." ? "" : dirname(p));
  const shallow = (p: string) => p.split("/").length <= 3;

  // docker compose
  const composedDirs = new Set<string>();
  for (const file of list.filter(
    (p) => /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(p) && shallow(p),
  )) {
    const doc = safeYaml(read(file));
    const defs = (doc?.services ?? {}) as Record<string, Record<string, unknown>>;
    for (const [name, def] of Object.entries(defs)) {
      const image = typeof def.image === "string" ? def.image : "";
      const build =
        typeof def.build === "string" ? def.build : (def.build as { context?: string })?.context;
      const sourceDir = build ? clean(join(dirOf(file), build)) : null;
      if (sourceDir !== null) composedDirs.add(sourceDir);
      add({
        id: `compose:${name}`,
        name,
        kind:
          IMAGE_KINDS.find(([re]) => re.test(image))?.[1] ??
          (/worker|job|queue/.test(name) ? "worker" : build ? "api" : "container"),
        platform: "docker-compose",
        sourceDir,
        ports: Array.isArray(def.ports) ? def.ports.map(String) : [],
        basis: "derived",
        evidence: file,
      });
      const deps = Array.isArray(def.depends_on)
        ? def.depends_on
        : Object.keys(def.depends_on ?? {});
      for (const d of deps) link(`compose:${name}`, `compose:${d}`, "depends_on", "derived");
    }
  }

  // Dockerfiles not already built by compose
  for (const file of list.filter((p) => /(^|\/)Dockerfile(\.[\w-]+)?$/.test(p) && shallow(p))) {
    const dir = dirOf(file);
    if (composedDirs.has(dir)) continue;
    add({
      id: `docker:${dir || "."}`,
      name: dir ? basename(dir) : "app",
      kind: "container",
      platform: "docker",
      sourceDir: dir,
      basis: "derived",
      evidence: file,
    });
  }

  // hosting platforms
  const platforms: [RegExp, string, ServiceKind, (text: string) => string | null][] = [
    [/(^|\/)vercel\.json$/, "vercel", "web", () => null],
    [/(^|\/)netlify\.toml$/, "netlify", "web", () => null],
    [/(^|\/)railway\.(json|toml)$/, "railway", "api", () => null],
    [/(^|\/)fly\.toml$/, "fly.io", "api", (t) => /^app\s*=\s*["']([^"']+)/m.exec(t)?.[1] ?? null],
    [
      /(^|\/)wrangler\.(toml|jsonc?)$/,
      "cloudflare",
      "function",
      (t) => /^name\s*=\s*["']([^"']+)/m.exec(t)?.[1] ?? null,
    ],
    [
      /(^|\/)serverless\.ya?ml$/,
      "aws-lambda",
      "function",
      (t) => /^service:\s*([\w-]+)/m.exec(t)?.[1] ?? null,
    ],
  ];
  for (const file of list) {
    const hit = platforms.find(([re]) => re.test(file));
    if (!hit || !shallow(file)) continue;
    const [, platform, kind, nameOf] = hit;
    const dir = dirOf(file);
    add({
      id: `${platform}:${dir || "."}`,
      name:
        nameOf(read(file) ?? "") ??
        (dir ? basename(dir) : (packageName(read("package.json")) ?? "app")),
      kind,
      platform,
      sourceDir: dir,
      basis: "derived",
      evidence: file,
    });
  }

  // render.yaml
  for (const file of list.filter((p) => /(^|\/)render\.ya?ml$/.test(p))) {
    for (const s of (safeYaml(read(file))?.services ?? []) as Record<string, string>[]) {
      if (!s?.name) continue;
      add({
        id: `render:${s.name}`,
        name: s.name,
        kind: s.type === "worker" ? "worker" : s.type === "web" ? "web" : "api",
        platform: "render",
        sourceDir: s.rootDir ? clean(s.rootDir) : null,
        basis: "derived",
        evidence: file,
      });
    }
  }

  // terraform
  for (const file of list.filter((p) => p.endsWith(".tf"))) {
    for (const m of (read(file) ?? "").matchAll(/^resource\s+"([\w]+)"\s+"([\w-]+)"/gm)) {
      const kind = TF_KINDS.find(([re]) => re.test(m[1]))?.[1];
      if (!kind) continue;
      add({
        id: `tf:${m[1]}.${m[2]}`,
        name: m[2],
        kind,
        platform: m[1].split("_")[0],
        sourceDir: null,
        basis: "derived",
        evidence: file,
      });
    }
  }

  // apps without a declared host
  for (const file of list.filter((p) => p.endsWith("package.json") && shallow(p))) {
    const pkg = safeJson(read(file));
    const runtime = (pkg?.dependencies ?? {}) as Record<string, string>;
    const deps = { ...runtime, ...((pkg?.devDependencies ?? {}) as Record<string, string>) };
    const dir = dirOf(file);
    const owner = [...services.values()].find((s) => s.sourceDir === dir && s.kind !== "pipeline");
    let appId = owner?.id ?? null;
    if (
      !owner &&
      (deps.next || deps.express || deps.hono || deps.fastify || deps["@nestjs/core"])
    ) {
      appId = `app:${dir || "."}`;
      add({
        id: appId,
        name: (pkg?.name as string) ?? (dir ? basename(dir) : "app"),
        kind: deps.next ? "web" : "api",
        platform: "unknown host",
        sourceDir: dir,
        basis: "inferred",
        evidence: file,
      });
    }
    for (const dep of Object.keys(runtime)) {
      const known = DEPENDENCIES.find((d) => d.match.test(dep));
      if (!known) continue;
      const existing =
        [...services.values()].find(
          (s) => s.kind === known.kind && s.name.toLowerCase().includes(known.id.slice(0, 5)),
        ) ??
        [...services.values()].find(
          (s) => s.kind === known.kind && s.platform === "docker-compose",
        );
      const target =
        existing ??
        add({
          id: `dep:${known.id}`,
          name: known.name,
          kind: known.kind,
          platform: known.kind === "external" ? "third-party" : "unknown host",
          sourceDir: null,
          basis: "inferred",
          evidence: `${file} → ${dep}`,
        });
      if (appId) link(appId, target.id, "calls", "inferred");
    }
  }

  // CI/CD pipelines and what they deploy
  for (const file of list.filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p))) {
    const text = read(file) ?? "";
    const doc = safeYaml(text);
    const id = `ci:${basename(file)}`;
    add({
      id,
      name: typeof doc?.name === "string" ? doc.name : basename(file),
      kind: "pipeline",
      platform: "github-actions",
      sourceDir: null,
      basis: "derived",
      evidence: file,
    });
    const targets: [RegExp, string][] = [
      [/vercel/i, "vercel"],
      [/flyctl|fly deploy|superfly/i, "fly.io"],
      [/railway (up|deploy)|railwayapp/i, "railway"],
      [/wrangler/i, "cloudflare"],
      [/netlify/i, "netlify"],
      [/docker\/build-push-action|docker push/i, "docker"],
      [/serverless deploy/i, "aws-lambda"],
    ];
    for (const [re, platform] of targets) {
      if (!re.test(text)) continue;
      for (const s of services.values()) {
        if (
          s.platform === platform ||
          (platform === "docker" && s.platform === "docker-compose" && s.sourceDir !== null)
        ) {
          link(id, s.id, "deploys", "inferred");
        }
      }
    }
  }

  return {
    services: [...services.values()],
    links: links.filter((l) => services.has(l.from) && services.has(l.to)),
  };
}

/** Live CPU/memory for running containers that belong to compose services. Silent when Docker is absent. */
function attachDockerMetrics(services: Service[]) {
  const compose = services.filter((s) => s.platform === "docker-compose");
  if (!compose.length) return;
  try {
    const run = (args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        timeout: 4000,
        stdio: ["ignore", "pipe", "ignore"],
      });
    const containers = run(["ps", "-a", "--format", "{{json .}}"])
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const stats = new Map<string, Record<string, string>>(
      run(["stats", "--no-stream", "--format", "{{json .}}"])
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .map((s) => [s.ID, s]),
    );
    for (const s of compose) {
      const c = containers.find(
        (c) => /com\.docker\.compose\.service=([^,]+)/.exec(c.Labels ?? "")?.[1] === s.name,
      );
      if (!c) continue;
      const st = [...stats.entries()].find(
        ([id]) => c.ID.startsWith(id) || id.startsWith(c.ID),
      )?.[1];
      const metrics: ServiceMetrics = {
        state: c.State ?? c.Status,
        cpuPercent: st ? Number.parseFloat(st.CPUPerc) : null,
        memoryBytes: st ? parseBytes(st.MemUsage?.split("/")[0] ?? "") : null,
        source: "docker",
      };
      s.metrics = metrics;
    }
  } catch {
    // Docker missing or not running: metrics stay unknown.
  }
}

function parseBytes(v: string): number | null {
  const m = /([\d.]+)\s*([KMG]i?B|B)/.exec(v);
  if (!m) return null;
  const unit =
    { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 }[m[2]] ?? 1;
  return Math.round(Number.parseFloat(m[1]) * unit);
}

const clean = (p: string) => {
  const n = normalize(p).replace(/\/$/, "");
  return n === "." ? "" : n;
};

function safeYaml(text: string | null): Record<string, unknown> | null {
  try {
    return text ? (parse(text) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function safeJson(text: string | null): Record<string, Record<string, string> | string> | null {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

const packageName = (text: string | null) => {
  const n = safeJson(text)?.name;
  return typeof n === "string" ? n : null;
};
