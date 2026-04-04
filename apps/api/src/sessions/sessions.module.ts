import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [SessionsController],
  providers: [SessionsService, PrismaService],
})
export class SessionsModule {}
