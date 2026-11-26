import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

export const root = resolve(import.meta.dirname, '..');
export const iconModule = resolve(root, 'vendor/hugeicons/icons.ts');
export const upstream = '@hugeicons/core-free-icons';

export async function iconImports(dir = root) {
  const imports = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'vendor', 'scripts'].includes(entry.name)) continue;
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) imports.push(...await iconImports(file));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
        const specifier = node.moduleSpecifier.text;
        if (specifier !== upstream && resolve(dirname(file), specifier) !== iconModule.replace(/\.ts$/, '')) continue;
        const bindings = node.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings) || node.importClause.name) {
          throw new Error(`Use named icon imports in ${relative(root, file)}`);
        }
        imports.push({ file, specifier, names: bindings.elements.map(item => (item.propertyName ?? item.name).text) });
      }
    }
  }
  return imports;
}
