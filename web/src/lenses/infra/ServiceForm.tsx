import { useId, useState } from "react";
import type { Service, ServiceKind } from "../../../../shared/model.ts";
import { PROVIDERS } from "../../../../shared/providers.ts";
import { api } from "../../api.ts";

const KINDS: { id: ServiceKind; label: string }[] = [
  { id: "web", label: "Web app" },
  { id: "api", label: "API" },
  { id: "worker", label: "Worker" },
  { id: "function", label: "Function" },
  { id: "container", label: "Container" },
  { id: "database", label: "Database" },
  { id: "cache", label: "Cache" },
  { id: "queue", label: "Queue" },
  { id: "external", label: "Storage or other service" },
];
const OTHER = "__other";

/**
 * Add a service by hand, or rename and link one Quoli detected. There is deliberately no field
 * for keys or tokens: nothing here connects to the provider.
 *
 * - no `service`: add a new one;
 * - `service` with `manual`: edit that hand-made entry;
 * - `service` without `manual`: create an entry that renames and links a detected service.
 */
export function ServiceForm({
  projectId,
  service,
  onDone,
}: {
  projectId: string;
  service?: Service;
  onDone: (changed: boolean) => void;
}) {
  const uid = useId();
  const detected = !!service && !service.id.startsWith("manual:");
  const known = PROVIDERS.some((p) => p.id === service?.platform);
  const [provider, setProvider] = useState(
    service ? (known ? service.platform : OTHER) : PROVIDERS[0].id,
  );
  const [otherName, setOtherName] = useState(service && !known ? service.platform : "");
  const [name, setName] = useState(service?.name ?? "");
  const [kind, setKind] = useState<ServiceKind>(service?.kind ?? "web");
  const [url, setUrl] = useState(service?.url ?? "");
  const [dir, setDir] = useState(service?.sourceDir ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const entry = {
      name: name.trim(),
      kind,
      provider: provider === OTHER ? otherName.trim() : provider,
      url: url.trim() || null,
      sourceDir: dir.trim() || null,
    };
    try {
      if (service?.manual) await api.updateService(projectId, service.manual, entry);
      else
        await api.addService(projectId, { ...entry, of: detected ? (service?.id ?? null) : null });
      onDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!service?.manual) return;
    setBusy(true);
    try {
      await api.removeService(projectId, service.manual);
      onDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const f = (k: string) => `${uid}-${k}`;
  return (
    <form
      className="svc-form"
      onSubmit={submit}
      aria-label={service ? "Edit service" : "Add a service"}
    >
      {detected && (
        <p className="side-note">
          Quoli found this service in <span className="mono">{service.evidence}</span>. You can
          rename it and add a dashboard link; the file stays the evidence.
        </p>
      )}
      {!detected && (
        <div className="field">
          <label htmlFor={f("provider")}>Where it runs</label>
          <select
            id={f("provider")}
            className="input"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>
          {provider === OTHER && (
            <input
              id={f("other")}
              className="input"
              aria-label="Provider name"
              placeholder="e.g. Hetzner, Sentry, Mux"
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              maxLength={40}
              required
            />
          )}
        </div>
      )}
      <div className="field">
        <label htmlFor={f("name")}>Name</label>
        <input
          id={f("name")}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Production web"
          maxLength={80}
          required
        />
      </div>
      {!detected && (
        <>
          <div className="field">
            <label htmlFor={f("kind")}>What it is</label>
            <select
              id={f("kind")}
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as ServiceKind)}
            >
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={f("dir")}>
              Code it runs <span className="faint">(optional folder)</span>
            </label>
            <input
              id={f("dir")}
              className="input mono"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              placeholder="apps/web"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor={f("url")}>
          Dashboard link <span className="faint">(optional)</span>
        </label>
        <input
          id={f("url")}
          className="input mono"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <p className="side-note">
        Stored on this machine only. No keys and no connection: Quoli shows where it runs, not
        whether it is up.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-foot">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {service ? "Save" : "Add service"}
        </button>
        <button type="button" className="btn sm" onClick={() => onDone(false)} disabled={busy}>
          Cancel
        </button>
        {service?.manual && (
          <button type="button" className="btn sm danger" onClick={remove} disabled={busy}>
            {detected ? "Undo my edits" : "Remove"}
          </button>
        )}
      </div>
    </form>
  );
}
