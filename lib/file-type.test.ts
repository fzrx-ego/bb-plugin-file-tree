import assert from "node:assert/strict";
import { test } from "node:test";
import { SETI, fileTypeIcon } from "./file-type.ts";

test("README.md uses the info glyph", () => {
  assert.equal(fileTypeIcon("README.md").glyph, "info");
  assert.equal(fileTypeIcon("docs/readme.md").glyph, "info");
});

test("markdown files use the markdown glyph", () => {
  assert.equal(fileTypeIcon("AGENTS.md").glyph, "markdown");
  assert.equal(fileTypeIcon("CLAUDE.md").color, SETI.blue);
});

test("json files use braces", () => {
  assert.equal(fileTypeIcon("mcp.json").glyph, "json");
  assert.equal(fileTypeIcon(".mcp.json").glyph, "json");
  assert.equal(fileTypeIcon("package.json").glyph, "npm");
});

test("git ignore files use the git glyph", () => {
  assert.equal(fileTypeIcon(".gitignore").glyph, "git");
  assert.equal(fileTypeIcon(".cursorignore").glyph, "git");
});

test("env files use the config glyph", () => {
  assert.equal(fileTypeIcon(".env").glyph, "config");
  assert.equal(fileTypeIcon(".env.local").glyph, "config");
});

test("typescript and react split", () => {
  assert.equal(fileTypeIcon("app.tsx").glyph, "react");
  assert.equal(fileTypeIcon("server.ts").glyph, "code");
});

test("unknown files fall back to default", () => {
  assert.equal(fileTypeIcon("weird.bin").glyph, "default");
});
