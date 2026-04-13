import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { ScheduleService } from './schedule.service';
import { NotificationsService } from '../notifications/notifications.service';

type IntervalRecurrenceSpec = {
  intervalDays: number;
  time: string;
  isTemplate: boolean;
  sourceSessionId: string;
  startDate: string;
  endDate?: string;
};

@Injectable()
export class ScheduleCronService {
  private readonly logger = new Logger(ScheduleCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly notifications: NotificationsService,
  ) {}

  private toDateOnly(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate(),
    ).padStart(2, '0')}`;
  }

  private applyTime(value: Date, time: string): Date {
    const [hourRaw, minuteRaw] = String(time || '09:00').split(':');
    const hours = Number.parseInt(hourRaw || '9', 10);
    const minutes = Number.parseInt(minuteRaw || '0', 10);

    const next = new Date(value);
    next.setHours(
      Number.isFinite(hours) ? hours : 9,
      Number.isFinite(minutes) ? minutes : 0,
      0,
      0,
    );
    return next;
  }

  private parseRecurrence(
    recurrence: string | null,
    sourceSessionId: string,
    fallbackDate: Date,
    fallbackTime: string,
  ): IntervalRecurrenceSpec | null {
    if (!recurrence) {
      return null;
    }

    const normalized = recurrence.trim().toLowerCase();
    if (normalized === 'daily') {
      return {
        intervalDays: 1,
        time: fallbackTime,
        isTemplate: true,
        sourceSessionId,
        startDate: this.toDateOnly(fallbackDate),
      };
    }

    if (normalized === 'weekly') {
      return {
        intervalDays: 7,
        time: fallbackTime,
        isTemplate: true,
        sourceSessionId,
        startDate: this.toDateOnly(fallbackDate),
      };
    }

    try {
      const parsed = JSON.parse(recurrence) as Partial<{
        kind: string;
        intervalDays: number;
        time: string;
        isTemplate: boolean;
        sourceSessionId: string;
        startDate: string;
        endDate: string;
      }>;

      if (parsed.kind !== 'interval_days') {
        return null;
      }

      const intervalDays = Number.isFinite(parsed.intervalDays)
        ? Number(parsed.intervalDays)
        : NaN;

      if (!Number.isFinite(intervalDays) || intervalDays <= 0) {
        return null;
      }

      return {
        intervalDays: Math.max(1, Math.min(30, Math.floor(intervalDays))),
        time: String(parsed.time || fallbackTime || '09:00').trim(),
        isTemplate: parsed.isTemplate !== false,
        sourceSessionId:
          String(parsed.sourceSessionId || '').trim() || sourceSessionId,
        startDate:
          String(parsed.startDate || '').trim() || this.toDateOnly(fallbackDate),
        endDate: String(parsed.endDate || '').trim() || undefined,
      };
    } catch {
      return null;
    }
  }

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
      if (routine.frequency === 'weekly' && new Date().getDay() === 1)
        shouldScheduleToday = true; // Every Monday

      if (shouldScheduleToday) {
        try {
          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);

          const existingForToday = await this.prisma.scheduledSession.findFirst({
            where: {
              userId: routine.userId,
              routineId: routine.id,
              date: {
                gte: dayStart,
                lt: dayEnd,
              },
            },
          });

          if (existingForToday) {
            continue;
          }

          const sessionDate = new Date();
          sessionDate.setHours(18, 0, 0, 0); // Default to 6 PM

          await this.scheduleService.createSession(routine.userId, {
            title: `Practice: ${(routine.focusAreas as string[])?.join(', ') || 'Mixed Topics'}`,
            description:
              routine.description || 'Auto-scheduled practice session',
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
            `We've scheduled your practice for today at 6 PM focusing on ${(routine.focusAreas as string[])?.join(', ')}.`,
          );
        } catch (e) {
          this.logger.error(
            `Error generating session for routine ${routine.id}:`,
            e,
          );
        }
      }
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async materializeRecurringSessions() {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 14);

    const candidates = await this.prisma.scheduledSession.findMany({
      where: {
        recurrence: { not: null },
        status: { in: ['pending', 'in-progress'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 400,
    });

    let generatedCount = 0;

    for (const session of candidates) {
      const recurrence = this.parseRecurrence(
        session.recurrence,
        session.id,
        session.date,
        session.time,
      );

      if (!recurrence || !recurrence.isTemplate) {
        continue;
      }

      const sourceSessionId = recurrence.sourceSessionId || session.id;

      const latestSeriesOccurrence = await this.prisma.scheduledSession.findFirst({
        where: {
          userId: session.userId,
          OR: [
            { id: sourceSessionId },
            {
              recurrence: {
                contains: `\"sourceSessionId\":\"${sourceSessionId}\"`,
              },
            },
          ],
        },
        orderBy: { date: 'desc' },
      });

      let cursor = latestSeriesOccurrence?.date || session.date;

      while (true) {
        const nextDate = new Date(cursor);
        nextDate.setDate(nextDate.getDate() + recurrence.intervalDays);
        const scheduledAt = this.applyTime(nextDate, recurrence.time);

        if (scheduledAt > horizon) {
          break;
        }

        if (recurrence.endDate) {
          const recurrenceEnd = new Date(`${recurrence.endDate}T23:59:59`);
          if (
            !Number.isNaN(recurrenceEnd.getTime()) &&
            scheduledAt > recurrenceEnd
          ) {
            break;
          }
        }

        const windowStart = new Date(scheduledAt.getTime() - 60 * 1000);
        const windowEnd = new Date(scheduledAt.getTime() + 60 * 1000);

        const existingOccurrence = await this.prisma.scheduledSession.findFirst({
          where: {
            userId: session.userId,
            date: {
              gte: windowStart,
              lte: windowEnd,
            },
            OR: [
              { id: sourceSessionId },
              {
                recurrence: {
                  contains: `\"sourceSessionId\":\"${sourceSessionId}\"`,
                },
              },
            ],
          },
        });

        if (!existingOccurrence) {
          const generatedRecurrence = JSON.stringify({
            kind: 'interval_days',
            intervalDays: recurrence.intervalDays,
            time: recurrence.time,
            isTemplate: false,
            sourceSessionId,
            startDate: recurrence.startDate,
            endDate: recurrence.endDate,
          });

          await this.scheduleService.createSession(session.userId, {
            title: session.title,
            description:
              session.description || 'Auto-generated recurring practice session',
            date: this.toDateOnly(scheduledAt),
            time: recurrence.time,
            interviewer: session.interviewer,
            category: session.category,
            duration: 45,
            recurrence: generatedRecurrence,
            suppressInviteEmail: true,
            isAiSuggested: true,
          });

          generatedCount += 1;
        }

        cursor = scheduledAt;
      }
    }

    if (generatedCount > 0) {
      this.logger.log(`Generated ${generatedCount} recurring session(s).`);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendUpcomingReminders() {
    const now = new Date();
    const reminderWindowEnd = new Date(now.getTime() + 30 * 60 * 1000);

    const upcomingSessions = await this.prisma.scheduledSession.findMany({
      where: {
        reminderSent: false,
        status: { in: ['pending', 'in-progress'] },
        date: {
          gte: now,
          lte: reminderWindowEnd,
        },
      },
      orderBy: { date: 'asc' },
      take: 200,
    });

    if (upcomingSessions.length === 0) {
      return;
    }

    this.logger.log(
      `Dispatching reminders for ${upcomingSessions.length} upcoming session(s).`,
    );

    for (const session of upcomingSessions) {
      try {
        await this.notifications.createNotification(
          session.userId,
          'schedule_reminder',
          'Upcoming Session Reminder',
          `Your session "${session.title}" starts at ${session.time}.`,
          {
            sessionId: session.id,
            scheduledAt: session.date.toISOString(),
          },
        );

        await this.prisma.scheduledSession.update({
          where: { id: session.id },
          data: { reminderSent: true },
        });
      } catch (error) {
        this.logger.error(
          `Failed to dispatch reminder for session ${session.id}`,
          error,
        );
      }
    }
  }
}
