export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none">
      <path
        d={diagonal ? "M5 15 15 5M5 5h10v10" : "M3 10h13M10 4l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
export function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "q-mark small" : "q-mark"}
      aria-hidden="true"
      viewBox="0 0 28 30"
      shapeRendering="crispEdges"
    >
      <path d="M8 0h12v3h4v4h3v16h-4v4h-5v3h-4v-3H7v-3H3V7h3V3h2z" fill="currentColor" />
      <path d="M9 7h10v3h3v10h-3v3H9v-3H6V10h3z" fill="var(--paper)" />
      <path d="M15 17h5v5h5v5h-5v-5h-5z" fill="currentColor" />
    </svg>
  );
}
export function Brand() {
  return (
    <a className="brand" href="/landing/" aria-label="Quoli home">
      <Mark />
      Quoli
    </a>
  );
}
export function Moon({ dark }: { dark: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      {dark ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
        </>
      ) : (
        <path d="M18.5 15.5A8 8 0 0 1 8.5 5.1a8.2 8.2 0 1 0 10 10.4Z" />
      )}
    </svg>
  );
}
