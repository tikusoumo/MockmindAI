import * as dotenv from 'dotenv';
import path from 'node:path';
import { defineConfig } from '@prisma/config';

dotenv.config({ path: path.join(__dirname, '../.env') });

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/voice_agent',
  },
});
