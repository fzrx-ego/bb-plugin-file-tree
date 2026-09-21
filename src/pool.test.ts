import assert from "node:assert/strict";
import { test } from "node:test";
import { mapLimit } from "./pool.ts";

test("mapLimit keeps later items when one slot is empty", async () => {
  const seen: number[] = [];
  const results = await mapLimit([1, undefined, 3] as const, 1, async (item) => {
    seen.push(item);
    return item * 2;
  });
  assert.deepEqual(seen, [1, 3]);
  assert.equal(results[0], 2);
  assert.equal(results[1], undefined);
  assert.equal(results[2], 6);
});

test("mapLimit runs at most `limit` calls at once", async () => {
  let current = 0;
  let peak = 0;
  await mapLimit([1, 2, 3, 4], 2, async () => {
    current += 1;
    peak = Math.max(peak, current);
    await new Promise((resolve) => setTimeout(resolve, 10));
    current -= 1;
    return 0;
  });
  assert.equal(peak, 2);
});
