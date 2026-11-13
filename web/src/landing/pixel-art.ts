// Original Quoli signal-valley artwork. All scenery is painted on an integer pixel grid.
const p = {
  ink: "#172d43",
  deep: "#294e70",
  denim: "#477da8",
  mid: "#75acd0",
  blue: "#a9d8f2",
  pale: "#c7e6f7",
  ice: "#edf7fc",
  cream: "#fff4de",
};
const noise = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function brush(ctx: CanvasRenderingContext2D) {
  return (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
}
function pine(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const r = brush(ctx);
  r(x, y - size, 2, size, color);
  for (let i = 1; i < 7; i++) {
    const width = (i * size) / 13;
    r(x - width, y - size + (i * size) / 8, width * 2 + 2, size / 8 + 1, color);
  }
  const light = color === p.ink ? p.deep : color === p.deep ? p.denim : p.blue;
  for (let i = 1; i < 7; i++) {
    const width = (i * size) / 13;
    r(x - width, y - size + (i * size) / 8, width * 0.65, 1, light);
    for (let j = 0; j < 3; j++) {
      const dx = noise(x + i * 17 + j) * width;
      r(x - dx, y - size + (i * size) / 8 + 2, 1, 1, light);
    }
  }
}
function station(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const r = brush(ctx);
  // Stone foundation, timber walls, a copper-blue roof, lit windows and a listening mast.
  r(-26, 1, 65, 7, p.deep);
  r(-22, -29, 49, 31, p.ice);
  r(27, -26, 10, 29, p.mid);
  r(-20, -27, 46, 3, p.blue);
  for (let i = 0; i < 5; i++) r(-22, -22 + i * 5, 49, 1, p.pale);
  for (let i = 0; i < 6; i++) {
    r(-29 + i * 5, -29 - i * 4, 65 - i * 10, 4, p.deep);
    r(-29 + i * 5, -29 - i * 4, 3, 4, p.blue);
  }
  for (const wx of [-13, 5]) {
    r(wx, -21, 12, 13, p.deep);
    r(wx + 2, -19, 8, 9, p.cream);
    r(wx + 5, -19, 1, 9, p.mid);
    r(wx + 2, -15, 8, 1, p.mid);
  }
  r(21, -17, 9, 19, p.deep);
  r(23, -15, 5, 9, p.blue);
  r(-8, 2, 34, 3, p.mid);
  r(-12, 5, 42, 3, p.denim);
  r(37, -70, 2, 72, p.deep);
  r(30, -67, 17, 2, p.mid);
  r(34, -76, 8, 2, p.deep);
  r(37, -79, 2, 10, p.deep);
  const pulse = (time * 5) % 21;
  r(33 - pulse, -77 - pulse / 2, 2, 2, p.cream);
  r(43 + pulse, -77 - pulse / 2, 2, 2, p.cream);
  // Steam climbs from the chimney in discrete pixels.
  r(-17, -59, 7, 12, p.deep);
  r(-19, -61, 11, 3, p.mid);
  for (let i = 0; i < 4; i++) {
    const rise = (time * 5 + i * 7) % 30;
    r(-17 + Math.sin(rise / 8) * 4, -64 - rise, 5 + i, 2, p.ice);
  }
  ctx.restore();
}

export function drawValley(ctx: CanvasRenderingContext2D, time: number) {
  const r = brush(ctx);
  r(0, 0, 420, 340, p.pale);
  // Slow clouds occupy open sky; a stepped sun sits above the mountain ridge.
  r(325, 26, 20, 24, p.cream);
  r(321, 30, 28, 16, p.cream);
  for (let i = 0; i < 4; i++) {
    const x = ((i * 139 + time * 1.2) % 560) - 80;
    r(x, 26 + i * 16, 65, 3, p.ice);
    r(x + 14, 22 + i * 16, 29, 5, p.ice);
  }
  // Jagged mountain silhouettes and a narrow snowcap, rather than repeating sine bands.
  for (let layer = 0; layer < 3; layer++) {
    for (let x = 0; x < 420; x += 2) {
      const ridge =
        72 +
        layer * 41 +
        Math.abs(x - (285 - layer * 64)) * 0.3 +
        Math.sin(x / 31 + layer * 3) * 14 +
        noise(Math.floor(x / 8) + layer * 700) * 4;
      r(x, ridge, 2, 340 - ridge, [p.blue, p.mid, p.denim][layer]);
      if (layer === 0 && x > 215 && x < 325) r(x, ridge, 2, 4 + noise(x) * 7, p.ice);
    }
  }
  // A waterfall empties into a winding river below the inhabited ridge.
  for (let y = 165; y < 340; y++) {
    const center = 230 + Math.sin(y / 42) * (y - 130) * 0.34;
    const width = 3 + (y - 165) * 0.25;
    r(center - width / 2, y, width, 1, p.blue);
    if (y % 11 === Math.floor(time * 4) % 11) r(center - width / 3, y, width * 0.65, 1, p.ice);
  }
  // Rocky plateau supports a tiny signal station, bridge and trail.
  for (let x = 20; x < 231; x++) {
    const top = 221 + Math.sin(x / 33) * 8 + noise(Math.floor(x / 5)) * 3;
    const bottom = 278 + Math.sin(x / 21) * 12;
    r(x, top, 1, bottom - top, p.deep);
    r(x, top, 1, 5, p.mid);
    if (x % 9 === 0) r(x, top + 14, 2, bottom - top - 18, p.denim);
  }
  for (let i = 0; i < 55; i++) {
    const x = 23 + noise(i + 80) * 200;
    r(x, 237 + noise(i + 200) * 27, 2 + noise(i) * 5, 1, p.mid);
  }
  // Cable spans the valley. A cream packet travels to the receiving tower.
  for (let x = 135; x < 397; x++)
    r(x, 175 + Math.sin(((x - 135) / 262) * Math.PI) * 22, 1, 1, p.deep);
  for (const x of [139, 389]) {
    r(x, 166, 3, 86, p.deep);
    r(x - 6, 167, 15, 3, p.blue);
    r(x - 4, 205, 11, 2, p.mid);
  }
  const packetX = 140 + ((time * 11) % 248);
  const packetY = 173 + Math.sin(((packetX - 135) / 262) * Math.PI) * 22;
  r(packetX, packetY, 7, 5, p.cream);
  r(packetX + 2, packetY + 5, 3, 4, p.deep);
  station(ctx, 120, 228, 1.05, time);
  station(ctx, 365, 249, 0.55, time + 2);
  for (let i = 0; i < 28; i++) {
    const x = i * 16 + noise(i) * 8;
    if (x > 75 && x < 175) continue;
    pine(ctx, x, 246 + Math.sin(x / 28) * 10, 15 + noise(i + 70) * 25, p.deep);
  }
  // Foreground frames the valley with distinct branches, stones and cream flowers.
  for (let i = 0; i < 19; i++) {
    const x = i * 25 - 12;
    if (x > 180 && x < 330) continue;
    pine(ctx, x, 345, 42 + noise(i + 9) * 49, p.ink);
  }
  for (let i = 0; i < 85; i++) {
    const x = noise(i + 3) * 420;
    const y = 320 + noise(i + 600) * 20;
    r(x, y, 1, 3 + noise(i) * 6, p.mid);
    if (i % 7 === 0) r(x - 1, y - 2, 3, 2, p.cream);
  }
  for (let i = 0; i < 9; i++) {
    const x = (noise(i + 300) * 420 + time * 3) % 420;
    r(x, 130 + noise(i) * 140 + Math.sin(time + i) * 4, 1, 1, p.cream);
  }
}

export function drawOptics(ctx: CanvasRenderingContext2D, time: number) {
  const r = brush(ctx);
  // Four distinct observatory rooms share one signal conduit, fitted into a hillside.
  r(0, 0, 480, 240, p.pale);
  for (let x = 0; x < 480; x += 2) {
    const y = 105 + Math.sin(x / 64) * 18 + noise(Math.floor(x / 8)) * 3;
    r(x, y, 2, 135, p.blue);
  }
  for (let i = 0; i < 24; i++) pine(ctx, i * 23, 169, 13 + noise(i) * 30, p.mid);
  r(16, 175, 448, 18, p.deep);
  r(12, 171, 456, 5, p.ice);
  for (let i = 0; i < 28; i++) r(20 + i * 16, 182, 9, 2, p.denim);
  const names = ["AGENTS", "CODE", "GIT", "INFRA"];
  for (let i = 0; i < 4; i++) {
    const x = 53 + i * 115;
    r(x - 28, 94, 65, 77, p.denim);
    r(x - 24, 98, 57, 69, p.ice);
    r(x + 33, 98, 7, 73, p.mid);
    r(x - 19, 111, 46, 39, p.ink);
    r(x - 22, 108, 52, 3, p.blue);
    r(x - 22, 150, 52, 4, p.blue);
    r(x - 31, 88, 74, 6, p.deep);
    // Each roof has its own silhouette: aerial, angled solar roof, dome, twin stacks.
    if (i === 0) {
      r(x, 49, 3, 39, p.deep);
      for (let k = 0; k < 3; k++) r(x - 15 + k * 3, 55 + k * 9, 33 - k * 6, 2, p.denim);
    } else if (i === 1) {
      for (let k = 0; k < 6; k++) r(x - 31 + k * 8, 82 - k * 3, 34, 4, p.denim);
      for (let k = 0; k < 5; k++) r(x - 19 + k * 10, 79 - k * 3, 1, 7, p.blue);
    } else if (i === 2) {
      for (let k = 0; k < 5; k++) r(x - 26 + k * 4, 83 - k * 5, 55 - k * 8, 5, p.mid);
      r(x + 5, 55, 3, 29, p.ice);
    } else {
      r(x - 18, 61, 12, 27, p.deep);
      r(x + 13, 53, 12, 35, p.deep);
      for (const sx of [-18, 13])
        for (let k = 0; k < 3; k++) r(x + sx + 2, 66 + k * 7, 8, 2, p.blue);
    }
    if (i < 2) {
      for (let k = 0; k < 3; k++) {
        r(x - 13 + (i ? k * 3 : 0), 118 + k * 9, 3, 3, p.cream);
        r(x - 5 + (i ? k * 3 : 0), 118 + k * 9, 14 - k * 2, 2, p.blue);
      }
    } else {
      r(x - 9, 117, 2, 25, p.blue);
      r(x - 7, 138, 23, 2, p.blue);
      r(x + 13, 123, 2, 17, p.blue);
      for (const [nx, ny] of [
        [-12, 117],
        [-12, 134],
        [10, 121],
      ])
        r(x + nx, ny, 7, 6, p.cream);
      if (i === 3) r(x, 124, 7, 6, p.blue);
    }
    r(x - 16, 158, 39, 4, p.mid);
    r(x - 16, 197, 44, 12, p.deep);
    ctx.font = "7px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = p.ice;
    ctx.fillText(names[i], x + 6, 206);
    if (i < 3) {
      r(x + 40, 133, 43, 2, p.deep);
      r(x + 50, 129, 4, 10, p.cream);
    }
  }
  const packet = 25 + ((time * 28) % 425);
  r(packet, 177, 9, 3, p.cream);
  for (let i = 0; i < 32; i++) {
    const x = i * 16;
    r(x, 231 + Math.sin(x / 20) * 2, 9, 2, p.mid);
  }
  ctx.textAlign = "start";
}

export function drawArchive(ctx: CanvasRenderingContext2D, time: number) {
  const r = brush(ctx);
  // A field guide rests on an archive console; a signal resolves into paper records.
  r(0, 0, 300, 240, p.pale);
  for (let x = 0; x < 300; x += 2) r(x, 118 + Math.sin(x / 40) * 17, 2, 122, p.blue);
  for (let i = 0; i < 13; i++) pine(ctx, i * 26, 174, 12 + noise(i) * 24, p.mid);
  r(38, 183, 224, 10, p.deep);
  r(32, 178, 236, 6, p.ice);
  r(50, 193, 8, 26, p.denim);
  r(245, 193, 8, 26, p.denim);
  r(68, 70, 164, 106, p.deep);
  r(72, 66, 156, 107, p.denim);
  r(77, 72, 146, 92, p.blue);
  r(82, 77, 136, 81, p.ink);
  for (let i = 0; i < 5; i++) {
    r(89, 87 + i * 12, 7, 7, i === Math.floor(time / 2) % 5 ? p.cream : p.mid);
    r(104, 89 + i * 12, 79 - i * 9, 2, p.blue);
    r(104, 93 + i * 12, 52 + i * 3, 1, p.denim);
  }
  r(145, 39, 3, 27, p.deep);
  r(137, 43, 19, 2, p.denim);
  for (let i = 0; i < 4; i++) {
    const step = (time * 6 + i * 11) % 42;
    r(145 - step, 32 - step / 3, 2, 2, p.cream);
    r(149 + step, 32 - step / 3, 2, 2, p.cream);
  }
  // Open field guide: stepped edges, bound spine and fine printed lines.
  r(89, 168, 118, 8, p.deep);
  r(94, 148, 51, 25, p.cream);
  r(148, 148, 51, 25, p.ice);
  r(99, 145, 42, 3, p.cream);
  r(152, 145, 42, 3, p.ice);
  r(145, 150, 3, 26, p.mid);
  for (let i = 0; i < 4; i++) {
    r(102, 153 + i * 5, 31 - i * 3, 1, p.denim);
    r(155, 153 + i * 5, 31 - i * 3, 1, p.mid);
  }
  r(42, 148, 18, 28, p.mid);
  r(45, 145, 12, 6, p.cream);
  for (let i = 0; i < 3; i++)
    r(49 + Math.sin(time + i) * 2, 138 - ((time * 4 + i * 6) % 19), 2, 4, p.ice);
}
