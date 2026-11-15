// Original Quoli signal-valley artwork. All scenery is painted on an integer pixel grid.
const p = {
  ink: "#172d43",
  deep: "#294e70",
  denim: "#477da8",
  mid: "#75acd0",
  blue: "#a9d8f2",
  pale: "#c7e6f7",
  ice: "#edf7fc",
  cream: "#ffe5ad",
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
  r(0, 0, 840, 420, p.pale);
  // A single panorama: open sky for the promise, inhabited ridges for the product world.
  r(695, 48, 28, 28, p.cream);
  r(691, 52, 36, 20, p.cream);
  for (let i = 0; i < 6; i++) {
    const x = ((i * 173 + time * (2 + i * 0.3)) % 1100) - 130;
    const y = 25 + (i % 3) * 33;
    r(x, y, 65 + i * 7, 2, p.ice);
    r(x + 17, y - 4, 31 + i * 3, 4, p.ice);
  }
  for (let layer = 0; layer < 4; layer++) {
    for (let x = 0; x < 840; x += 2) {
      const ridge =
        113 +
        layer * 47 +
        Math.abs(x - (699 - layer * 39)) * 0.34 +
        Math.sin(x / 43 + layer * 3) * 17 +
        noise(Math.floor(x / 7) + layer * 700) * 4;
      r(x, ridge, 2, 420 - ridge, [p.blue, p.mid, p.denim, p.deep][layer]);
      if (layer === 0 && x > 593 && x < 752) r(x, ridge, 2, 3 + noise(x) * 9, p.ice);
      if (layer === 1 && x % 14 === 0) r(x, ridge + 4, 7, 1, p.blue);
    }
  }
  // Water accelerates through the falls, then spreads into longer river reflections.
  for (let y = 224; y < 420; y++) {
    const center = 672 + Math.sin(y / 48) * (y - 180) * 0.31;
    const width = 3 + (y - 224) * 0.3;
    r(center - width / 2, y, width, 1, p.blue);
    if ((y + Math.floor(time * 25)) % 15 < 2) r(center - width / 3, y, width * 0.65, 1, p.ice);
  }
  for (let x = 422; x < 634; x++) {
    const top = 304 + Math.sin(x / 33) * 8 + noise(Math.floor(x / 5)) * 3;
    const bottom = 369 + Math.sin(x / 21) * 12;
    r(x, top, 1, bottom - top, p.deep);
    r(x, top, 1, 4, p.mid);
    if (x % 9 === 0) r(x, top + 14, 2, bottom - top - 18, p.denim);
  }
  for (let i = 0; i < 55; i++) {
    const x = 425 + noise(i + 80) * 200;
    r(x, 323 + noise(i + 200) * 27, 2 + noise(i) * 5, 1, p.mid);
  }
  for (let x = 538; x < 806; x++)
    r(x, 256 + Math.sin(((x - 538) / 268) * Math.PI) * 20, 1, 1, p.ink);
  for (const x of [541, 799]) {
    r(x, 247, 3, 88, p.deep);
    r(x - 6, 248, 15, 3, p.blue);
    r(x - 4, 286, 11, 2, p.mid);
  }
  // Three short trails make the fast signal legible without moving the landscape.
  for (let i = 0; i < 3; i++) {
    const x = 542 + ((time * 62 + i * 87) % 254);
    const y = 254 + Math.sin(((x - 538) / 268) * Math.PI) * 20;
    r(x - 10, y + 1, 8, 1, p.blue);
    r(x, y, 6, 3, p.cream);
  }
  station(ctx, 518, 309, 1.05, time * 1.6);
  station(ctx, 775, 332, 0.58, time * 1.6 + 2);
  for (let i = 0; i < 53; i++) {
    const x = i * 17 + noise(i) * 8;
    if ((x > 467 && x < 564) || (x > 640 && x < 720)) continue;
    const y = 375 - Math.min(x / 11, 64) + Math.sin(x / 30) * 12;
    pine(ctx, x, y, 13 + noise(i + 70) * 27, p.deep);
  }
  // Low foreground silhouettes connect both sides without competing with the copy.
  for (let i = 0; i < 38; i++) {
    const x = i * 25 - 12;
    if (x > 630 && x < 770) continue;
    pine(ctx, x, 438, 19 + noise(i + 9) * 36, p.ink);
  }
  for (let i = 0; i < 150; i++) {
    const x = noise(i + 3) * 840;
    const y = 404 + noise(i + 600) * 16;
    r(x, y, 1, 3 + noise(i) * 6, p.mid);
    if (i % 9 === 0) r(x - 1, y - 2, 3, 2, p.cream);
  }
  // Small flocks cross the distant sky in staggered, stepped arcs.
  for (let i = 0; i < 5; i++) {
    const x = 440 + ((time * 16 + i * 13) % 360);
    const y = 96 + i * 4 + Math.sin(time * 3 + i) * 2;
    r(x, y, 2, 1, p.deep);
    r(x + 3, y + (Math.floor(time * 7 + i) % 2 ? -1 : 1), 2, 1, p.deep);
  }
}

