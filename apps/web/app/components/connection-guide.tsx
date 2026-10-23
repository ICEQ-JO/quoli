"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui-icon";

/** Inert instructions; connecting and capture consent stay in the user's terminal. */
export function ConnectionGuide({ empty = false }: { empty?: boolean }) {
  const [installation, setInstallation] = useState("source");
  const [code, setCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const command = `${installation === "source" ? "pnpm" : "quoli"} connect /path/to/repository${code ? " --capture-code" : ""}`;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function resetFeedback() {
    setCopied(false);
    setFailed(false);
    if (timer.current) clearTimeout(timer.current);
  }
  return (
    <details className="connection-guide" open={empty || undefined}>
      <summary>
        <Icon name="branch" size={16} />
        Connect a repository
        <Icon name="arrow" size={13} />
      </summary>
      <div className="connection-guide-body">
        <div>
          <h2>Bring your own changes into view.</h2>
          <p>
            Connect one local Git repository per project. Repository history works with any editor
            or agent. Detailed Claude Code activity is a separate, explicit connection.
          </p>
          <a
            className="text-button"
            href="https://github.com/ICEQ-JO/quoli/blob/main/docs/local-setup.md"
          >
            Local setup guide <Icon name="arrow-right" size={14} />
          </a>
        </div>
        <div className="connection-command">
          <label className="connection-installation">
            How you run Quoli
            <select
              aria-label="Quoli installation"
              value={installation}
              onChange={(e) => {
                setInstallation(e.target.value);
                resetFeedback();
              }}
            >
              <option value="source">Source checkout</option>
              <option value="installed">Installed CLI</option>
            </select>
          </label>
          <label className="connection-consent">
            <input
              type="checkbox"
              checked={code}
              onChange={(e) => {
                setCode(e.target.checked);
                resetFeedback();
              }}
            />
            <span>
              Include file contents in future captures
              <small>Off by default. Untracked files require separate consent.</small>
            </span>
          </label>
          <div className="connection-code">
            <code>{command}</code>
            <button
              type="button"
              className="icon-button"
              aria-label="Copy connection command"
              onClick={async () => {
                resetFeedback();
                try {
                  await navigator.clipboard.writeText(command);
                  setCopied(true);
                } catch {
                  setFailed(true);
                }
                timer.current = setTimeout(resetFeedback, 4000);
              }}
            >
              <Icon name={copied ? "check" : "copy"} size={15} />
            </button>
          </div>
          <p role="status">
            {failed
              ? "Couldn’t copy. Select the command to copy it manually."
              : copied
                ? "Command copied. Run it in your terminal when ready."
                : installation === "source"
                  ? "Run from the Quoli checkout while pnpm dev or pnpm demo is running."
                  : "Run with the installed local CLI. It starts the managed runtime if needed."}
          </p>
        </div>
      </div>
    </details>
  );
}
