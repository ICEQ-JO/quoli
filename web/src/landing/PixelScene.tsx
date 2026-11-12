import { useEffect, useRef } from "react";
import { SESSION_STEPS, sessionAt } from "./scene-model.ts";

type Scene = "forest" | "field" | "recorder" | "signal";
const hash = (n: number) => {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function landscape(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  blue: boolean,
  simple: boolean,
) {
  const colors = blue
    ? ["#0b334d", "#0e526f", "#176f8f", "#218fa9", "#55bad0", "#ade5e1"]
    : ["#284200", "#3c5c00", "#537e00", "#76a809", "#9dce35", "#c4e66b"];
  ctx.fillStyle = simple ? colors[0] : colors[3];
  ctx.fillRect(0, 0, w, h);
  // Sample shared contour boundaries, not every pixel: crisp edges without a per-pixel frame cost.
  const bands = simple ? [2, 1, 0, 1] : [4, 5, 4, 3, 4, 2];
  for (let band = 0; band < bands.length; band++) {
    ctx.fillStyle = colors[bands[band]];
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const boundary =
        (band - 2) * h * 0.27 + x * 0.18 + Math.sin(x / 100 + time * 0.045 + band * 0.25) * h * 0.3;
      const y = Math.round(boundary / 2) * 2;
      if (!x) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }
  if (simple) return;
  const sunX = w * 0.86;
  const sunY = h * 0.18;
  ctx.fillStyle = "#effbc0";
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const x = Math.round(sunX + Math.cos(a) * 9);
    const y = Math.round(sunY + Math.sin(a) * 9);
    if (!i) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.fill();
  for (let i = 0; i < 22; i++) {
    const a = (i * Math.PI) / 11 + time * 0.018;
    ctx.fillRect(Math.round(sunX + Math.cos(a) * 14), Math.round(sunY + Math.sin(a) * 14), 1, 2);
  }
  // Distant tree line, then progressively darker foreground silhouettes.
  for (let layer = 0; layer < 3; layer++) {
    const baseline = h * (0.52 + layer * 0.2);
    const shade = colors[2 - layer];
    ctx.fillStyle = shade;
    for (let x = -8; x < w + 10; x += 5) {
      const height = 4 + hash(x + layer * 350) * (8 + layer * 14);
      const y = baseline + Math.sin(x / 48 + layer) * 5;
      ctx.fillRect(x, Math.round(y - height), 3, Math.round(height));
      for (let k = 0; k < 5; k++) {
        const size = 2 + k * 0.9;
        ctx.fillRect(
          Math.round(x - size),
          Math.round(y - height + (k * height) / 6),
          Math.round(size * 2 + 2),
          3,
        );
      }
    }
  }
  ctx.fillStyle = colors[0];
  for (let x = 0; x < w; x += 2) {
    const base = h - 7 + Math.sin(x / 22) * 3;
    ctx.fillRect(x, Math.round(base), 2, h - base);
    const grass = hash(x + 8);
    if (grass > 0.5) ctx.fillRect(x, Math.round(base - grass * 8), 1, 8);
    if (grass > 0.85) {
      ctx.fillStyle = colors[5];
      ctx.fillRect(x, Math.round(base - 6), 2, 2);
      ctx.fillStyle = colors[0];
    }
  }
  for (let i = 0; i < 18; i++) {
    const x = (hash(i + 8) * w + time * (1 + hash(i))) % w;
    const y = hash(i + 30) * h * 0.75 + Math.sin(time * 0.5 + i) * 2;
    ctx.globalAlpha = 0.35 + Math.sin(time + i) * 0.2;
    ctx.fillStyle = colors[5];
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.globalAlpha = 1;
}

function recorder(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number) {
  const state = sessionAt(seconds);
  const x = (w - 234) / 2;
  const y = h * 0.38;
  const p = {
    dark: "#254733",
    deep: "#385e41",
    mid: "#6c8d52",
    light: "#b8cd8d",
    paper: "#e9edce",
    brass: "#a4b074",
    highlight: "#f6f7e2",
  };
  const rect = (rx: number, ry: number, rw: number, rh: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x + rx), Math.round(y + ry), rw, rh);
  };
  // Bench, four feet, casing floor, front and right walls: actual supported parts.
  ctx.globalAlpha = 0.09;
  rect(-13, 110, 264, 13, p.dark);
  ctx.globalAlpha = 1;
  for (const fx of [8, 213]) {
    rect(fx, 100, 16, 10, p.deep);
    rect(fx - 1, 108, 18, 3, p.dark);
  }
  rect(-6, -3, 244, 101, p.deep);
  rect(-3, -9, 238, 104, p.light);
  rect(0, -12, 229, 100, p.paper);
  rect(229, -8, 7, 104, p.mid);
  rect(0, 85, 229, 13, p.mid);
  rect(3, 85, 224, 3, p.brass);
  rect(5, -10, 219, 2, p.highlight);
  rect(8, -4, 212, 77, "#d9e2b9");
  // A continuous tape runs from hub through the guide/head assembly to the other reel.
  rect(54, 41, 132, 3, p.dark);
  rect(53, 28, 3, 15, p.dark);
  rect(183, 28, 3, 15, p.dark);
  rect(103, 34, 26, 19, p.mid);
  rect(106, 35, 20, 13, p.deep);
  rect(110, 31, 12, 3, p.brass);
  rect(112, 37, 8, 6, p.paper);
  for (const guide of [91, 137]) {
    rect(guide, 36, 5, 15, p.deep);
    rect(guide - 1, 35, 7, 3, p.light);
    rect(guide - 1, 49, 7, 2, p.mid);
  }
  for (let side = 0; side < 2; side++) {
    const cx = x + 54 + side * 130;
    const cy = y + 21;
    const radius = 31;
    ctx.fillStyle = p.mid;
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.deep;
    ctx.beginPath();
    ctx.arc(cx, cy, side ? 14 + state.progress * 10 : 24 - state.progress * 10, 0, Math.PI * 2);
    ctx.fill();
    for (let ring = 15; ring < 29; ring += 4) {
      ctx.strokeStyle = p.brass;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.reel * (side ? 1 : -1));
    for (let arm = 0; arm < 3; arm++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.fillStyle = p.paper;
      ctx.fillRect(-3, -29, 6, 27);
      ctx.fillStyle = p.mid;
      ctx.fillRect(-1, -25, 2, 12);
    }
    ctx.restore();
    ctx.fillStyle = p.deep;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.highlight;
    ctx.fillRect(cx - 2, cy - 3, 3, 3);
    ctx.fillStyle = p.brass;
    ctx.fillRect(cx - 1, cy, 2, 4);
  }
  // Screws, vents, transport buttons, indicator bezel and counter are fitted to the casing.
  for (const sx of [4, 219])
    for (const sy of [-5, 79]) {
      rect(sx, sy, 3, 3, p.deep);
      rect(sx + 1, sy, 1, 2, p.light);
    }
  for (let slot = 0; slot < 8; slot++) rect(11 + slot * 4, 65, 2, 6, p.mid);
  rect(70, 60, 70, 16, p.deep);
  rect(72, 62, 66, 12, p.dark);
  ctx.font = "7px monospace";
  ctx.fillStyle = "#d6e5a9";
  ctx.fillText(
    `0${state.step} : ${String(Math.floor(state.time)).padStart(2, "0")}`,
    x + 80,
    y + 71,
  );
  for (let button = 0; button < 4; button++) {
    rect(151 + button * 16, 62, 12, 11, p.mid);
    rect(151 + button * 16, 60, 11, 10, button === state.step % 4 ? p.deep : p.paper);
    rect(154 + button * 16, 63, 4, 3, button === state.step % 4 ? "#d0ed8b" : p.mid);
  }
  rect(211, 16, 7, 33, p.mid);
  rect(213, 18, 3, 28, p.deep);
  const lamp = Math.floor(state.progress * 25);
  rect(213, 44 - lamp, 3, 3, "#a6c65e");
  // Paper feeds below the tape head; recorded marks advance with the same session clock.
  rect(88, 87, 61, 5, p.dark);
  rect(92, 91, 53, 40, p.paper);
  rect(143, 92, 3, 40, p.light);
  const colors = ["#7c9270", "#426f8b", "#b77735", "#39877a", "#b77735", "#846735"];
  for (let i = 0; i <= state.step; i++) {
    const row = 97 + ((i * 6 + state.time * 2) % 30);
    rect(98, row, 3, 2, colors[i]);
    rect(104, row, 16 + i * 2, 1, p.mid);
  }
  ctx.fillStyle = p.mid;
  for (let i = 0; i < 17; i++) ctx.fillRect(x + 94 + i * 3, y + 131 + (i % 2), 3, 1);
}

