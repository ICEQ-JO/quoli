import { useState } from "react";

export function ProductScreenshot({
  screen,
  dark,
  webp = true,
}: {
  screen: { id: string; name: string; caption: string };
  dark: boolean;
  webp?: boolean;
}) {
  const base = `/landing/product/${screen.id}-${dark ? "dark" : "light"}`;
  // A slow or dropped connection must never leave a broken-image icon: retry once, then say so.
  const [failed, setFailed] = useState<{ key: string; tries: number }>({ key: "", tries: 0 });
  const tries = failed.key === base ? failed.tries : 0;
  const retry = tries === 1 ? "?retry=1" : "";
  return (
    <figure className="tour-window">
      {tries < 2 ? (
        <a href={`${base}.jpg`} target="_blank" rel="noreferrer" className="tour-image">
          <picture key={`${base}${retry}`}>
            {webp && <source srcSet={`${base}.webp${retry}`} type="image/webp" />}
            <img
              src={`${base}.jpg${retry}`}
              width={1600}
              height={1000}
              alt={`The Quoli app, ${screen.name} view, showing a synthetic demo session.`}
              loading="lazy"
              decoding="async"
              onError={() => setFailed({ key: base, tries: tries + 1 })}
            />
          </picture>
          <span className="sr-only"> (opens the full-size screenshot)</span>
        </a>
      ) : (
        <div className="tour-missing" role="status">
          <p>The screenshot didn't load, probably a slow connection.</p>
          <button type="button" onClick={() => setFailed({ key: base, tries: 0 })}>
            Try again
          </button>
        </div>
      )}
      <figcaption>{screen.caption}</figcaption>
    </figure>
  );
}
