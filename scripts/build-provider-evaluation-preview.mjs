import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env.VERCEL_ENV !== "preview") throw new Error("Evaluation builds are only allowed in Preview");
if (existsSync("public/provider-comparison/results.json")) throw new Error("Refusing to rerun a completed paid evaluation");

const evaluationEnvironment = {
  ...process.env,
  PROVIDER_MODELS: "gemini-3.5-flash-lite,gemini-3.8-flash,gpt-5.6-luna",
};
for (const [args, options] of [
  [["scripts/compare-translation-providers.mjs", "--llm-only", "--preview-report", "--run"], { env: evaluationEnvironment }],
  [["node_modules/next/dist/bin/next", "build"], {}],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", shell: false, ...options });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
