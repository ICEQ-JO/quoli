import type { InfraMap, Service } from "../../../../shared/model.ts";

export interface Pipeline {
  service: Service;
  /** Services the workflow appears to deploy (inferred from its steps). */
  deploys: Service[];
}

/**
 * Things that run (frontends, services, data, third-party) apart from the checks and pipelines
 * that build and ship them. A CI workflow is never drawn as a running service.
 */
export function splitInfra(infra: InfraMap): { services: Service[]; pipelines: Pipeline[] } {
  const byId = new Map(infra.services.map((s) => [s.id, s]));
  const services = infra.services.filter((s) => s.kind !== "pipeline");
  const pipelines = infra.services
    .filter((s) => s.kind === "pipeline")
    .map((service) => ({
      service,
      deploys: infra.links
        .filter((l) => l.from === service.id && l.kind === "deploys")
        .map((l) => byId.get(l.to))
        .filter((s): s is Service => !!s && s.kind !== "pipeline"),
    }));
  return { services, pipelines };
}

export interface Provider {
  id: string;
  name: string;
  /** Repository files or services that mention this provider; empty when none do. */
  seenIn: string[];
}

/** `deps` are the `dep:<id>` services from server/infra.ts that belong to the provider. */
const PROVIDERS: { id: string; name: string; platforms: RegExp; deps?: string[] }[] = [
  { id: "vercel", name: "Vercel", platforms: /^vercel$/ },
  { id: "aws", name: "AWS (incl. S3, Lambda)", platforms: /^aws/, deps: ["s3"] },
  { id: "azure", name: "Azure", platforms: /^azure/ },
  { id: "gcp", name: "Google Cloud", platforms: /^google/ },
  { id: "supabase", name: "Supabase", platforms: /^supabase$/ },
  { id: "cloudflare", name: "Cloudflare", platforms: /^cloudflare$/ },
  { id: "fly", name: "Fly.io", platforms: /^fly\.io$/ },
  { id: "railway", name: "Railway", platforms: /^railway$/ },
  { id: "render", name: "Render", platforms: /^render$/ },
  { id: "netlify", name: "Netlify", platforms: /^netlify$/ },
];

/**
 * Hosted providers and whether this repository's files mention them. None of them is
 * connected: provider connections (live status and metrics) are roadmap Phase 4.
 */
export function providers(infra: InfraMap): Provider[] {
  return PROVIDERS.map((p) => {
    const hits = infra.services.filter(
      (s) =>
        p.platforms.test(s.platform) || [p.id, ...(p.deps ?? [])].some((d) => s.id === `dep:${d}`),
    );
    return { id: p.id, name: p.name, seenIn: [...new Set(hits.map((s) => s.evidence))] };
  }).sort((a, b) => Number(b.seenIn.length > 0) - Number(a.seenIn.length > 0));
}
