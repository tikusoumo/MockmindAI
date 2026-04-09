import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { ScheduleService } from './schedule.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ScheduleCronService {
  private readonly logger = new Logger(ScheduleCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly notifications: NotificationsService,
  ) {}

  // Run every morning at 06:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async generateDailySessions() {
    this.logger.log('Running daily routine session generator...');
    
    // Find active routines that need sessions scheduled today
    const activeRoutines = await this.prisma.practiceRoutine.findMany({
      where: {
        isActive: true,
        // Optional: filter where startDate <= now and (endDate >= now or endDate is null)
      },
    });

    for (const routine of activeRoutines) {
      // Logic to determine if a session should be created today based on frequency
      // Simplification for the implementation constraint:
      // If daily, create. If weekly, create on specific day, etc.
      // We will create one 'practice' session if needed.
      
      let shouldScheduleToday = false;
      
      if (routine.frequency === 'daily') shouldScheduleToday = true;
      if (routine.frequency === 'weekly' && new Date().getDay() === 1) shouldScheduleToday = true; // Every Monday
      
      if (shouldScheduleToday) {
        try {
          const sessionDate = new Date();
          sessionDate.setHours(18, 0, 0, 0); // Default to 6 PM

          await this.scheduleService.createSession(routine.userId, {
            title: `Practice: ${(routine.focusAreas as string[])?.join(', ') || 'Mixed Topics'}`,
            description: routine.description || 'Auto-scheduled practice session',
            date: sessionDate.toISOString(),
            time: '18:00',
            interviewer: 'AI Coach',
            category: 'practice',
            routineId: routine.id,
            isAiSuggested: true,
            duration: routine.duration,
          });

          // Send notification payload
          await this.notifications.createNotification(
            routine.userId,
            'ai_suggestion',
            'Your Daily Routine',
            `We've scheduled your practice for today at 6 PM focusing on ${(routine.focusAreas as string[])?.join(', ')}.`
          );

        } catch(e) {
          this.logger.error(`Error generating session for routine ${routine.id}:`, e);
        }
      }
    }
  }
}
