import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async healthCheck() {
    try {
      // Test database connectivity by running a simple query
      const result = await this.prisma.$queryRaw`SELECT 1 as connected`;
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        result,
      };
    } catch (error) {
      return {
        status: 'error',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('db-test')
  async testDatabase() {
    try {
      // Try to count users to test database tables
      const userCount = await this.prisma.user.count();
      const templateCount = await this.prisma.interviewTemplate.count();
      const reportCount = await this.prisma.report.count();

      return {
        status: 'ok',
        message: 'Database connection successful!',
        tables: {
          users: userCount,
          interviewTemplates: templateCount,
          reports: reportCount,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

