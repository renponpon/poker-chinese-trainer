import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/domain/**/*.{ts,tsx}", "src/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "react",
            "next",
            "next/server",
            "@supabase/supabase-js",
            "@google/genai",
            "@notionhq/client",
          ],
          patterns: [
            "next/*",
            "@supabase/*",
            "@google/*",
            "@notionhq/*",
            "@/infrastructure/*",
            "@/lib/supabase",
            "@/lib/notion",
            "@/lib/server/*",
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message: "Use an injected port or infrastructure adapter instead of fetch in this layer.",
        },
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: "Keep environment access in infrastructure or route handlers.",
        },
        {
          selector: "Identifier[name='window']",
          message: "Keep browser globals out of domain/application code.",
        },
        {
          selector: "Identifier[name='localStorage']",
          message: "Use an injected storage port instead of localStorage in this layer.",
        },
      ],
    },
  },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/application/*",
            "@/infrastructure/*",
            "../application/*",
            "../infrastructure/*",
            "../../application/*",
            "../../infrastructure/*",
          ],
        },
      ],
    },
  },
  {
    files: ["src/infrastructure/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "next", "next/server"],
          patterns: ["next/*", "@/app/*", "@/components/*"],
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/local-phrases",
              message: "Use '@/infrastructure/local/phrase-storage' for local phrase persistence.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase",
              message: "Use a server infrastructure adapter instead of importing Supabase directly in routes.",
            },
            {
              name: "@/lib/notion",
              message: "Use a server infrastructure adapter instead of importing Notion directly in routes.",
            },
            {
              name: "@google/genai",
              message: "Use a server infrastructure adapter instead of importing provider SDKs directly in routes.",
            },
            {
              name: "@/infrastructure/server/gemini-client",
              message: "Use a feature-specific server infrastructure adapter instead of importing the raw Gemini client in routes.",
            },
            {
              name: "@/lib/server/supabase-admin",
              message: "Use a server infrastructure adapter instead of importing Supabase admin helpers directly in routes.",
            },
            {
              name: "@/lib/server/usage-limits",
              message: "Use '@/infrastructure/server/usage-limits' from route handlers.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportExpression[source.value='@/lib/supabase'], ImportExpression[source.value='@/lib/notion'], ImportExpression[source.value='@google/genai'], ImportExpression[source.value='@/infrastructure/server/gemini-client'], ImportExpression[source.value='@/lib/server/supabase-admin'], ImportExpression[source.value='@/lib/server/usage-limits']",
          message: "Use a server infrastructure adapter instead of dynamic-importing infrastructure clients in routes.",
        },
        {
          selector: "CallExpression[callee.name='fetch']",
          message: "Use a server infrastructure adapter instead of calling fetch directly in API routes.",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
