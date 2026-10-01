import { defineConfig } from "prisma/config";

// `prisma generate` runs on every install (postinstall), so DATABASE_URL may be unset there.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DATABASE_URL ?? "" },
  migrations: { seed: "tsx prisma/seed.ts" },
});
