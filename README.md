# File Tree

A [BB](https://getbb.app) plugin that shows a compact file tree of the thread workspace on the right. Type a file name to jump to it, open a file, drop its path into chat, or hand the file to Finder without leaving the thread.

## Install

```
bb plugin install git:https://github.com/fzrx-ego/bb-plugin-file-tree.git@semver:^0.10.1
```

Or search **File Tree** in BB Community.

## Use

- Type in the search box above the tree to find a file by name, by part of its path, or by a path you paste. Arrow keys move, Enter opens: the file is selected in the tree and opened in the preview, and the tree re-roots if the file lives in another project. Enter with nothing in the list falls back to resolving the text as written, which also covers folders.
- `File tree: find a file` in the command palette opens the panel with the search box focused.
- Click a file to open BB's default preview.
- Right-click to add the path to chat, copy a relative or absolute path, copy the file itself, or reveal it in Finder.
- Paths written in chat can jump the tree to that file, and so do bare file names like `AGENTS-base.md`. Search roots (default `~/Documents`) cover folders outside the current checkout.

Copy File uses the macOS or Windows file clipboard. Open in Finder uses macOS `open -R`.

## Settings

```
bb plugin config file-tree
```

- Show the tree when a thread opens
- Show ignored folders (`node_modules`, `.git`, `dist`, …)
- Root folder for personal threads — leave empty to use the personal workspace; set `~/Documents` for general BB threads. Project threads always use their project root.
- Folders to search for paths mentioned in chat

## Develop

```
npm install
bb plugin build
bb plugin reload file-tree
```

Author: [Yuriy Egorov](https://yuriy-egorov.pages.dev)
