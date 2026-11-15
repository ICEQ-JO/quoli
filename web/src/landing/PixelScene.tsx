import { useEffect, useRef } from "react";
import { drawArchive, drawOptics, drawValley } from "./pixel-art.ts";
import { SESSION_STEPS, sessionAt } from "./scene-model.ts";

type Scene = "forest" | "field" | "recorder" | "signal" | "archive";
export function contours(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  ctx.fillStyle = "#294e70";
  ctx.fillRect(0, 0, w, h);
  // Survey contours share the valley's stepped relief, with signals following the land.
  for (let band = 0; band < 18; band++) {
    ctx.strokeStyle = band % 4 === 0 ? "#75acd0" : "#477da8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const heightAt = (x: number) =>
      Math.round(
        (band * h) / 12 -
          h * 0.28 +
          Math.sin(x / 71 + band * 0.15) * h * 0.17 +
          Math.cos(x / 39 - band * 0.11) * h * 0.06,
      );
    for (let x = -3; x <= w + 3; x += 3) {
      if (x === -3) ctx.moveTo(x, heightAt(x));
      else ctx.lineTo(x, heightAt(x));
    }
    ctx.stroke();
    const x = ((time * (24 + (band % 3) * 11) + band * 47) % (w + 20)) - 10;
    const y = heightAt(x);
    ctx.fillStyle = band % 4 === 0 ? "#ffe5ad" : "#a9d8f2";
    ctx.fillRect(Math.round(x), y - 1, band % 4 === 0 ? 5 : 2, 2);
  }
  for (let i = 0; i < 7; i++) {
    const x = 25 + i * 61;
    const y = 29 + ((i * 41) % Math.max(1, h - 40));
    ctx.fillStyle = "#75acd0";
    ctx.fillRect(x - 3, y, 7, 1);
    ctx.fillRect(x, y - 3, 1, 7);
    ctx.fillStyle = "#a9d8f2";
    ctx.fillRect(x, y, 1, 1);
  }
}

export function recorder(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number) {
  const state = sessionAt(seconds);
  // The transport lives in a listening workshop looking out over the signal valley.
  ctx.fillStyle = "#c7e6f7";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#477da8";
  ctx.fillRect(13, 9, w - 26, 106);
  ctx.fillStyle = "#294e70";
  ctx.fillRect(17, 13, w - 34, 98);
  for (let i = 0; i < 24; i++) {
    const sx = 23 + ((i * 53) % (w - 48));
    const sy = 19 + ((i * 19) % 61);
    ctx.fillStyle = i % 5 === Math.floor(seconds * 2) % 5 ? "#ffe5ad" : "#75acd0";
    ctx.fillRect(sx, sy, 1, 1);
  }
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer ? "#477da8" : "#75acd0";
    for (let px = 18; px < w - 18; px += 2) {
      const ridge = 61 + layer * 22 + Math.sin(px / 33 + layer * 2) * 13;
      ctx.fillRect(px, Math.round(ridge), 2, 111 - Math.round(ridge));
    }
  }
  ctx.fillStyle = "#edf7fc";
  ctx.fillRect(w - 57, 24, 14, 14);
  ctx.fillStyle = "#a9d8f2";
  ctx.fillRect(18, 111, w - 36, 3);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = "#ffe5ad";
    ctx.fillRect(20 + ((seconds * 29 + i * 83) % (w - 44)), 104, 4, 2);
  }
  ctx.fillStyle = "#75acd0";
  ctx.fillRect(0, h - 19, w, 3);
  ctx.fillStyle = "#477da8";
  ctx.fillRect(0, h - 16, w, 16);
  const x = (w - 234) / 2;
  const y = h * 0.38;
  const p = {
    dark: "#172d43",
    deep: "#355a7a",
    mid: "#6f9ebc",
    light: "#a9d8f2",
    paper: "#edf7fc",
    brass: "#88b5d0",
    highlight: "#ffe5ad",
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
  rect(8, -4, 212, 77, "#cce6f5");
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
  ctx.fillStyle = "#c7e6f7";
  ctx.fillText(
    `0${state.step} : ${String(Math.floor(state.time)).padStart(2, "0")}`,
    x + 80,
    y + 71,
  );
  for (let button = 0; button < 4; button++) {
    rect(151 + button * 16, 62, 12, 11, p.mid);
    rect(151 + button * 16, 60, 11, 10, button === state.step % 4 ? p.deep : p.paper);
    rect(154 + button * 16, 63, 4, 3, button === state.step % 4 ? "#ffe5ad" : p.mid);
  }
  rect(211, 16, 7, 33, p.mid);
  rect(213, 18, 3, 28, p.deep);
  // A fast meter responds to the transport without advancing the recorded steps.
  const lamp = Math.floor((0.5 + Math.sin(state.time * 8) * 0.3) * 25);
  rect(213, 44 - lamp, 3, 3, "#ffe5ad");
  // Paper feeds below the tape head; recorded marks advance with the same session clock.
  rect(88, 87, 61, 5, p.dark);
  rect(92, 91, 53, 40, p.paper);
  rect(143, 92, 3, 40, p.light);
  for (let i = 0; i < 5; i++) {
    rect(-31, 63 + i * 5, 15 + (i % 2) * 5, 3, p.mid);
    rect(243, 42 + i * 7, 21, 5, i % 2 ? p.light : p.deep);
    rect(245, 43 + i * 7, 16, 1, p.paper);
  }
  const colors = ["#7c9270", "#426f8b", "#b77735", "#39877a", "#b77735", "#846735"];
  for (let i = 0; i <= state.step; i++) {
    const row = 97 + ((i * 6 + state.time * 2) % 30);
    rect(98, row, 3, 2, colors[i]);
    rect(104, row, 16 + i * 2, 1, p.mid);
  }
  ctx.fillStyle = p.mid;
  for (let i = 0; i < 17; i++) ctx.fillRect(x + 94 + i * 3, y + 131 + (i % 2), 3, 1);
}

export function PixelScene({
  kind,
  paused = false,
  seconds,
  onTime,
}: {
  kind: Scene;
  paused?: boolean;
  seconds?: number;
  onTime?: (time: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const control = useRef({ seconds, onTime });
  control.current = { seconds, onTime };
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    const [width, height] = {
      forest: [840, 420],
      field: [420, 190],
      recorder: [350, 220],
      signal: [480, 240],
      archive: [300, 240],
    }[kind];
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
      if (kind === "forest") drawValley(context, time);
      else if (kind === "field") contours(context, width, height, time);
      else if (kind === "recorder") recorder(context, width, height, time);
      else if (kind === "archive") drawArchive(context, time);
      else drawOptics(context, time);
    }
    function tick(now: number) {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.25) : 0;
      last = now;
      if (control.current.seconds !== undefined) time = control.current.seconds;
      else if (!paused && !media.matches) time += dt;
      clock.current = time;
      if (now - lastPaint > 30 || media.matches || paused) {
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
      ? "Animated twin-reel recorder in a night workshop: signal lights cross the mountain window, reels turn, a meter moves, and a paper strip records the session's steps."
      : kind === "forest"
        ? "An original animated pixel valley with snowy peaks, signal stations, a cable crossing, pine trees and a flowing river."
        : kind === "signal"
          ? "Four working pixel observatories in a sunlit valley: an aerial, code reader, branching signal and spinning infrastructure fan connect Agents, Code, Git and Infra."
          : kind === "archive"
            ? "An animated pixel archive in a mountain valley: an antenna receives signals, a console scans records, a field guide turns a page and a paper strip feeds below the desk."
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
