import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as icons from '../vendor/hugeicons/icons';
// @ts-ignore Node-only tooling shared with the regeneration script.
import { iconImports, root, upstream } from '../scripts/icon-imports.mjs';

test('all imported icons resolve to the exact vendored export set', async () => {
  const imports = await iconImports();
  assert.ok(imports.length > 0);
  const names = new Set<string>();
  for (const item of imports) {
    assert.notEqual(item.specifier, upstream, item.file);
    for (const name of item.names) {
      assert.ok(Object.hasOwn(icons, name), `${name} in ${item.file}`);
      const icon = icons[name as keyof typeof icons];
      assert.ok(Array.isArray(icon) && icon.length > 0, name);
      for (const [tag, attributes] of icon) {
        assert.equal(typeof tag, 'string', name);
        assert.equal(typeof attributes, 'object', name);
      }
      names.add(name);
    }
  }
  assert.deepEqual([...names].sort(), Object.keys(icons).sort());
});

test('the full icon package is absent from every dependency section and the lockfile', async () => {
  for (const filename of ['package.json', 'package-lock.json']) {
    const content = await readFile(`${root}/${filename}`, 'utf8');
    assert.ok(!content.includes(upstream), `${upstream} found in ${filename}`);
  }
  const license = await readFile(`${root}/vendor/hugeicons/LICENSE.md`, 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright.*Hugeicons/);
});
