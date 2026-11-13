import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const nativeRequire = createRequire(resolve("package.json"));
const filename = resolve("src/components/AuthButton.tsx");
const code = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function renderAuth(user, open) {
  const state = [open, user, null, false];
  const logoutCalls = [];
  let stateIndex = 0;
  const compiledModule = { exports: {} };
  const require = (name) => {
    if (name === "react") return {
      useState: () => {
        const index = stateIndex++;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useRef: (value) => ({ current: value }),
      useEffect: () => {},
    };
    if (name === "@/lib/supabase") return {
      isSupabaseConfigured: () => false,
      getBrowserSupabase: () => ({ auth: { signOut: async (options) => { logoutCalls.push(options); } } }),
    };
    return nativeRequire(name);
  };
  runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, compiledModule, compiledModule.exports);
  const tree = compiledModule.exports.default();
  return { tree, html: renderToStaticMarkup(tree), state, logoutCalls };
}

function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

const email = "private-header-test@example.invalid";
for (const user of [{ id: "test-user", email }, { id: "phone-only-user" }]) {
  for (const open of [false, true]) {
    const result = renderAuth(user, open);
    const headerButton = elements(result.tree).find(element => element.props?.["data-tutorial"] === "login");
    assert.equal(headerButton.props.children, "ログイン済み");
    assert.ok(!result.html.includes(email));
    assert.ok(!result.html.includes(email.split("@")[0]));
    assert.equal(result.html.includes("ログアウト"), open);
    if (open) {
      const logout = elements(result.tree).find(element => element.type === "button" && element.props.children === "ログアウト");
      await logout.props.onClick();
      assert.deepEqual(result.logoutCalls, [{ scope: "local" }]);
      assert.equal(result.state[1], null);
      assert.equal(result.state[0], false);
    }
  }
}
for (const open of [false, true]) {
  const result = renderAuth(null, open);
  const headerButton = elements(result.tree).find(element => element.props?.["data-tutorial"] === "login");
  assert.equal(headerButton.props.children, "ログイン");
  assert.equal(result.html.includes("ログイン済み"), false);
  assert.equal(result.html.includes("Googleでログイン"), open);
}
console.log("PASS auth display: signed-in label, no email or prefix in header/popover, email-less account, signed-out label, local logout callback (mock auth)");
