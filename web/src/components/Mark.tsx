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
