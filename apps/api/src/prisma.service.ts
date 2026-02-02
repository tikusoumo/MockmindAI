import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: pg.Pool;

  constructor() {
    // Create a pg Pool for the adapter
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://app:app@localhost:5432/voice_agent';
    const pool = new pg.Pool({ connectionString });

    // Create the Prisma adapter
    const adapter = new PrismaPg(pool);

    // Initialize PrismaClient with the adapter
    super({ adapter });

    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    console.log('Database connected successfully!');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
