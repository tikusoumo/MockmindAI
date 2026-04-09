import { Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma.service';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getOAuthClient(): OAuth2Client {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8000/api/auth/google/callback'
    );
  }

  async getCalendarClient(userId: number): Promise<calendar_v3.Calendar | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.googleCalendarToken) {
      return null;
    }

    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials(user.googleCalendarToken as any);

    // This will automatically handle token refresh if refresh_token is present
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async createEvent(userId: number, title: string, description: string, startTime: Date, durationMinutes: number) {
    const calendar = await this.getCalendarClient(userId);
    if (!calendar) return null;

    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    try {
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: title,
          description: description,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: 'UTC', // Using UTC to be neutral, consider allowing user timeZone
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: 'UTC',
          },
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create Google Calendar event for user ${userId}`, error);
      return null;
    }
  }

  async updateEvent(userId: number, eventId: string, title: string, description: string, startTime: Date, durationMinutes: number) {
    const calendar = await this.getCalendarClient(userId);
    if (!calendar) return null;

    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    try {
      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: {
          summary: title,
          description: description,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: 'UTC',
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: 'UTC',
          },
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update Google Calendar event ${eventId} for user ${userId}`, error);
      return null;
    }
  }

  async deleteEvent(userId: number, eventId: string) {
    const calendar = await this.getCalendarClient(userId);
    if (!calendar) return false;

    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete Google Calendar event ${eventId} for user ${userId}`, error);
      return false;
    }
  }
}
