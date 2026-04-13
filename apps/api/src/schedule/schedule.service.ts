import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { GoogleCalendarService } from './google-calendar.service';
import { NotificationsService } from '../notifications/notifications.service';

type IntervalRecurrenceSpec = {
  kind: 'interval_days';
  intervalDays: number;
  time: string;
  isTemplate: boolean;
  sourceSessionId?: string;
  startDate: string;
  endDate?: string;
};

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly notifications: NotificationsService,
  ) {}

  private resolveDurationMinutes(rawDuration: unknown, fallback = 30): number {
    const duration =
      typeof rawDuration === 'number'
        ? rawDuration
        : Number.parseInt(String(rawDuration ?? ''), 10);

    if (!Number.isFinite(duration) || duration <= 0) {
      return fallback;
    }

    return Math.max(15, Math.min(240, Math.floor(duration)));
  }

  private resolveSessionDate(rawDate: unknown, rawTime?: unknown): Date {
    if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
      return rawDate;
    }

    const dateValue = String(rawDate || '').trim();
    const timeValue = String(rawTime || '').trim();
    if (!dateValue) {
      throw new BadRequestException('Session date is required');
    }

    let nextDate: Date;

    if (dateValue.includes('T')) {
      const parsedDate = new Date(dateValue);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Invalid session date/time');
      }

      if (!timeValue) {
        nextDate = parsedDate;
      } else {
        const [hourRaw, minuteRaw] = timeValue.split(':');
        const hours = Number.parseInt(hourRaw || '9', 10);
        const minutes = Number.parseInt(minuteRaw || '0', 10);

        nextDate = new Date(
          parsedDate.getFullYear(),
          parsedDate.getMonth(),
          parsedDate.getDate(),
          Number.isFinite(hours) ? hours : 9,
          Number.isFinite(minutes) ? minutes : 0,
          0,
          0,
        );
      }
    } else {
      const normalizedTime = timeValue || '09:00';
      nextDate = new Date(`${dateValue}T${normalizedTime}:00`);
    }

    if (Number.isNaN(nextDate.getTime())) {
      throw new BadRequestException('Invalid session date/time');
    }

    return nextDate;
  }

  private toDateOnly(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate(),
    ).padStart(2, '0')}`;
  }

  private resolveRecurrence(rawData: any, sessionDate: Date, safeTime: string) {
    const rawRecurrence = rawData?.recurrence;

    if (typeof rawRecurrence === 'string') {
      const trimmed = rawRecurrence.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return trimmed;
      }
    }

    const recurrenceValue = String(rawRecurrence || 'none').trim().toLowerCase();
    const rawInterval = rawData?.recurrenceIntervalDays;
    const explicitInterval =
      typeof rawInterval === 'number'
        ? rawInterval
        : Number.parseInt(String(rawInterval ?? ''), 10);

    let intervalDays = Number.isFinite(explicitInterval) ? explicitInterval : NaN;

    if (!Number.isFinite(intervalDays)) {
      if (recurrenceValue === 'daily') intervalDays = 1;
      if (recurrenceValue === 'weekly') intervalDays = 7;
      if (
        recurrenceValue === 'alternating-day' ||
        recurrenceValue === 'alternate-day' ||
        recurrenceValue === 'every-alternating-day'
      ) {
        intervalDays = 2;
      }
      if (recurrenceValue === 'after-two-days') {
        intervalDays = 3;
      }
    }

    if (!Number.isFinite(intervalDays) || intervalDays <= 0) {
      return recurrenceValue && recurrenceValue !== 'none' ? rawRecurrence : null;
    }

    const recurrenceTime = String(rawData?.recurrenceTime || safeTime || '09:00').trim();
    const endDateCandidate = String(rawData?.recurrenceEndDate || '').trim();

    const spec: IntervalRecurrenceSpec = {
      kind: 'interval_days',
      intervalDays: Math.max(1, Math.min(30, Math.floor(intervalDays))),
      time: recurrenceTime,
      isTemplate: true,
      startDate: this.toDateOnly(sessionDate),
    };

    if (endDateCandidate) {
      const parsedEndDate = new Date(endDateCandidate);
      if (!Number.isNaN(parsedEndDate.getTime())) {
        spec.endDate = this.toDateOnly(parsedEndDate);
      }
    }

    return JSON.stringify(spec);
  }

  async getSessions(userId: number, dateStart?: string, dateEnd?: string) {
    const where: Prisma.ScheduledSessionWhereInput = { userId };

    if (dateStart || dateEnd) {
      const nextDateFilter: Prisma.DateTimeFilter = {};

      if (dateStart) {
        const parsed = new Date(dateStart);
        if (!Number.isNaN(parsed.getTime())) {
          nextDateFilter.gte = parsed;
        }
      }

      if (dateEnd) {
        const parsed = new Date(dateEnd);
        if (!Number.isNaN(parsed.getTime())) {
          nextDateFilter.lte = parsed;
        }
      }

      if (Object.keys(nextDateFilter).length > 0) {
        where.date = nextDateFilter;
      }
    }

    return this.prisma.scheduledSession.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  async createSession(userId: number, data: any) {
    const sessionDate = this.resolveSessionDate(data.date, data.time);
    if (sessionDate.getTime() < Date.now() - 60 * 1000) {
      throw new BadRequestException('Cannot schedule a session in the past');
    }
    const durationMinutes = this.resolveDurationMinutes(data.duration, 30);

    const timeValue = String(data.time || '').trim();
    const safeTime =
      timeValue ||
      `${String(sessionDate.getHours()).padStart(2, '0')}:${String(
        sessionDate.getMinutes(),
      ).padStart(2, '0')}`;
    const recurrence = this.resolveRecurrence(data, sessionDate, safeTime);

    const session = await this.prisma.scheduledSession.create({
      data: {
        userId,
        title: String(data.title || 'Practice Session').trim() || 'Practice Session',
        description: data.description,
        date: sessionDate,
        time: safeTime,
        interviewer: data.interviewer || 'AI Coach',
        category: data.category || 'practice',
        recurrence,
        routineId: data.routineId,
        isAiSuggested: Boolean(data.isAiSuggested),
      },
    });

    let inviteEmailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
    let inviteEmailMessage: string | undefined;
    let inviteEmailTarget: string | undefined;

    if (!Boolean(data?.suppressInviteEmail)) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });

        const explicitInviteEmail = String(data?.inviteEmail || '').trim();
        const emailTarget = explicitInviteEmail || user?.email || '';
        inviteEmailTarget = emailTarget || undefined;

        if (emailTarget) {
          const appBaseUrl =
            process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const scheduleLink = `${appBaseUrl}/schedule?sessionId=${session.id}`;
          const assessmentLink = `${appBaseUrl}/interview?scheduledSessionId=${session.id}`;

          await this.notifications.sendScheduleInviteEmail({
            email: emailTarget,
            name: user?.name || undefined,
            title: session.title,
            interviewer: session.interviewer,
            scheduledAt: session.date,
            durationMinutes,
            scheduleLink,
            assessmentLink,
          });
          inviteEmailStatus = 'sent';
          inviteEmailMessage = 'Invite email delivered';
        } else {
          this.logger.warn(
            `No invite email available for session ${session.id}. Provide inviteEmail or ensure user profile email is set.`,
          );
          inviteEmailStatus = 'skipped';
          inviteEmailMessage =
            'No recipient email found. Provide inviteEmail or set profile email.';
        }
      } catch (error) {
        this.logger.warn(
          `Failed to send schedule invite email for session ${session.id}: ${(error as Error)?.message || 'Unknown error'}`,
        );
        inviteEmailStatus = 'failed';
        inviteEmailMessage =
          (error as Error)?.message || 'Failed to send invite email';
      }
    }

    if (session.date) {
      const gcalEvent = await this.googleCalendar.createEvent(
        userId,
        session.title,
        session.description || 'AI Mock Interview Practice Session',
        session.date,
        durationMinutes,
      );

      if (gcalEvent && gcalEvent.id) {
        await this.prisma.scheduledSession.update({
          where: { id: session.id },
          data: { googleEventId: gcalEvent.id },
        });
      }

      // Schedule in-app Notification
      this.notifications.scheduleReminder(
        userId,
        session.id,
        session.title,
        session.date,
      );
    }

    return {
      ...session,
      inviteEmailStatus,
      inviteEmailTarget,
      inviteEmailMessage,
    };
  }

  async updateSession(userId: number, id: string, data: any) {
    const session = await this.prisma.scheduledSession.findFirst({
      where: { id, userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const nextDate = data.date
      ? this.resolveSessionDate(data.date, data.time ?? session.time)
      : session.date;
    if (nextDate.getTime() < Date.now() - 60 * 1000) {
      throw new BadRequestException('Cannot schedule a session in the past');
    }
    const nextTime = String(data.time ?? session.time ?? '').trim();
    const durationMinutes = this.resolveDurationMinutes(data.duration, 30);

    const updated = await this.prisma.scheduledSession.update({
      where: { id },
      data: {
        title: data.title ?? session.title,
        description:
          data.description === undefined ? session.description : data.description,
        date: nextDate,
        time: nextTime || session.time,
        interviewer: data.interviewer ?? session.interviewer,
        category: data.category ?? session.category,
        status: data.status ?? session.status,
      },
    });

    if (session.googleEventId && updated.date) {
      await this.googleCalendar.updateEvent(
        userId,
        session.googleEventId,
        updated.title,
        updated.description || '',
        updated.date,
        durationMinutes,
      );
    } else if (!session.googleEventId && updated.date) {
      const gcalEvent = await this.googleCalendar.createEvent(
        userId,
        updated.title,
        updated.description || 'AI Mock Interview Practice Session',
        updated.date,
        durationMinutes,
      );

      if (gcalEvent?.id) {
        await this.prisma.scheduledSession.update({
          where: { id: updated.id },
          data: { googleEventId: gcalEvent.id },
        });
      }
    }

    return updated;
  }

  async deleteSession(userId: number, id: string) {
    const session = await this.prisma.scheduledSession.findFirst({
      where: { id, userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    if (session.googleEventId) {
      await this.googleCalendar.deleteEvent(userId, session.googleEventId);
    }

    await this.prisma.scheduledSession.delete({ where: { id } });
    return { success: true };
  }

  // --- Routine Methods ---

  async getRoutines(userId: number) {
    return this.prisma.practiceRoutine.findMany({
      where: { userId },
      include: {
        sessions: {
          orderBy: { date: 'asc' },
          take: 5,
        },
      },
    });
  }

  async generateRoutine(userId: number, data?: any) {
    // In a real scenario, this would query past reports, extract weak areas
    // and form an adaptive plan.
    const newRoutine = await this.prisma.practiceRoutine.create({
      data: {
        userId,
        title: data?.title || 'AI Suggested Weekly Prep',
        description:
          data?.description || 'Focusing on System Design and Behavioral',
        frequency: data?.frequency || 'weekly',
        focusAreas: data?.focusAreas || ['System Design', 'Behavioral'],
        duration: data?.duration || 45,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      },
    });

    return newRoutine;
  }

  async updateRoutine(userId: number, id: string, data: any) {
    const routine = await this.prisma.practiceRoutine.findFirst({
      where: { id, userId },
    });

    if (!routine) {
      throw new NotFoundException('Routine not found');
    }

    return this.prisma.practiceRoutine.update({
      where: { id: routine.id },
      data: {
        title: data.title,
        description: data.description,
        frequency: data.frequency,
        focusAreas: data.focusAreas,
        duration: data.duration,
        isActive: data.isActive,
      },
    });
  }

  async getGoogleConnectUrl(userId: number, returnTo?: string) {
    return this.googleCalendar.generateAuthUrl(userId, returnTo);
  }

  async handleGoogleCallback(code?: string, state?: string) {
    return this.googleCalendar.handleOAuthCallback(code, state);
  }

  async connectGoogleWithToken(userId: number, token: unknown) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleCalendarToken:
          token && typeof token === 'object' ? (token as object) : {},
      },
    });

    return { success: true };
  }

  async disconnectGoogle(userId: number) {
    await this.googleCalendar.revokeUserToken(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { googleCalendarToken: Prisma.DbNull },
    });
    return { success: true };
  }

  async getGoogleEvents(userId: number, start?: string, end?: string) {
    return this.googleCalendar.listEvents(userId, start, end);
  }

  async getGoogleConnectionStatus(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { googleCalendarToken: true },
    });

    const token = user?.googleCalendarToken;
    const connected =
      !!token && typeof token === 'object' && !Array.isArray(token);

    const hasTokenFields =
      connected && Object.keys(token as Record<string, unknown>).length > 0;

    return { connected: Boolean(hasTokenFields) };
  }
}
