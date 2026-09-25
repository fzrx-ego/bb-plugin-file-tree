import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeRailOpen, RAIL_EVENT, toggleRailOpen } from "./rail-state";

test("first toggle opens a rail whose default setting is closed", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  const events: boolean[] = [];
  const target = new EventTarget();
  target.addEventListener(RAIL_EVENT, (event) => {
    events.push((event as CustomEvent<boolean>).detail);
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
  });
  try {
    assert.equal(initializeRailOpen(false), false);
    toggleRailOpen();
    assert.deepEqual(events, [false, true]);
    assert.equal(values.get("bb-plugin-file-tree:rail-open"), "1");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
