import assert from "node:assert/strict";
import { test } from "node:test";
import { detectInfra } from "../server/infra.ts";
import { addManual, mergeManual, validateManual } from "../server/manual.ts";
import type { InfraMap, Service } from "../shared/model.ts";
import { providers } from "../web/src/lenses/infra/split.ts";

const detected: Service = {
  id: "vercel:web",
  name: "web",
  kind: "web",
  platform: "vercel",
  sourceDir: "apps/web",
  ports: [],
  basis: "derived",
  evidence: "apps/web/vercel.json",
  metrics: null,
  url: null,
  manual: null,
};
const map: InfraMap = { services: [detected], links: [] };

test("validation accepts http(s) dashboard links only and keeps folders inside the repo", () => {
  const ok = validateManual({
    name: " Web ",
    kind: "web",
    provider: "vercel",
    url: "https://x.dev/a",
  });
  assert.equal(ok.name, "Web");
  assert.equal(ok.url, "https://x.dev/a");
  assert.match(ok.id, /^m-[0-9a-f]{8}$/);
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://x",
    "not a url",
    "https://u:p@x.dev",
  ])
    assert.throws(() => validateManual({ name: "a", kind: "web", provider: "x", url }), url);
  assert.throws(() => validateManual({ name: "", kind: "web", provider: "x" }));
  assert.throws(() => validateManual({ name: "a", kind: "pipeline", provider: "x" }));
  assert.throws(() => validateManual({ name: "a".repeat(81), kind: "web", provider: "x" }));
  assert.throws(() =>
    validateManual({ name: "a", kind: "web", provider: "x", sourceDir: "../up" }),
  );
  assert.equal(
    validateManual({ name: "a", kind: "web", provider: "x", sourceDir: "./apps/web/" }).sourceDir,
    "apps/web",
  );
});

test("a new entry becomes its own card without metrics; an entry for a detected service renames and links it", () => {
  const added = validateManual({ name: "Images", kind: "external", provider: "aws", url: null });
  const link = validateManual({
    name: "Production",
    kind: "web",
    provider: "vercel",
    url: "https://v.dev",
    of: "vercel:web",
  });
  const merged = mergeManual(map, [added, link]);
  const own = merged.services.find((s) => s.manual === added.id);
  assert.equal(own?.id, `manual:${added.id}`);
  assert.equal(own?.platform, "aws");
  assert.equal(own?.metrics, null);
  const web = merged.services.find((s) => s.id === "vercel:web");
  assert.equal(web?.name, "Production");
  assert.equal(web?.url, "https://v.dev/");
  assert.equal(web?.evidence, "apps/web/vercel.json");
  assert.equal(detected.name, "web", "the detected map is not mutated");
});

test("a detected service gets at most one entry", () => {
  const a = validateManual({ name: "A", kind: "web", provider: "vercel", of: "vercel:web" });
  const b = validateManual({ name: "B", kind: "web", provider: "vercel", of: "vercel:web" });
  assert.throws(() => addManual([a], b));
});

test("providers list services added by hand, including free-text hosts", () => {
  const merged = mergeManual(map, [
    validateManual({ name: "Images", kind: "external", provider: "aws" }),
    validateManual({ name: "Box", kind: "container", provider: "Hetzner" }),
  ]);
  const list = providers(merged);
  assert.deepEqual(list.find((p) => p.id === "aws")?.added, ["Images"]);
  assert.deepEqual(list.find((p) => p.id === "Hetzner")?.added, ["Box"]);
  assert.deepEqual(list.find((p) => p.id === "vercel")?.seenIn, ["apps/web/vercel.json"]);
});

test("more provider packages are detected from package.json and cite their file", () => {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({
      dependencies: {
        "@aws-sdk/client-dynamodb": "1",
        "@aws-sdk/client-sqs": "1",
        "@azure/storage-blob": "1",
        "@azure/cosmos": "1",
        "@google-cloud/storage": "1",
        "firebase-admin": "1",
        "@planetscale/database": "1",
        "@vercel/blob": "1",
      },
    }),
  };
  const infra = detectInfra({ list: Object.keys(files), read: (p) => files[p] ?? null });
  const ids = infra.services.map((s) => s.id);
  for (const id of [
    "dynamodb",
    "sqs",
    "azure-blob",
    "cosmos",
    "gcs",
    "firebase",
    "planetscale",
    "vercel-blob",
  ])
    assert.ok(ids.includes(`dep:${id}`), id);
  assert.ok(infra.services.every((s) => s.evidence.startsWith("package.json")));
  const names = providers(infra)
    .filter((p) => p.seenIn.length)
    .map((p) => p.id);
  for (const p of ["aws", "azure", "google-cloud", "firebase", "planetscale", "vercel"])
    assert.ok(names.includes(p), p);
});

test("a deploy step to a host no file declares adds an inferred target", () => {
  const files: Record<string, string> = {
    ".github/workflows/deploy.yml":
      "name: Deploy\njobs:\n  d:\n    steps:\n      - run: gcloud run deploy api --source .\n",
  };
  const infra = detectInfra({ list: Object.keys(files), read: (p) => files[p] ?? null });
  const target = infra.services.find((s) => s.id === "deploy:google-cloud");
  assert.equal(target?.basis, "inferred");
  assert.equal(target?.evidence, ".github/workflows/deploy.yml");
  assert.ok(
    infra.links.some(
      (l) => l.from === "ci:deploy.yml" && l.to === "deploy:google-cloud" && l.kind === "deploys",
    ),
  );
});
