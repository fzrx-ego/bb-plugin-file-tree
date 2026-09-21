import assert from "node:assert/strict";
import { test } from "node:test";
import { createTimedCache } from "./timed-cache.ts";

test("recall returns a value stored for the same scope", () => {
  const cache = createTimedCache<boolean>(1_000);
  cache.remember("thread-a", "README.md", true, 100);
  cache.remember("thread-b", "README.md", false, 100);
  assert.equal(cache.recall("thread-a", 500).get("README.md"), true);
  assert.equal(cache.recall("thread-b", 500).get("README.md"), false);
});

test("recall drops an entry once its own age reaches the ttl", () => {
  const cache = createTimedCache<boolean>(1_000);
  cache.remember("thread-a", "old.md", false, 0);
  cache.remember("thread-a", "new.md", true, 900);
  const fresh = cache.recall("thread-a", 1_000);
  assert.equal(fresh.has("old.md"), false);
  assert.equal(fresh.get("new.md"), true);
  assert.equal(cache.recall("thread-a", 1_900).has("new.md"), false);
});

test("a later remember does not extend an older entry", () => {
  const cache = createTimedCache<string>(1_000);
  cache.remember("thread-a", "old.md", "miss", 0);
  cache.remember("thread-a", "new.md", "hit", 900);
  const fresh = cache.recall("thread-a", 1_000);
  assert.equal(fresh.has("old.md"), false);
  assert.equal(fresh.get("new.md"), "hit");
});