export function drawOptics(ctx: CanvasRenderingContext2D, time: number) {
  const r = brush(ctx);
  // Four working instruments sit in the same sunlit valley as the hero.
  r(0, 0, 480, 240, p.pale);
  r(410, 16, 18, 18, p.cream);
  r(407, 20, 24, 10, p.cream);
  for (let i = 0; i < 4; i++) {
    const cloud = ((i * 137 + time * 4) % 620) - 90;
    r(cloud, 22 + i * 12, 51, 2, p.ice);
    r(cloud + 12, 19 + i * 12, 22, 3, p.ice);
  }
  for (let x = 0; x < 480; x += 2) {
    const ridge = 54 + Math.abs(x - 310) * 0.2 + Math.sin(x / 29) * 9;
    r(x, ridge, 2, 186 - ridge, p.blue);
    if (x > 255 && x < 340) r(x, ridge, 2, 3 + noise(x) * 4, p.ice);
  }
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
    for (let j = 0; j < 5; j++) r(x - 19 + j * 10, 103, 4, 1, p.ice);
    for (let j = 0; j < 4; j++) r(x + 35, 112 + j * 12, 3, 3, p.deep);
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
    // Each room translates the signal into its own visual mechanism.
    if (i === 0) {
      const pulse = (time * 18) % 25;
      r(x - 15 - pulse, 47 - pulse / 2, 2, 2, p.cream);
      r(x + 17 + pulse, 47 - pulse / 2, 2, 2, p.cream);
    } else if (i === 1) {
      const row = Math.floor(time * 3) % 3;
      r(x - 14 + row * 3, 118 + row * 9, 29 - row * 3, 2, p.ice);
    } else if (i === 2) {
      const step = (time * 24) % 40;
      r(x - 10 + Math.max(0, step - 23), 117 + Math.min(23, step), 3, 3, p.cream);
      r(x - 20, 75, 43, 1, p.ice);
    } else {
      ctx.save();
      ctx.translate(x + 5, 135);
      ctx.rotate(time * 3);
      for (let spoke = 0; spoke < 4; spoke++) {
        ctx.rotate(Math.PI / 2);
        r(2, -1, 8, 2, p.mid);
      }
      ctx.restore();
      r(x + 3, 133, 4, 4, p.cream);
    }
    const scan = (time * 21 + i * 9) % 35;
    r(x - 17, 114 + scan, 41, 1, p.denim);
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
  for (let i = 0; i < 3; i++) {
    const packet = 25 + ((time * 65 + i * 141) % 425);
    r(packet - 8, 178, 6, 1, p.mid);
    r(packet, 177, 7, 3, p.cream);
  }
  for (let i = 0; i < 32; i++) {
    const x = i * 16;
    r(x, 231 + Math.sin(x / 20) * 2, 9, 2, p.mid);
    r(x + 3, 217 + noise(i) * 10, 1, 7, p.denim);
    if (i % 4 === 0) r(x + 2, 216 + noise(i) * 10, 3, 2, p.cream);
  }
  ctx.textAlign = "start";
}

export function drawArchive(ctx: CanvasRenderingContext2D, time: number) {
  const r = brush(ctx);
  // A field guide rests on an archive console; a signal resolves into paper records.
  r(0, 0, 300, 240, p.pale);
  r(246, 16, 16, 16, p.cream);
  for (let i = 0; i < 3; i++) {
    const x = ((i * 133 + time * 5) % 440) - 90;
    r(x, 22 + i * 13, 54, 2, p.ice);
    r(x + 12, 19 + i * 13, 24, 3, p.ice);
  }
  for (let x = 0; x < 300; x += 2) {
    const ridge = 72 + Math.abs(x - 218) * 0.25 + Math.sin(x / 33) * 9;
    r(x, ridge, 2, 240 - ridge, p.blue);
    r(x, 132 + Math.sin(x / 40) * 17, 2, 108, p.mid);
  }
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
    r(89, 87 + i * 12, 7, 7, i === Math.floor(time * 2) % 5 ? p.cream : p.mid);
    r(104, 89 + i * 12, 79 - i * 9, 2, p.blue);
    r(104, 93 + i * 12, 52 + i * 3, 1, p.denim);
  }
  // The scan head resolves a received signal into rows of recorded evidence.
  r(85, 81 + ((time * 29) % 73), 135, 1, p.mid);
  for (const x of [74, 222])
    for (const y of [69, 165]) {
      r(x, y, 3, 3, p.ice);
      r(x + 1, y, 1, 2, p.mid);
    }
  for (let i = 0; i < 8; i++) r(90 + i * 15, 169, 8, 2, p.mid);
  r(145, 39, 3, 27, p.deep);
  r(137, 43, 19, 2, p.denim);
  for (let i = 0; i < 4; i++) {
    const step = (time * 19 + i * 11) % 42;
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
  // A page edge turns and paper feeds below the archive's console.
  const page = Math.sin(time * 2.5);
  r(148, 146, 18 + page * 14, 2, p.blue);
  r(148, 148, 14 + page * 10, 1, p.ice);
  r(116, 184, 62, 3, p.ink);
  r(122, 187, 50, 36, p.ice);
  r(169, 187, 3, 36, p.blue);
  for (let i = 0; i < 5; i++) {
    const y = 190 + ((i * 6 + time * 10) % 30);
    r(128, y, 3, 2, p.denim);
    r(135, y, 24 - i * 2, 1, p.mid);
  }
  r(42, 148, 18, 28, p.mid);
  r(45, 145, 12, 6, p.cream);
  for (let i = 0; i < 3; i++)
    r(49 + Math.sin(time + i) * 2, 138 - ((time * 8 + i * 6) % 19), 2, 4, p.ice);
}
