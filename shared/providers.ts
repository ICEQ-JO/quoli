/**
 * Hosting providers Quoli knows by name. `match` recognises a service's platform, `deps` are the
 * `dep:<id>` services server/infra.ts derives from package dependencies. Nothing here implies a
 * connection: provider connections are roadmap phase 4.
 */
export interface ProviderInfo {
  id: string;
  name: string;
  match: RegExp;
  deps: string[];
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "vercel", name: "Vercel", match: /^vercel$/, deps: ["vercel-blob"] },
  {
    id: "aws",
    name: "AWS (incl. S3, Lambda)",
    match: /^aws/,
    deps: ["s3", "dynamodb", "sqs"],
  },
  { id: "azure", name: "Azure", match: /^azure/, deps: ["azure-blob", "cosmos"] },
  { id: "google-cloud", name: "Google Cloud", match: /^google/, deps: ["gcs"] },
  { id: "supabase", name: "Supabase", match: /^supabase$/, deps: ["supabase"] },
  { id: "firebase", name: "Firebase", match: /^firebase$/, deps: ["firebase"] },
  { id: "cloudflare", name: "Cloudflare", match: /^cloudflare$/, deps: [] },
  { id: "fly.io", name: "Fly.io", match: /^fly\.io$/, deps: [] },
  { id: "railway", name: "Railway", match: /^railway$/, deps: [] },
  { id: "render", name: "Render", match: /^render$/, deps: [] },
  { id: "netlify", name: "Netlify", match: /^netlify$/, deps: [] },
  { id: "neon", name: "Neon", match: /^neon$/, deps: [] },
  { id: "planetscale", name: "PlanetScale", match: /^planetscale$/, deps: ["planetscale"] },
  { id: "upstash", name: "Upstash", match: /^upstash$/, deps: [] },
  { id: "heroku", name: "Heroku", match: /^heroku$/, deps: [] },
  { id: "digitalocean", name: "DigitalOcean", match: /^digitalocean$/, deps: [] },
];
