const iconPaths = [
  "M8 2h8v2h3v13h-3v3H8v-3H5V4h3zm0 5v5h8V7zM9 0h2v3H9zM3 8h2v6H3zm16 0h2v6h-2zM8 20h3v3H8zm6 0h3v3h-3z",
  "M4 3h7v3h9v15H4zm2 5v11h12V8zm3 3h6v2H9zm0 4h6v2H9z",
  "M5 2h5v5H9v4h7V7h-1V2h5v5h-2v6h-5v4h2v5h-5v-5h1v-4H7V7H5z",
  "M2 13h8v9H2zm12-8h8v8h-8zM2 2h8v7H2zm10 5h2v2h-2zm-5 4v2H5v-2zm4 6h3v2h-3zm5-2h2v7h-2z",
  "M9 1h6v2h3v3h2v4h-4V7h-2V5h-4v2H8v3H4V6h2V3h3zM3 10h18v12H3zm8 4v5h2v-5z",
];

export function PixelIcon({ kind }: { kind: number }) {
  return (
    <svg
      className="pixel-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      shapeRendering="crispEdges"
    >
      <path d={iconPaths[kind]} fillRule="evenodd" />
    </svg>
  );
}

export function Courier({ large = false }: { large?: boolean }) {
  return (
    <img
      className={large ? "courier courier-large" : "courier"}
      src="/landing/courier.webp"
      width="1024"
      height="1536"
      alt=""
      aria-hidden="true"
      loading="lazy"
    />
  );
}

const stations = [
  { name: "Agents", x: 122, y: 197, height: 62, label: "Dispatch house" },
  { name: "Code", x: 281, y: 119, height: 73, label: "Code workshop" },
  { name: "Git", x: 282, y: 280, height: 58, label: "Branch station" },
  { name: "Infra", x: 443, y: 199, height: 86, label: "Service observatory" },
];

function Building({
  x,
  y,
  height,
  active,
  index,
}: {
  x: number;
  y: number;
  height: number;
  active: boolean;
  index: number;
}) {
  const roof = active ? "#bf6b42" : "#588877";
  const lightRoof = active ? "#df9c65" : "#8db197";
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="9" rx="48" ry="19" fill="#164a3b" opacity=".09" />
      <path d={"M-39 0v-9l39-19 39 19v9L0 20z"} fill="#789b7f" />
      <path d="M-39-9 0-28 39-9 0 10z" fill={active ? "#e3c78d" : "#bfceb1"} />
      <path d={`M-32-12v-${height}L0-${height + 28}v${height}z`} fill="#e4d6ac" />
      <path d={`M0-28v-${height}l32 16v${height}z`} fill="#a1ae8b" />
      <path
        d={
          "M-38-" +
          (height + 12) +
          " 0-" +
          (height + 40) +
          " 38-" +
          (height + 12) +
          " 0-" +
          (height - 8) +
          "z"
        }
        fill={roof}
      />
      <path d={`M-38-${height + 12} 0-${height + 40} 0-${height - 8}z`} fill={lightRoof} />
      {[0, 1, 2].map((row) => (
        <path
          key={row}
          d={`M${-29 + row * 9} ${-(height + 18) - row * 7}l25 15`}
          stroke={active ? "#b76c46" : "#608c77"}
          strokeWidth="2"
        />
      ))}
      {[0, 1, 2].map((row) => (
        <g key={row} transform={`translate(0 ${row * 14})`}>
          <path d={`M-24-${height + 5}l8-4v9l-8 4z`} fill={active ? "#286f60" : "#718f77"} />
          <path d={`M-10-${height + 12}l6-3v9l-6 3z`} fill={active ? "#286f60" : "#718f77"} />
          <path d={`M9-${height + 11}l8 4v9l-8-4z`} fill="#527965" />
        </g>
      ))}
      <path d="M-9-19v17l10-5v-17z" fill="#687b5d" />
      <path d="M-15 1l15-8 9 4-15 8zM-20 5l15-8 9 4-15 8z" fill="#d6d4ad" />
      <path d={`M17-${height + 26}v-14l6-3v14z`} fill="#b2b89a" />
      <path d={`M23-${height + 29}v-14l5 3v14z`} fill="#788e71" />
      <path d={`M16-${height + 40}l6-3 7 4-6 3z`} fill="#d4d3ad" />
      {index === 3 && (
        <g>
          <path d={`M-2-${height + 35}v-35h4v35`} fill="#6b826b" />
          <path d={`M-10-${height + 60}h20v3h-20z`} fill="#8a9b7a" />
          <rect
            x="-4"
            y={-(height + 76)}
            width="8"
            height="8"
            fill={active ? "#d99a56" : "#b2c6a4"}
          />
          <rect x="-2" y={-(height + 74)} width="4" height="4" fill="#f7edc4" />
        </g>
      )}
      {index === 0 && (
        <g>
          <path d="M-42-25v-31h3v31" fill="#697f62" />
          <path d="M-47-56h13v3h-13z" fill="#a18855" />
          <rect x="-44" y="-65" width="7" height="9" fill="#e4ba72" />
        </g>
      )}
      {index === 2 && (
        <g>
          <path d="M30-13 47-21v-16h-3v14l-14 7z" fill="#5a7d68" />
          <path d="M38-36h14v3H38z" fill="#b67a4b" />
          <rect x="43" y="-43" width="6" height="7" fill="#e7be78" />
        </g>
      )}
      {active && <path d="M-15 27h30v3h-30z" fill="#c67847" />}
    </g>
  );
}

