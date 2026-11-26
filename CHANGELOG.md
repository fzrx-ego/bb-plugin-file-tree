# Changelog

## 0.19.15 — 2026-11-26

- Bundle only the Hugeicons glyphs imported by File Tree, with their MIT license and a reproducible generation script.
- Remove `@hugeicons/core-free-icons` from installed dependencies to reduce installation size and per-file verification work.
- Check icon import resolution and prevent the full icon package from returning to the manifest or lockfile.
