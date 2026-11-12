// Original artwork uses the landing palette; all coordinates are on an integer pixel grid.
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

export function drawOptics(ctx: CanvasRenderingContext2D, time: number) {
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  // Fitted rail, feet and four optical housings: one signal, four ways to inspect it.
  rect(20, 196, 440, 4, p.pale);
  rect(40, 200, 400, 8, p.blue);
  rect(46, 208, 390, 4, p.denim);
  for (const x of [64, 396]) {
    rect(x, 212, 22, 12, p.deep);
    rect(x - 4, 222, 30, 4, p.denim);
  }
  const names = ["AGENTS", "CODE", "GIT", "INFRA"];
  const heights = [112, 88, 106, 76];
  for (let i = 0; i < 4; i++) {
    const x = 76 + i * 108;
    const y = heights[i];
    rect(x - 10, y + 26, 20, 196 - y - 26, p.mid);
    rect(x - 6, y + 26, 5, 196 - y - 26, p.pale);
    rect(x - 23, 188, 46, 8, p.denim);
    rect(x - 25, y - 29, 50, 58, p.deep);
    rect(x - 29, y - 25, 58, 50, p.denim);
    rect(x - 25, y - 25, 50, 48, p.blue);
    rect(x - 19, y - 21, 38, 42, p.ice);
    rect(x - 23, y - 17, 46, 34, p.pale);
    rect(x - 17, y - 15, 34, 30, p.mid);
    rect(x - 13, y - 13, 26, 26, p.deep);
    // Each lens contains its own tiny diagram, rather than four interchangeable icons.
    if (i === 0) {
      for (let row = 0; row < 3; row++) {
        rect(x - 9, y - 8 + row * 7, 3, 3, p.cream);
        rect(x - 2, y - 8 + row * 7, 11 - row * 2, 2, p.blue);
      }
    } else if (i === 1) {
      rect(x - 6, y - 9, 12, 18, p.ice);
      for (let row = 0; row < 3; row++) rect(x - 3, y - 5 + row * 4, 7, 1, p.denim);
    } else {
      rect(x - 7, y - 7, 2, 15, p.blue);
      rect(x - 5, y + 5, 12, 2, p.blue);
      rect(x + 5, y - 5, 2, 10, p.blue);
      for (const [nx, ny] of [
        [-8, -9],
        [-8, 5],
        [4, -7],
      ])
        rect(x + nx, y + ny, 5, 5, p.cream);
      if (i === 3) rect(x - 2, y - 2, 5, 5, p.blue);
    }
    rect(x - 19, y - 19, 11, 2, p.ice);
    rect(x - 21, y - 17, 2, 9, p.ice);
    for (const sx of [-22, 20]) {
      rect(x + sx, y - 23, 2, 2, p.deep);
      rect(x + sx, y + 21, 2, 2, p.deep);
    }
    rect(x - 17, y + 39, 34, 11, p.deep);
    ctx.font = "6px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = p.ice;
    ctx.fillText(names[i], x, y + 47);
    // Stepped cable follows the different lens heights.
    if (i < 3) {
      rect(x + 29, y - 1, 25, 2, p.denim);
      rect(x + 52, Math.min(y, heights[i + 1]), 2, Math.abs(y - heights[i + 1]) + 2, p.denim);
      rect(x + 52, heights[i + 1] - 1, 27, 2, p.denim);
    }
  }
  const packet = 42 + ((time * 22) % 396);
  rect(packet, 199, 7, 3, p.cream);
  for (let i = 0; i < 9; i++) {
    const x = 24 + i * 51;
    const y = 25 + (i % 3) * 9;
    const phase = Math.sin(time * 0.7 + i);
    rect(x, y + Math.round(phase * 2), 2, 2, p.mid);
  }
  // Calibration sheet rests beside the first lens.
  rect(8, 161, 28, 31, p.blue);
  rect(6, 159, 27, 30, p.ice);
  for (let i = 0; i < 4; i++) rect(11, 166 + i * 5, 15 - (i % 2) * 4, 1, p.denim);
  ctx.textAlign = "start";
}