function signals(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const state = sessionAt(time);
  const middle = w / 2;
  const cy = h * 0.52;
  ctx.fillStyle = "#0a7eaa";
  const cell = 3;
  for (let x = 0; x < w; x += cell) {
    for (let y = 0; y < h; y += cell) {
      const dx = x - middle,
        dy = y - cy;
      const spread = Math.abs(Math.sin(time * 0.18)) * 75 + 20;
      const distance = Math.hypot(dx * 0.7, dy);
      const phase = Math.sin(distance / 10 - time * 1.3);
      const probability = Math.max(0, 1 - distance / spread) * 0.55;
      if (hash(x * 311 + y) < probability && phase > -0.2) {
        ctx.globalAlpha = 0.08 + Math.max(0, phase) * 0.42;
        ctx.fillRect(x, y, cell - 1, cell - 1);
      }
    }
  }
  ctx.globalAlpha = 1;
  const xs = [middle - 105, middle - 35, middle + 35, middle + 105];
  ctx.strokeStyle = "#96c7d7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xs[0], cy);
  ctx.lineTo(xs[3], cy);
  ctx.stroke();
  xs.forEach((x, i) => {
    ctx.fillStyle = i <= state.step % 4 ? "#0b80a9" : "#d9ebed";
    ctx.fillRect(x - 9, cy - 9, 18, 18);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 4, cy - 4, 8, 8);
    ctx.fillStyle = "#0b80a9";
    ctx.fillRect(x - 2, cy - 2, 4, 4);
  });
  const packet = xs[0] + state.progress * (xs[3] - xs[0]);
  ctx.fillStyle = "#0c678f";
  ctx.fillRect(Math.round(packet), cy - 2, 4, 4);
}

