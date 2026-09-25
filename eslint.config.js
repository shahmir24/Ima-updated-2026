import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Guest mode keeps its data in the browser tab and nowhere else. Nothing
    // written for it may reach Supabase, directly or through a module that
    // does: not the client, not supabase-js, and not the Supabase-backed hooks
    // or the auth provider. Type-only imports are allowed (the generated
    // database types, TaskRow for compatibility checks) because they vanish at
    // compile time and cannot make a request.
    files: ["src/lib/guest/**/*.{ts,tsx}", "src/hooks/use-guest-*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supabase/*"],
              message: "Guest modules must never talk to Supabase.",
            },
            {
              group: ["@/integrations/supabase/*", "**/integrations/supabase/*"],
              allowTypeImports: true,
              message: "Guest modules must never import the Supabase client. Type-only imports are allowed.",
            },
            {
              group: ["@/hooks/*", "!@/hooks/use-guest-*", "**/hooks/*", "!**/hooks/use-guest-*"],
              allowTypeImports: true,
              message: "Authenticated hooks write to Supabase and cannot be used by guest modules. Type-only imports are allowed.",
            },
            {
              group: ["@/contexts/AuthProvider", "**/contexts/AuthProvider"],
              allowTypeImports: true,
              message: "The auth provider imports the Supabase client and cannot be used by guest modules.",
            },
          ],
        },
      ],
    },
  }
);
