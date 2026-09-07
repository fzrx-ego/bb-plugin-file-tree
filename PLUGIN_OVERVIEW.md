Shows a compact file tree of the thread workspace on the right.

## Who it is for

People who already work in a BB thread and keep hitting paths: an agent cites a file, they need that file in chat, in the preview, or on the Desktop. The next step is still in the thread, not a full file manager.

Not for people whose job is to upload, move, rename, or unzip under `$HOME`. That is a different product.

## What you get

The tree sits on the right of the thread. Click a file to open BB's default preview. Right-click to add the relative path to the draft, copy a relative or absolute path, copy the file itself onto the clipboard, or reveal the item in Finder.

When a message names a path, the tree can jump to it. If that path lives in another folder under your search roots, the tree re-roots there instead of reporting a miss.

## How it works

The tree is the thread checkout, not a second workspace. Ignored folders (`node_modules`, `.git`, `dist`, …) stay hidden unless you turn them on in settings. Search roots (default `~/Documents`, one path per line) are the extra places a chat path may land.

Open in Finder and Copy File run on the machine that holds the files. Copy File puts a real file on the macOS or Windows clipboard so Finder paste drops a copy, not a string. Finder reveal uses macOS `open -R`.

## First step

Install File Tree, open a thread, and leave the tree open on the right. Click a file you already know. Then right-click the same file: copy it, paste into Finder, and confirm a real copy appeared.
