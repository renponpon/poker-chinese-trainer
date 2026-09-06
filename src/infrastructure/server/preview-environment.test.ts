import assert from "node:assert/strict";
import test from "node:test";
import { assertPreviewEnvironment } from "./preview-environment";

const preview = {
  VERCEL_ENV: "preview",
  PHRABIT_PREVIEW_SUPABASE_REF: "abcdefghijklmnopqrst",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-only",
  GEMINI_API_KEY: "test-only",
  DEEPL_API_KEY: "test-only",
  AZURE_TRANSLATOR_KEY: "test-only",
};

test("preview rejects production database, missing credentials and external write integrations", () => {
  assert.throws(() => assertPreviewEnvironment({ VERCEL_ENV: "preview" }));
  assert.throws(() => assertPreviewEnvironment({ ...preview, PHRABIT_PREVIEW_SUPABASE_REF: "whuatcawoezfrvzplmri", NEXT_PUBLIC_SUPABASE_URL: "https://whuatcawoezfrvzplmri.supabase.co" }));
  assert.throws(() => assertPreviewEnvironment({ ...preview, NEXT_PUBLIC_SUPABASE_URL: "https://different.supabase.co" }));
  assert.throws(() => assertPreviewEnvironment({ ...preview, GEMINI_API_KEY: "" }));
  assert.throws(() => assertPreviewEnvironment({ ...preview, NOTION_API_KEY: "live" }));
  assert.throws(() => assertPreviewEnvironment({ ...preview, RESEND_API_KEY: "live" }));
});

test("configured preview passes and existing development and production are unaffected", () => {
  assert.doesNotThrow(() => assertPreviewEnvironment(preview));
  assert.doesNotThrow(() => assertPreviewEnvironment({}));
  assert.doesNotThrow(() => assertPreviewEnvironment({ VERCEL_ENV: "production" }));
});
