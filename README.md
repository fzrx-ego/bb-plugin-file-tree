# File Tree

A [BB](https://getbb.app) plugin that keeps a file tree open across threads. Choose a project source or thread workspace as its pinned folder. Switching threads leaves the folder, expanded directories, and selection in place.

## Install

```
bb plugin install git:https://github.com/fzrx-ego/bb-plugin-file-tree.git@semver:^0.19.0
```

Or search **File Tree** in BB Community.

## Use

- Visible expanded folders update automatically when chat tools or other apps create, rename, or delete files. Hidden panels and hidden windows release their watches; showing the tree reconciles its contents. Watching does not traverse collapsed folders.
- Type in the search box above the tree to find a file by name, by part of its path, or by a path you paste. Arrow keys move, Enter selects the file in the tree and opens its preview on a thread or New Thread page; the tree re-roots if the file lives in another project. Enter with nothing in the list falls back to resolving the text as written, which also covers folders.
- Choose the pinned folder from the selector above search. Project sources and the current thread workspace are listed; the choice survives BB restarts. A search hit or chat path can temporarily show another folder. Click its root name to return to the pinned folder.
- Use the File Tree button in the window's top-right corner, next to BB's panel button, or in the sidebar footer to show or hide the tree on any BB page. Without BB's framed title bar (narrow window, web) the button sits in the thread header. The New thread composer also provides a button.
- In BB's framed desktop window the tree is a card beside the thread, aligned to BB's own cards.
- Drag the tree's left edge to resize it. Double-click the edge to reset the width.
- `File tree: find a file` in the command palette opens the panel with the search box focused.
- Files show Seti-style type icons (markdown, JSON, git, `.env`, README, TypeScript, …), as in Cursor. Folders keep only the chevron.
- In a thread or on the New Thread page, click a file to open BB's default preview. On the New Thread page BB previews only files of the thread environment; open a file of another project from a thread.
- Right-click a file to open it in the external editor when the current BB page has no preview panel.
- Right-click a Markdown file and choose Open in preview to see it in BB's standard preview when Markdown PRO would open it in its editor.
- Right-click to add the absolute path to an open chat draft, create a blank `.md` in that folder, delete a file, copy a relative or absolute path, copy the file itself, or reveal it in Finder. When several drafts are open, choose the target in the file menu. Right-click the root name at the top of the tree to create the file there. A new markdown file is named `untitled.md` (or `untitled-2.md`, …) and opens in the external editor so you can paste into it. Delete asks for confirmation and only applies to files, not folders.
- File links to documents in the current thread storage also have a reveal-in-tree button, including PDF and ZIP links with descriptive labels.
- Paths written in chat can jump the tree to that file, and so do bare file names like `AGENTS-base.md`. Search roots (default `~/Documents`) cover folders outside the current checkout.

Copy File uses the macOS or Windows file clipboard. Open in Finder uses macOS `open -R`. These actions are available for files on this computer.

## Settings

```
bb plugin config file-tree
```

- Show the pinned tree when BB opens
- Show hidden and ignored folders (`.claude`, `node_modules`, `.git`, …)
- Root folder for personal threads — set `~/Documents` to offer it as a pinned folder. Project sources and thread workspaces are also available in the folder selector.
- Folders to search for paths mentioned in chat

## Develop

```
npm install
bun test
./node_modules/.bin/tsc --noEmit
bb plugin build
bb plugin reload file-tree
```

Author: [Yuriy Egorov](https://yuriy-egorov.pages.dev)
