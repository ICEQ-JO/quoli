import type { InfraMap } from "../../../../shared/model.ts";
import { isAdded } from "./split.ts";

/** Files Quoli reads to find services. Keep in step with server/infra.ts. */
export const INFRA_FILES = [
  "docker-compose.yml",
  "Dockerfile",
  "vercel.json",
  "netlify.toml",
  "railway.json / railway.toml",
  "fly.toml",
  "wrangler.toml",
  "serverless.yml",
  "render.yaml",
  "*.tf",
  ".github/workflows/*.yml",
  "package.json (dependencies)",
];

/** Shown beside the board when few or no services were detected. */
export function InfraGuide({ infra }: { infra: InfraMap }) {
  // Pipelines are listed beside the board, not here.
  const services = infra.services.filter((s) => s.kind !== "pipeline");
  const n = services.length;
  return (
    <aside className="infra-guide" aria-label="What Quoli detected">
      <section>
        <h3>{n === 0 ? "No running services found" : `Detected (${n})`}</h3>
        {n === 0 ? (
          <p>
            No services detected in repository files yet. Quoli reads config like compose,
            Dockerfiles, Vercel, Fly, Railway, Render, Terraform, and GitHub Actions. You can also
            add a service by hand.
          </p>
        ) : (
          <ul>
            {services.map((s) => (
              <li key={s.id}>
                <span className="guide-name">{s.name}</span>{" "}
                <span className="guide-kind">
                  · {s.kind} · {isAdded(s) ? "added by you" : s.basis}
                </span>
                {!isAdded(s) && (
                  <span className="guide-file" title={s.evidence}>
                    from {s.evidence}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>Files Quoli reads</h3>
        <ul className="guide-files">
          {INFRA_FILES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Get more on the board</h3>
        <p>
          Add one of these files to the repository, for example a <code>docker-compose.yml</code> or
          a deploy config such as <code>vercel.json</code> or <code>fly.toml</code>. Quoli rescans
          when the files change. It never invents services that no file declares.
        </p>
      </section>
    </aside>
  );
}
