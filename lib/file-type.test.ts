import assert from "node:assert/strict";
import { test } from "node:test";
import { fileTypeIcon } from "./file-type.ts";

const icon = (name: string) => fileTypeIcon(name).id;

test("README.md uses the info icon", () => {
  assert.equal(icon("README.md"), "_info");
  assert.equal(icon("docs/readme.md"), "_info");
});

test("markdown files use the markdown icon", () => {
  assert.equal(icon("AGENTS.md"), "_markdown");
  assert.equal(icon("notes.mdx"), "_markdown");
});

test("languages Seti maps only by language id resolve through their extensions", () => {
  assert.equal(icon("solver.jl"), "_julia");
  assert.equal(icon("server.ts"), "_typescript");
  assert.equal(icon("main.py"), "_python");
  assert.equal(icon("paper.tex"), "_tex");
  assert.equal(icon("mcp.json"), "_json");
});

test("the longest matching extension wins", () => {
  assert.equal(icon("app.tsx"), "_react");
  assert.notEqual(icon("app.test.ts"), icon("app.ts"));
});

test("file names beat extensions, case-insensitively", () => {
  assert.equal(icon("tsconfig.json"), "_tsconfig");
  assert.equal(icon("Dockerfile"), "_docker");
  assert.equal(icon("go.mod"), "_go");
});

test("dotfiles keep their git and config icons", () => {
  assert.equal(icon(".gitignore"), "_git");
  assert.equal(icon(".cursorignore"), "_git");
  assert.equal(icon(".env"), "_config");
  assert.equal(icon(".env.local"), "_config");
});

test("every icon has a glyph and both theme colors", () => {
  const { glyph, color, lightColor } = fileTypeIcon("solver.jl");
  assert.equal(glyph.length, 1);
  assert.match(color, /^#[0-9a-f]{6}$/u);
  assert.match(lightColor, /^#[0-9a-f]{6}$/u);
  assert.notEqual(color, lightColor);
});

test("unknown files fall back to the default icon", () => {
  assert.equal(icon("weird.bin"), "_default");
  assert.equal(icon("Makefile.bak.unknownext"), "_default");
});
