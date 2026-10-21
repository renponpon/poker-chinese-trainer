import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(resolve("package.json"));
const modules = new Map();

export function loadSource(path, sourceRoot = resolve("src")) {
  const filename = path.endsWith(".ts") ? path : path + ".ts";
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = { exports: {} };
  modules.set(filename, compiledModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (name) => {
    const target = name.startsWith(".") ? resolve(dirname(filename), name) : name.startsWith("@/") ? resolve(sourceRoot, name.slice(2)) : null;
    return target ? loadSource(target, sourceRoot) : nativeRequire(name);
  };
  runInThisContext("(function(require,module,exports){" + code + "\n})", { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