export function PixelScene({
  kind,
  paused = false,
  seconds,
  blue = false,
  onTime,
}: {
  kind: Scene;
  paused?: boolean;
  seconds?: number;
  blue?: boolean;
  onTime?: (time: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const control = useRef({ seconds, onTime, blue });
  control.current = { seconds, onTime, blue };
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    const width = kind === "recorder" ? 350 : kind === "signal" ? 480 : 420;
    const height = kind === "recorder" ? 220 : kind === "signal" ? 160 : 190;
    element.width = width;
    element.height = height;
    context.imageSmoothingEnabled = false;
    let frame = 0,
      last = 0,
      time = seconds ?? clock.current,
      visible = false,
      lastStep = -1,
      lastPaint = -1;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches && seconds === undefined && kind === "recorder") time = 12;
    function draw() {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      if (kind === "forest" || kind === "field")
        landscape(context, width, height, time, control.current.blue, kind === "field");
      else if (kind === "recorder") recorder(context, width, height, time);
      else signals(context, width, height, time);
    }
    function tick(now: number) {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.25) : 0;
      last = now;
      if (control.current.seconds !== undefined) time = control.current.seconds;
      else if (!paused && !media.matches) time += dt;
      clock.current = time;
      if (now - lastPaint > 45 || media.matches || paused) {
        draw();
        lastPaint = now;
      }
      const step = sessionAt(time).step;
      if (step !== lastStep) {
        lastStep = step;
        control.current.onTime?.(time);
      }
      if (visible && !document.hidden && !paused && !media.matches)
        frame = requestAnimationFrame(tick);
    }
    function start() {
      if (!frame && visible && !document.hidden) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) start();
        else {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: "60px" },
    );
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else start();
    };
    media.addEventListener("change", start);
    observer.observe(
      kind === "recorder" ? (element.closest(".recording-section") ?? element) : element,
    );
    document.addEventListener("visibilitychange", visibility);
    draw();
    return () => {
      observer.disconnect();
      media.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", visibility);
      cancelAnimationFrame(frame);
    };
  }, [kind, seconds, paused]);
  const label =
    kind === "recorder"
      ? "Animated twin-reel recorder: reels turn, tape moves through the head, and a paper strip records the session's steps."
      : kind === "forest"
        ? "An original animated pixel forest with rolling light, drifting pollen, and distant trees."
        : kind === "signal"
          ? "Recorded activity passes through four connected viewpoints."
          : undefined;
  return (
    <canvas
      ref={canvas}
      className={`pixel-scene scene-${kind}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={!label || undefined}
    />
  );
}

export { SESSION_STEPS };
