import assert from "node:assert/strict";
import { test } from "node:test";
import { composerScopeKey, getChatTargets, registerChatTarget, requestAddToChat } from "./chat-draft-bus";

test("a file path reaches only the selected composer scope", () => {
  const received: string[] = [];
  const thread = { kind: "thread" as const, threadId: "thread-a" };
  const side = { kind: "side-chat" as const, projectId: "project-a", parentThreadId: "thread-a", tabId: "tab-b", childThreadId: null };
  const stopThread = registerChatTarget(thread, (path) => received.push(`thread:${path}`));
  const stopSide = registerChatTarget(side, (path) => received.push(`side:${path}`));
  try {
    assert.equal(getChatTargets().length, 2);
    assert.equal(requestAddToChat(composerScopeKey(side), "/project/file.md"), true);
    assert.deepEqual(received, ["side:/project/file.md"]);
    assert.equal(requestAddToChat(composerScopeKey(thread), "/project/other.md"), true);
    assert.deepEqual(received, ["side:/project/file.md", "thread:/project/other.md"]);
  } finally {
    stopSide();
    stopThread();
  }
  assert.equal(requestAddToChat(composerScopeKey(side), "/project/file.md"), false);
});

test("closing one pane keeps another pane's composer target", () => {
  const scope = { kind: "thread" as const, threadId: "thread-a" };
  const received: string[] = [];
  const stopFirst = registerChatTarget(scope, (path) => received.push(`first:${path}`));
  const stopSecond = registerChatTarget(scope, (path) => received.push(`second:${path}`));
  stopSecond();
  try {
    assert.equal(requestAddToChat(composerScopeKey(scope), "file.md"), true);
    assert.deepEqual(received, ["first:file.md"]);
  } finally {
    stopFirst();
  }
});
