import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outDir = mkdtempSync(join(tmpdir(), "phrabit-domain-tests-"));
const tscEntry = join(workspace, "node_modules", "typescript", "bin", "tsc");

const sourceFiles = findFiles(join(workspace, "src"), (file) =>
  /[\\/](domain|application)[\\/].+\.ts$/.test(file),
);

try {
  run(process.execPath, [
    tscEntry,
    "--target",
    "ES2022",
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--lib",
    "ES2022,DOM",
    "--skipLibCheck",
    "--esModuleInterop",
    "--types",
    "node",
    "--outDir",
    outDir,
    ...sourceFiles,
  ]);

  const tests = findFiles(outDir, (file) => file.endsWith(".test.js"));
  if (tests.length === 0) {
    throw new Error("No compiled domain tests found.");
  }
  run(process.execPath, ["--test", ...tests], {
    NODE_PATH: join(workspace, "node_modules"),
  });
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: workspace,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findFiles(root, predicate) {
  const files = [];
  walk(root, files, predicate);
  return files.sort((a, b) => relative(workspace, a).localeCompare(relative(workspace, b)));
}

function walk(dir, files, predicate) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(fullPath, files, predicate);
      continue;
    }
    const normalized = fullPath.split(sep).join("/");
    if (predicate(normalized)) {
      files.push(fullPath);
    }
  }
}
