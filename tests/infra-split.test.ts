import assert from "node:assert/strict";
import { test } from "node:test";
import type { InfraMap, Service } from "../shared/model.ts";
import { providers, splitInfra } from "../web/src/lenses/infra/split.ts";

const svc = (id: string, kind: Service["kind"], platform: string, evidence: string): Service => ({
  id,
  name: id,
  kind,
  platform,
  sourceDir: null,
  ports: [],
  basis: "derived",
  evidence,
  metrics: null,
});

const infra: InfraMap = {
  services: [
    svc("vercel:web", "web", "vercel", "apps/web/vercel.json"),
    svc("compose:api", "api", "docker-compose", "docker-compose.yml"),
    svc("ci:deploy", "pipeline", "github-actions", ".github/workflows/deploy.yml"),
    svc("ci:pr", "pipeline", "github-actions", ".github/workflows/pr.yml"),
    svc("dep:s3", "external", "third-party", "apps/api/package.json → @aws-sdk/client-s3"),
  ],
  links: [
    { from: "ci:deploy", to: "vercel:web", kind: "deploys", basis: "inferred" },
    { from: "ci:deploy", to: "compose:api", kind: "deploys", basis: "inferred" },
    { from: "compose:api", to: "dep:s3", kind: "calls", basis: "inferred" },
  ],
};

test("a CI workflow is never a running service", () => {
  const { services, pipelines } = splitInfra(infra);
  assert.ok(services.every((s) => s.kind !== "pipeline"));
  assert.deepEqual(
    pipelines.map((p) => p.service.id),
    ["ci:deploy", "ci:pr"],
  );
});

test("a pipeline lists what it deploys; a check-only workflow deploys nothing", () => {
  const { pipelines } = splitInfra(infra);
  assert.deepEqual(
    pipelines[0].deploys.map((s) => s.id),
    ["vercel:web", "compose:api"],
  );
  assert.deepEqual(pipelines[1].deploys, []);
});

test("providers cite the files that mention them, detected ones first", () => {
  const list = providers(infra);
  assert.deepEqual(
    list.slice(0, 2).map((p) => [p.id, p.seenIn]),
    [
      ["vercel", ["apps/web/vercel.json"]],
      ["aws", ["apps/api/package.json → @aws-sdk/client-s3"]],
    ],
  );
  assert.ok(list.slice(2).every((p) => p.seenIn.length === 0));
});

test("an empty repository mentions no provider", () => {
  assert.ok(providers({ services: [], links: [] }).every((p) => p.seenIn.length === 0));
});
