import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// dotenv/config is now imported to load .env files for Prisma CLI

export default defineConfig({
  schema: path.join(__dirname, 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'migrations'),
  },
  datasource: {
    // Use process.env directly to allow prisma generate to work without DATABASE_URL
    // (e.g., during Docker builds). The env() helper throws if the var is missing.
    url: process.env.DATABASE_URL ?? '',
  },
});
