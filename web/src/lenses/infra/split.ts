import type { InfraMap, Service } from "../../../../shared/model.ts";
import { PROVIDERS } from "../../../../shared/providers.ts";

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
  /** Repository files that mention this provider; empty when none do. */
  seenIn: string[];
  /** Names of services the user added by hand on this provider. */
  added: string[];
}

/**
 * Hosted providers, with the files that mention them and the services added by hand. None is
 * connected: provider connections (live status and metrics) are roadmap phase 4. Providers typed
 * as free text by the user are listed after the known ones.
 */
export function providers(infra: InfraMap): Provider[] {
  const known = PROVIDERS.map((p) => {
    const hits = infra.services.filter(
      (s) => p.match.test(s.platform) || [p.id, ...p.deps].some((d) => s.id === `dep:${d}`),
    );
    return {
      id: p.id,
      name: p.name,
      seenIn: [...new Set(hits.filter((s) => !isAdded(s)).map((s) => s.evidence))],
      added: hits.filter(isAdded).map((s) => s.name),
    };
  });
  const other = new Map<string, Provider>();
  for (const s of infra.services) {
    if (!isAdded(s) || PROVIDERS.some((p) => p.match.test(s.platform))) continue;
    const entry = other.get(s.platform) ?? {
      id: s.platform,
      name: s.platform,
      seenIn: [],
      added: [],
    };
    entry.added.push(s.name);
    other.set(s.platform, entry);
  }
  const used = (p: Provider) => Number(p.seenIn.length + p.added.length > 0);
  return [...known, ...other.values()].sort((a, b) => used(b) - used(a));
}

/** A card the user added from scratch (not a detected service they renamed or linked). */
export const isAdded = (s: Service) => s.manual !== null && s.id.startsWith("manual:");
