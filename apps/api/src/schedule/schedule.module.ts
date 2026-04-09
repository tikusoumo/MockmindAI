import { Module } from '@nestjs/common';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { ScheduleCronService } from './schedule.cron';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [NestScheduleModule.forRoot(), NotificationsModule],
  controllers: [ScheduleController],
  providers: [ScheduleService, GoogleCalendarService, ScheduleCronService, PrismaService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
