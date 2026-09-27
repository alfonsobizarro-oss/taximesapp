/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
module.exports = function load(file) {
  const full = path.resolve(__dirname, '..', file);
  if (cache.has(full)) return cache.get(full).exports;
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const m = {exports: {}}; cache.set(full, m);
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? module.exports(path.resolve(path.dirname(full), name.endsWith('.ts') ? name : name + '.ts')) : require(name), m, m.exports);
  return m.exports;
};
