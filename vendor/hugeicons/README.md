# Hugeicons subset

The generated `icons.ts` exports only glyphs imported by this plugin. Each export contains the unchanged SVG element data from `@hugeicons/core-free-icons@4.3.0`. The renderer is `@hugeicons/react`.

The artwork is distributed under the [MIT license](LICENSE.md). The license text comes from the [upstream repository](https://github.com/hugeicons/hugeicons/blob/81a4218a4e9c209285d579d97fd6da75a2cfb48f/LICENSE.md); the npm archive declares MIT and omits its license file.

The source archive has npm integrity `sha512-5DC5gq2psNDKBQThOjpuFCtMco8nl2FkrBzZgG15cFGM0kSwUoych/pw0DmjBygF9qRDITdBPtmzJqLsOeImMg==`.

## Regenerate

Run from the repository root after installing development dependencies. Download the pinned package into a temporary directory, without adding it to dependencies:

```sh
npm pack @hugeicons/core-free-icons@4.3.0 --pack-destination /tmp
mkdir -p /tmp/file-tree-icon-source
tar -xzf /tmp/hugeicons-core-free-icons-4.3.0.tgz -C /tmp/file-tree-icon-source
node scripts/vendor-icons.mjs /tmp/file-tree-icon-source/package
node scripts/vendor-icons.mjs /tmp/file-tree-icon-source/package --check
npm test
```

Add named imports to the existing icon modules before regenerating. The generator discovers imports from the upstream package or this local module. Keep the full package out of all dependency sections and the lockfile.
