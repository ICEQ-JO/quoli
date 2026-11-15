import assert from "node:assert/strict";
import { test } from "node:test";
import { contours, recorder } from "../web/src/landing/PixelScene.tsx";
import { drawArchive, drawOptics, drawValley } from "../web/src/landing/pixel-art.ts";

// Record real drawing commands without requiring a browser or a native canvas dependency.
function paint(draw: (ctx: CanvasRenderingContext2D, time: number) => void, time: number) {
  const commands: unknown[][] = [];
  const context = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args: unknown[]) => {
          for (const value of args)
            if (typeof value === "number")
              assert.ok(Number.isFinite(value), `${String(name)} coordinate`);
          commands.push([name, ...args]);
        },
      set: (_, name, value) => {
        commands.push([name, value]);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  draw(context, time);
  return commands;
}

for (const draw of [drawArchive, drawOptics, drawValley]) {
  test(`${draw.name}: artwork is finite, deterministic when paused, and changes with time`, () => {
    const still = paint(draw, 0);
    assert.ok(still.length > 100, "the illustration actually draws its fitted parts");
    assert.deepEqual(paint(draw, 0), still);
    assert.notDeepEqual(paint(draw, 3), still);
    paint(draw, 1_000_000);
  });
}

test("hero paints a full panorama and signals move within a short interval", () => {
  const still = paint(drawValley, 0);
  assert.ok(
    still.some(
      ([op, x, y, w, h]) => op === "fillRect" && x === 0 && y === 0 && w === 840 && h === 420,
    ),
  );
  assert.ok(still.some(([op, x, y]) => op === "fillRect" && Number(x) < 100 && Number(y) > 350));
  assert.notDeepEqual(paint(drawValley, 0.1), still);
});

for (const [name, draw] of [
  [
    "survey contours",
    (ctx: CanvasRenderingContext2D, time: number) => contours(ctx, 420, 190, time),
  ],
  [
    "listening workshop",
    (ctx: CanvasRenderingContext2D, time: number) => recorder(ctx, 350, 220, time),
  ],
] as const) {
  test(`${name}: complete drawing stays deterministic and animates without invalid coordinates`, () => {
    const still = paint(draw, 0);
    assert.ok(still.length > 100);
    assert.deepEqual(paint(draw, 0), still);
    assert.notDeepEqual(paint(draw, 0.2), still);
    paint(draw, 1_000_000);
  });
}