function Tree({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${small ? ".7" : "1"})`}>
      <path d="M-3-7h6v19h-6z" fill="#897b54" />
      <path d="M-17-10v-16h7v-8H5v5h10v9h6v17h-9v6H-6v-5h-11z" fill="#6f9c72" />
      <path d="M-17-10v-16h7v-8H4v7H-5v9h-8v8z" fill="#a7c497" />
      <path d="M5-29h10v9h6v17h-9v6H3v-8h8v-14H5z" fill="#447b5d" />
    </g>
  );
}

export function World({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="world-map">
      <svg viewBox="0 0 570 390" aria-hidden="true" shapeRendering="crispEdges">
        <path d="M31 203 282 75 537 203v35L282 366 31 238z" fill="#6c9982" />
        <path d="m31 203 251 128v35L31 238z" fill="#5a826c" />
        <path d="m282 331 255-128v35L282 366z" fill="#3f6d5e" />
        <path d="m31 203 251-128 255 128-255 128z" fill="#c7dcb9" />
        <path d="m40 203 242-123 246 123-246 123z" fill="#d2e1c0" />
        <path d="m290 89 42 21-214 115 122 63-24 12-149-77z" fill="#79b8ac" />
        <path d="m299 100 23 11-212 114 118 61-10 6-136-69z" fill="#a5d5c0" />
        <path d="m282 330 35-18v11l-35 18zM53 222l39 20v9l-39-20z" fill="#88ae8e" />
        <path
          d="M122 200 282 119l161 82-160 79z"
          fill="none"
          stroke="#c1b586"
          strokeWidth="18"
          strokeLinejoin="round"
        />
        <path
          className="signal-path"
          d="M122 200 282 119l161 82-160 79z"
          fill="none"
          stroke="#e9d5a0"
          strokeWidth="6"
          strokeDasharray="6 8"
        />
        <path d="m168 180 23-12 9 5-23 12zM174 185v-5l21-11v5z" fill="#a28353" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M${168 + i * 5} ${180 - i * 2.5}l9 5`}
            stroke="#e5cea0"
            strokeWidth="2"
          />
        ))}
        <Tree x={229} y={123} small />
        <Tree x={374} y={178} small />
        <Tree x={82} y={215} small />
        <Building {...stations[1]} index={1} active={selected === 1} />
        <Building {...stations[0]} index={0} active={selected === 0} />
        <Building {...stations[3]} index={3} active={selected === 3} />
        <Tree x={339} y={247} />
        <Tree x={487} y={239} small />
        <Building {...stations[2]} index={2} active={selected === 2} />
        <Tree x={173} y={265} />
        <Tree x={222} y={305} small />
        <Tree x={387} y={287} small />
        <path d="m262 349 8 4v6l-8-4zM447 259l12-6v7l-12 6zM114 258l9 5v7l-9-5z" fill="#aac0a0" />
        <path
          d="m282 119 161 82-160 79-161-80z"
          className="trail"
          fill="none"
          stroke="#ba7044"
          strokeWidth="3"
          strokeDasharray="2 300"
          strokeLinecap="square"
        />
      </svg>
      {stations.map((station, index) => (
        <button
          className={`station-control station-${index}${selected === index ? " is-active" : ""}`}
          type="button"
          key={station.name}
          aria-label={`Explore ${station.name}: ${station.label}`}
          aria-pressed={selected === index}
          onClick={() => onSelect(index)}
        >
          <span>{station.name}</span>
          <span className="station-dot" />
        </button>
      ))}
    </div>
  );
}
