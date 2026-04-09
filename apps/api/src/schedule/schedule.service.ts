import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GoogleCalendarService } from './google-calendar.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly notifications: NotificationsService,
  ) {}

  async getSessions(userId: number, dateStart?: string, dateEnd?: string) {
    return this.prisma.scheduledSession.findMany({
      where: {
        userId,
        // Optional date filtering could be added here
      },
      orderBy: { date: 'asc' },
    });
  }

  async createSession(userId: number, data: any) {
    // Basic standard duration if none provided via template/routine
    const durationMinutes = data.duration || 30;
    
    // Create DB entry
    const session = await this.prisma.scheduledSession.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        date: new Date(data.date), // expected to be combined date+time ISO or valid string
        time: data.time || '',
        interviewer: data.interviewer || 'AI Coach',
        category: data.category || 'practice',
        recurrence: data.recurrence,
        routineId: data.routineId,
        isAiSuggested: data.isAiSuggested || false,
      },
    });

    // Sync to Google Calendar
    if (session.date) {
      const gcalEvent = await this.googleCalendar.createEvent(
        userId,
        session.title,
        session.description || 'AI Mock Interview Practice Session',
        session.date,
        durationMinutes
      );

      if (gcalEvent && gcalEvent.id) {
        await this.prisma.scheduledSession.update({
          where: { id: session.id },
          data: { googleEventId: gcalEvent.id },
        });
      }

      // Schedule in-app Notification
      this.notifications.scheduleReminder(userId, session.id, session.title, session.date);
    }

    return session;
  }

  async updateSession(userId: number, id: string, data: any) {
    const session = await this.prisma.scheduledSession.findUnique({ where: { id, userId } });
    if (!session) throw new NotFoundException('Session not found');

    const updated = await this.prisma.scheduledSession.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        date: data.date ? new Date(data.date) : undefined,
        time: data.time,
        interviewer: data.interviewer,
        category: data.category,
        status: data.status,
      },
    });

    if (session.googleEventId && updated.date) {
      await this.googleCalendar.updateEvent(
        userId,
        session.googleEventId,
        updated.title,
        updated.description || '',
        updated.date,
        data.duration || 30
      );
    }

    return updated;
  }

  async deleteSession(userId: number, id: string) {
    const session = await this.prisma.scheduledSession.findUnique({ where: { id, userId } });
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
          take: 5
        }
      }
    });
  }

  async generateRoutine(userId: number, data?: any) {
    // In a real scenario, this would query past reports, extract weak areas
    // and form an adaptive plan.
    const newRoutine = await this.prisma.practiceRoutine.create({
      data: {
        userId,
        title: data?.title || 'AI Suggested Weekly Prep',
        description: data?.description || 'Focusing on System Design and Behavioral',
        frequency: data?.frequency || 'weekly',
        focusAreas: data?.focusAreas || ['System Design', 'Behavioral'],
        duration: data?.duration || 45,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      }
    });

    return newRoutine;
  }

  async updateRoutine(userId: number, id: string, data: any) {
    return this.prisma.practiceRoutine.update({
      where: { id, userId },
      data: {
        title: data.title,
        description: data.description,
        frequency: data.frequency,
        focusAreas: data.focusAreas,
        duration: data.duration,
        isActive: data.isActive,
      }
    });
  }
}