export function drawWorkbench(ctx: CanvasRenderingContext2D, time: number) {
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  // A full square studio scene: a moving landscape through the window, desk in front.
  rect(0, 0, 400, 400, p.pale);
  rect(0, 338, 400, 62, p.blue);
  for (let y = 350; y < 400; y += 14) rect(0, y, 400, 1, p.mid);
  for (let x = 15; x < 400; x += 65) rect(x, 338, 1, 62, p.mid);
  rect(18, 22, 364, 208, p.denim);
  rect(23, 27, 354, 197, p.ice);
  rect(28, 32, 344, 186, p.pale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(28, 32, 344, 186);
  ctx.clip();
  for (let band = 0; band < 4; band++) {
    for (let x = 28; x < 372; x += 2) {
      const y = 80 + band * 36 + Math.sin(x / (57 - band * 6) + time * 0.025 + band) * 19;
      rect(x, y, 2, 220 - Math.round(y), [p.ice, p.blue, p.mid, p.denim][band]);
    }
  }
  rect(310, 49, 14, 14, p.cream);
  rect(307, 52, 20, 8, p.cream);
  const cloud = 20 + ((time * 2) % 410);
  rect(cloud, 57, 43, 5, p.ice);
  rect(cloud + 8, 52, 24, 5, p.ice);
  for (let x = 28; x < 372; x += 13) {
    const height = 9 + Math.round((Math.sin(x * 2.3) + 1) * 10);
    rect(x, 205 - height, 3, height, p.deep);
    rect(x - 3, 209 - height, 9, 3, p.deep);
    rect(x - 5, 214 - height, 13, 3, p.deep);
  }
  ctx.restore();
  rect(196, 28, 6, 194, p.ice);
  rect(24, 217, 352, 7, p.blue);
  rect(14, 228, 372, 8, p.mid);
  rect(14, 226, 372, 3, p.ice);
  ctx.save();
  ctx.translate(0, 140);
  // Lamp, warm pool of light, monitor, paper notes and a cup share one supported desk.
  ctx.fillStyle = p.cream;
  ctx.beginPath();
  ctx.moveTo(302, 47);
  ctx.lineTo(228, 174);
  ctx.lineTo(374, 174);
  ctx.closePath();
  ctx.fill();
  rect(24, 174, 352, 9, p.mid);
  rect(24, 183, 352, 4, p.deep);
  rect(36, 187, 9, 37, p.denim);
  rect(354, 187, 9, 37, p.denim);
  rect(45, 212, 309, 4, p.blue);
  rect(87, 53, 148, 103, p.denim);
  rect(91, 49, 140, 103, p.blue);
  rect(95, 53, 132, 4, p.ice);
  rect(100, 62, 122, 76, p.deep);
  rect(105, 66, 112, 68, p.ink);
  // A miniature connected map on the screen, explicitly an illustration.
  const nodes = [
    [124, 84],
    [158, 77],
    [189, 99],
    [146, 113],
  ];
  ctx.strokeStyle = p.denim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [x, y] of nodes) {
    ctx.moveTo(158, 99);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < nodes.length; i++) {
    const [x, y] = nodes[i];
    rect(x - 6, y - 4, 14, 9, p.mid);
    rect(x - 4, y - 2, 9, 2, i === Math.floor(time / 2) % 4 ? p.cream : p.ice);
  }
  rect(153, 94, 12, 10, p.blue);
  rect(157, 98, 4, 3, p.cream);
  rect(150, 153, 27, 15, p.denim);
  rect(133, 167, 62, 7, p.blue);
  rect(205, 143, 9, 3, p.ice);
  // Keyboard: three staggered rows of fitted keys.
  rect(94, 164, 127, 8, p.denim);
  for (let row = 0; row < 3; row++)
    for (let key = 0; key < 15; key++) rect(98 + key * 8 + (row % 2), 165 + row * 2, 5, 1, p.ice);
  rect(303, 52, 5, 112, p.denim);
  rect(293, 158, 26, 7, p.mid);
  rect(280, 165, 49, 8, p.denim);
  rect(277, 43, 55, 7, p.denim);
  rect(284, 34, 41, 10, p.mid);
  rect(293, 29, 23, 6, p.blue);
  rect(282, 50, 45, 3, p.cream);
  // Two closed notebooks and a loose page.
  rect(245, 148, 37, 10, p.denim);
  rect(248, 150, 32, 5, p.ice);
  rect(240, 159, 45, 12, p.blue);
  rect(243, 162, 39, 5, p.ice);
  rect(260, 159, 3, 14, p.denim);
  rect(331, 145, 17, 26, p.ice);
  rect(348, 150, 6, 13, p.mid);
  rect(348, 153, 3, 7, p.cream);
  rect(333, 144, 13, 3, p.deep);
  for (let i = 0; i < 3; i++) {
    const y = 136 - ((time * 7 + i * 7) % 22);
    rect(336 + Math.sin(time + i) * 3, y, 2, 5, p.mid);
  }
  // A blue fern balances the lamp; its leaves sway by one pixel.
  rect(51, 152, 23, 20, p.denim);
  rect(48, 148, 29, 5, p.blue);
  rect(61, 101, 2, 47, p.denim);
  for (let i = 0; i < 5; i++) {
    const y = 105 + i * 8;
    const sway = Math.round(Math.sin(time * 0.6 + i));
    rect(49 - (i % 2) * 4 + sway, y, 14, 3, p.mid);
    rect(62 + sway, y + 4, 14 + (i % 2) * 4, 3, p.denim);
  }
  ctx.restore();
}
