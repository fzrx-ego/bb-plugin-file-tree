import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? 'node_modules');
let files = 0;
let bytes = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) { files++; bytes += (await stat(path)).size; }
  }
}
await walk(root);
console.log(JSON.stringify({ root, files, bytes, MB: bytes / 1e6 }));
