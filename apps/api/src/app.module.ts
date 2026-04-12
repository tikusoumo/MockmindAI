import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module';
import { LivekitModule } from './livekit/livekit.module';
import { DataModule } from './data/data.module';
import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AgentModule } from './agent/agent.module';
import { SessionsModule } from './sessions/sessions.module';
import { ScheduleModule } from './schedule/schedule.module';
import { CommunityModule } from './community/community.module';
import { AdminModule } from './admin/admin.module';

function resolvePublicRootPath(): string {
  const candidates = [
    join(process.cwd(), 'public'),
    join(process.cwd(), 'apps', 'api', 'public'),
    join(__dirname, '..', 'public'),
    join(__dirname, '..', '..', 'public'),
  ];

  const existing = candidates.find((candidate) => existsSync(candidate));
  return existing || candidates[0];
}

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: resolvePublicRootPath(),
      serveRoot: '/public',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    LivekitModule,
    DataModule,
    ReportsModule,
    AuthModule,
    NotificationsModule,
    AgentModule,
    SessionsModule,
    ScheduleModule,
    CommunityModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
