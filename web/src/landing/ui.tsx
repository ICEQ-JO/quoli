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
      viewBox="0 0 36 36"
      shapeRendering="crispEdges"
    >
      <path
        d="M10 2h14v4h4v12h-6v-8H12v2h-2v10h2v2h8v6H10v-4H4V8h6zM16 18h6v4h4v4h-6v-4h-4zM28 28h6v6h-6z"
        fill="currentColor"
      />
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
