import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// Next.js owns dev and build. Vite+ provides lint, format and test.
// `data/**` holds committed datasets whose exact bytes (and size) are asserted by tests.
const ignorePatterns = [
  ".next/**",
  "lib/generated/**",
  "coverage/**",
  "data/**",
  "next-env.d.ts",
  "prisma/migrations/**",
  "test-results/**",
];

export default defineConfig({
  lint: {
    plugins: ["typescript", "react", "nextjs", "jsx-a11y"],
    options: { typeAware: true, typeCheck: true },
    ignorePatterns,
    rules: {
      "typescript/no-explicit-any": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Strict type-aware rules the previous ESLint setup (next/core-web-vitals + next/typescript) never ran.
      "typescript/no-base-to-string": "off",
      "typescript/unbound-method": "off",
      "typescript/await-thenable": "off",
      "typescript/no-redundant-type-constituents": "off",
      "typescript/restrict-template-expressions": "off",
      "jsx-a11y/prefer-tag-over-role": "off",
      // Hydration-safe effects (theme, favourites, counters) set state on purpose.
      "react/set-state-in-effect": "off",
      // API route links (CSV/JSON downloads) are not pages.
      "nextjs/no-html-link-for-pages": "off",
    },
  },
  fmt: { ignorePatterns },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
