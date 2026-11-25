import { useRef, useState } from "react";
import { displayTitle, setDisplayTitle, useTitleVersion } from "../session-titles.ts";
import { useDialog } from "./Dialog.tsx";

type Session = { id: string; title: string };
export function SessionName({ session }: { session: Session }) {
  useTitleVersion();
  return <>{displayTitle(session)}</>;
}

/** The recorded title remains available; an empty name restores it. */
export function RenameSession({ session, close }: { session: Session; close: () => void }) {
  const [value, setValue] = useState(() => displayTitle(session));
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dialog = useDialog(close, input);
  return (
    <div className="modal-backdrop">
      <button
        type="button"
        className="palette-scrim"
        tabIndex={-1}
        aria-label="Cancel rename"
        onClick={close}
      />
      <div
        ref={dialog.ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
        aria-describedby="rename-note"
        onKeyDown={dialog.onKeyDown}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setDisplayTitle(session.id, value);
              close();
            } catch {
              setError("Could not save this name. Check browser storage and try again.");
            }
          }}
        >
          <h2 id="rename-title">Rename session</h2>
          <p id="rename-note">
            This name is saved only in this browser. The recorded prompt and team summaries stay
            unchanged.
          </p>
          <label htmlFor="session-name">Display name</label>
          <input
            ref={input}
            id="session-name"
            className="input"
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
          />
          <details>
            <summary>Recorded title</summary>
            <p className="recorded-title">{session.title}</p>
          </details>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setValue("")}>
              Use recorded title
            </button>
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              Save name
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
