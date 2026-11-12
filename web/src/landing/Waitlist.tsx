import { type FormEvent, useId, useState } from "react";
import { Arrow, Mark } from "./ui.tsx";
export function Waitlist({ location }: { location: "hero" | "footer" }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(12_000),
      });
      const result = (await response.json()) as { error?: string; saved?: boolean };
      if (!response.ok || result.saved !== true)
        throw new Error(result.error || "We couldn't save your email. Please try again.");
      setState("saved");
      setMessage("Your email is saved for launch updates.");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error && error.name !== "TimeoutError"
          ? error.message
          : "That took too long. Please try again.",
      );
    }
  }
  return (
    <div className={`signup signup-${location}`}>
      {state === "saved" ? (
        <div className="signup-success" role="status">
          <span className="success-icon">
            <Mark small />
          </span>
          <div>
            <strong>You're on the list.</strong>
            <p>{message}</p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor={id}>
            Email address
          </label>
          <div className="signup-controls">
            <input
              id={id}
              type="email"
              name="email"
              placeholder="Your email address"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={`${id}-note${state === "error" ? ` ${id}-error` : ""}`}
              aria-invalid={state === "error" || undefined}
              disabled={state === "saving"}
            />
            <button className="button" type="submit" disabled={state === "saving"}>
              {state === "saving" ? "Saving…" : "Join the waitlist"}
              <Arrow />
            </button>
          </div>
          {state === "error" && (
            <p className="form-error" id={`${id}-error`} role="alert">
              {message}
            </p>
          )}
          <p className="signup-note" id={`${id}-note`}>
            Launch updates only. Your email is stored by Quoli.
            <br className="mobile-break" /> No tracking.{" "}
            <a href="/landing/?page=privacy">
              How we handle it <span aria-hidden="true">↗</span>
            </a>
          </p>
        </form>
      )}
    </div>
  );
}
