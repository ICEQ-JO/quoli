// biome-ignore-all lint/suspicious/noArrayIndexKey: Fixed decorative geometry has no state and never reorders.
import { useId } from "react";

type Kind = "context" | "review" | "measure";
const ink = "#172d43",
  deep = "#294e70",
  denim = "#477da8",
  mid = "#75acd0",
  blue = "#a9d8f2",
  pale = "#c7e6f7",
  ice = "#edf7fc",
  cream = "#ffe5ad";
const random = (n: number) => {
  const v = Math.sin(n * 83.7 + 127.1) * 43758.5453;
  return v - Math.floor(v);
};
function Pine({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 0v-${size}`} stroke={deep} strokeWidth="3" />
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i}>
          <rect
            x={-3 - i * 2}
            y={-size + 6 + i * (size / 8)}
            width={7 + i * 4}
            height={5 + size / 13}
            fill={deep}
          />
          <rect x={-3 - i * 2} y={-size + 6 + i * (size / 8)} width={3 + i} height="2" fill={mid} />
        </g>
      ))}
    </g>
  );
}
function Paper({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={small ? "M4 4h56v74H4z" : "M6 6h126v170H6z"} fill={deep} />
      <path d={small ? "M0 0h56v74H0z" : "M0 0h126v170H0z"} fill={ice} />
      <path d={small ? "M0 0h56v6H0z" : "M0 0h126v8H0z"} fill={cream} />
      {Array.from({ length: small ? 5 : 9 }, (_, i) => (
        <g key={i}>
          <rect
            x={small ? 9 : 18}
            y={(small ? 14 : 28) + i * (small ? 10 : 14)}
            width={small ? 5 : 7}
            height={small ? 3 : 4}
            fill={i % 3 === 0 ? denim : mid}
          />
          <rect
            x={small ? 20 : 34}
            y={(small ? 14 : 28) + i * (small ? 10 : 14)}
            width={(small ? 26 : 70) - (i % 3) * (small ? 4 : 11)}
            height={small ? 2 : 3}
            fill={mid}
          />
        </g>
      ))}
    </g>
  );
}

/** Original decorative plates; diagrams are illustrative, never product screenshots. */
export function JournalArt({ kind, className = "" }: { kind: Kind; className?: string }) {
  const id = useId().replaceAll(":", "");
  return (
    <svg
      className={`journal-art art-${kind} ${className}`}
      viewBox="0 0 640 400"
      fill="none"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <defs>
        <clipPath id={id}>
          <path d="M0 0h640v400H0z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <path d="M0 0h640v400H0z" fill={pale} />
        <g className="plate-clouds" fill={ice}>
          <path d="M24 55h104v4H24zm15-6h39v6H39zm426 20h136v4H465zm19-8h72v8h-72zM240 26h94v4h-94zm18-4h38v4h-38z" />
        </g>
        <path d="M524 29h22v4h6v22h-6v5h-22v-5h-5V33h5z" fill={cream} />
        <path
          d="M0 196h26v-12h25v-8h19v-9h25v-8h23v-13h24v-9h27v-8h24v-14h23v-11h16v-13h22v-8h19v-12h19v9h22v17h24v13h24v9h23v11h19v17h26v10h24v12h27v12h20v10h21v12h26v9h28v-9h20v-10h27v-10h30v-7h45v218H0z"
          fill={blue}
        />
        <path
          d="M0 262h27v-14h24v-9h27v-16h32v-7h28v-14h30v-10h38v7h24v13h24v14h28v15h27v12h35v13h35v-8h26v-16h34v-13h28v-13h30v-12h26v-9h26v-12h34v14h29v9h27v17h34v18h28v-9h28v-12h31v192H0z"
          fill={mid}
        />
        <path d="M0 358h640v42H0z" fill={denim} />
        <g className="plate-birds" stroke={deep} strokeWidth="2">
          <path d="m338 64 4 2 4-2m8 7 4 2 4-2m8 7 4 2 4-2m8 7 4 2 4-2" />
        </g>
        <g className="plate-wind" fill={ice}>
          <path d="M14 130h19v2H14zm19-4h9v2h-9zm526-22h34v2h-34zm41 8h15v2h-15z" />
        </g>
        <path d="M20 264h3v70h-3zm-7 4h17v3H13zm592-47h3v112h-3zm-7 4h17v3h-17z" fill={deep} />
        <path
          d="M23 271h21v3h24v3h23v3h25m489-47h-21v3h-24v3h-23v3h-25"
          stroke={denim}
          strokeWidth="2"
        />
        <g className="plate-beacon" fill={cream}>
          <path d="M16 253h3v3h-3zm9 0h3v3h-3zm576-43h3v3h-3zm9 0h3v3h-3z" />
        </g>
        {Array.from({ length: 22 }, (_, i) => (
          <Pine
            key={i}
            x={i * 32 - 15}
            y={345 + Math.round(random(i) * 18)}
            size={25 + Math.round(random(i + 34) * 36)}
          />
        ))}
        {Array.from({ length: 75 }, (_, i) => (
          <rect
            key={i}
            x={Math.round(random(i + 100) * 640)}
            y={365 + Math.round(random(i + 700) * 35)}
            width={2 + Math.round(random(i) * 3)}
            height="1"
            fill={i % 5 === 0 ? cream : blue}
          />
        ))}
        {kind === "context" && (
          <>
            <path d="M54 280h532v12H54zM70 292h500v6H70z" fill={deep} />
            <path d="M54 276h532v4H54z" fill={cream} />
            <path d="M90 298h12v80H90zm444 0h12v80h-12z" fill={deep} />
            <path d="M96 300h3v78h-3zm441 0h3v78h-3z" fill={mid} />
            <path d="M83 176h5v100h-5zm474 0h5v100h-5z" fill={deep} />
            <path
              d="M85 180v-3h28v8h25v8h28v8h29v8h30v8h31v6h35v4h38v-4h36v-6h31v-8h29v-8h29v-8h27v-8h27v-8h27"
              stroke={deep}
              strokeWidth="2"
            />
            <g transform="translate(108 85)">
              <path d="M0 0h138v8h8v177H0z" fill={denim} />
              <path d="M8 12h126v157H8z" fill={blue} />
              <Paper x={-3} y={-8} />
              <path d="M-12 166h163v12H-12z" fill={deep} />
              <path d="M-12 163h163v4H-12z" fill={cream} />
            </g>
            <g transform="translate(373 129)">
              <path d="M0 0h142v134H0z" fill={deep} />
              <path d="M5 5h132v123H5z" fill={denim} />
              <path d="M12 13h118v103H12z" fill={ice} />
              <path d="M19 20h104v88H19z" fill={ink} />
              <path d="M46 48h34v39h28M78 48V32h26" stroke={mid} strokeWidth="2" />
              {[
                [34, 39],
                [72, 23],
                [99, 78],
              ].map(([x, y], i) => (
                <g key={x}>
                  <path d={`M${x} ${y}h22v17h-22z`} fill={blue} />
                  <path d={`M${x + 4} ${y + 5}h14v3h-14z`} fill={i === 1 ? cream : ice} />
                </g>
              ))}
              <path d="M48 134h44v8H48zm-9 8h62v5H39z" fill={mid} />
              <path d="M6 5h36v2H6z" fill={pale} />
              {[
                [3, 3],
                [134, 3],
                [3, 124],
                [134, 124],
              ].map(([x, y]) => (
                <path key={`${x}-${y}`} d={`M${x} ${y}h3v3h-3z`} fill={pale} />
              ))}
            </g>
            <path d="M254 224h90v3h-90z" fill={deep} />
            {[0, 1, 2].map((i) => (
              <g className={`plate-packet packet-${i}`} key={i}>
                <path d="M263 220h10v10h-10z" fill={cream} />
                <path d="M266 223h4v4h-4z" fill={mid} />
                <path d="M251 224h8v2h-8z" fill={blue} />
              </g>
            ))}
            <Paper x={292} y={276} small />
          </>
        )}
        {kind === "review" && (
          <>
            <path d="M75 312h490v11H75zM86 323h468v8H86z" fill={deep} />
            <path d="M75 307h490v5H75z" fill={cream} />
            <path d="M97 331h12v47H97zm430 0h12v47h-12z" fill={deep} />
            <Paper x={201} y={126} />
            <Paper x={345} y={146} />
            <g className="plate-review-scan" fill={cream}>
              <path d="M218 149h93v3h-93zm144 20h92v3h-92z" />
            </g>
            <g className="plate-lens">
              <path
                d="M171 72h79v8h24v13h15v20h10v67h-10v21h-15v14h-23v8h-79v-8h-24v-14h-15v-21h-9v-67h9V93h15V80h23z"
                fill={deep}
              />
              <path
                d="M176 82h69v8h24v15h14v19h7v44h-7v20h-14v16h-24v8h-69v-8h-23v-16h-14v-20h-7v-44h7v-19h14V90h23z"
                fill={blue}
              />
              <path
                d="M179 94h62v8h18v14h12v20h7v25h-7v20h-12v14h-18v7h-62v-7h-18v-14h-12v-20h-7v-25h7v-20h12v-14h18z"
                fill={ice}
              />
              <path
                d="M172 122h12v12h-12zm23 2h50v5h-50zm-23 24h12v12h-12zm23 2h43v5h-43zm-23 24h12v12h-12zm23 2h32v5h-32z"
                fill={denim}
              />
              <path
                d="M270 203h15v14h14v14h14v14h14v14h14v14h-19v-10h-14v-14h-14v-14h-14v-14h-10z"
                fill={deep}
              />
              <path d="M286 221h7v8h14v14h14v14h14v9h-8v-6h-14v-14h-14v-14h-13z" fill={mid} />
              <path d="M155 110h4v23h-4zm5-8h17v4h-17z" fill={cream} />
            </g>
            <path d="M491 251h31v57h-31z" fill={denim} />
            <path d="M496 246h21v8h-21z" fill={cream} />
            <g className="plate-steam" fill={ice}>
              <path d="M501 226h3v10h-3zm8-17h3v10h-3z" />
            </g>
          </>
        )}
        {kind === "measure" && (
          <>
            <path d="M117 309h414v15H117zM129 324h390v8H129z" fill={deep} />
            <path d="M117 304h414v5H117z" fill={cream} />
            <path d="M136 332h15v40h-15zm360 0h15v40h-15z" fill={deep} />
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${156 + i * 111} 82)`}>
                <path d="M7 0h60v7h8v196H0V7h7z" fill={deep} />
                <path d="M8 8h59v183H8z" fill={mid} />
                <path d="M14 16h46v167H14z" fill={ice} />
                <path d="M21 23h32v153H21z" fill={pale} />
                <path
                  d={`M22 ${[102, 67, 125][i]}h30v${176 - [102, 67, 125][i]}H22z`}
                  fill={denim}
                />
                {Array.from({ length: 12 }, (_, j) => (
                  <path
                    key={j}
                    d={`M${j % 3 === 0 ? 14 : 17} ${29 + j * 12}h${j % 3 === 0 ? 10 : 7}v2h-${j % 3 === 0 ? 10 : 7}z`}
                    fill={deep}
                  />
                ))}
                <path className={`plate-level gauge-${i}`} d="M22 84h30v92H22z" fill={blue} />
                <g className={`plate-gauge gauge-${i}`}>
                  <path d={`M24 ${[89, 54, 112][i]}h26v9H24z`} fill={cream} />
                  <path d={`M29 ${[92, 57, 115][i]}h16v2H29z`} fill={mid} />
                </g>
                <path d="M-9 194h92v20H-9z" fill={denim} />
                <path d="M-3 196h80v3H-3z" fill={blue} />
                <path d="M20 201h34v8H20z" fill={ink} />
                <path d="M27 203h4v4h-4zm9 0h4v4h-4zm9 0h4v4h-4z" fill={cream} />
              </g>
            ))}
            <path d="M121 288h400v9H121z" fill={blue} />
            <path d="M126 289h390v2H126z" fill={ice} />
          </>
        )}
      </g>
    </svg>
  );
}
