# Changelog

## 0.19.16 — 2026-11-28

- Show folder sizes with the **Размеры папок** ruler toggle in the toolbar; off by default, measured one folder at a time per host and cached for ten minutes.
- Add the **Изменения чата · Git** panel above the tree, with the `showChangesPanel` setting to hide it.
- Color folders by name or root-relative path with the **Folder colors** setting.
- Reveal shortened folder paths from chat under the search roots; path buttons belong to their own thread pane.
- Show the **Файлы | Артефакты** switch only while the Review Artifacts plugin has its panel mounted, so the tab no longer appears when that plugin is off or missing.

## 0.19.15 — 2026-11-26

- Bundle only the Hugeicons glyphs imported by File Tree, with their MIT license and a reproducible generation script.
- Remove `@hugeicons/core-free-icons` from installed dependencies to reduce installation size and per-file verification work.
- Check icon import resolution and prevent the full icon package from returning to the manifest or lockfile.
