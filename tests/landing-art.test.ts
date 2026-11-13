import assert from "node:assert/strict";
import { test } from "node:test";
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
