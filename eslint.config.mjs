import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Le Edge Function girano su Deno, non su Node: importano da URL e usano
    // il global `Deno`. Compilarle o analizzarle qui darebbe solo errori su
    // cose che in produzione esistono. Le controlla il deploy di Supabase.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
