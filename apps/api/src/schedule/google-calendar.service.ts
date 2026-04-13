import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { google, calendar_v3 } from 'googleapis';
import { Credentials, OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma.service';

type GoogleCalendarStatePayload = {
  userId: number;
  returnTo: string;
  issuedAt: number;
  nonce: string;
};

const CALENDAR_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getBackendBaseUrl(): string {
    return (
      process.env.BACKEND_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'http://localhost:8000'
    );
  }

  private getFrontendBaseUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  }

  private getCalendarCallbackUrl(): string {
    return (
      process.env.GOOGLE_CALENDAR_CALLBACK_URL ||
      `${this.getBackendBaseUrl()}/api/schedule/google/callback`
    );
  }

  private getCalendarStateSecret(): string {
    return (
      process.env.GOOGLE_CALENDAR_STATE_SECRET ||
      process.env.JWT_SECRET ||
      'mockmind-calendar-state-secret'
    );
  }

  private getCalendarTimeZone(): string {
    return process.env.APP_TIMEZONE || 'UTC';
  }

  private getOAuthClient(): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      );
    }

    return new google.auth.OAuth2(
      clientId,
      clientSecret,
      this.getCalendarCallbackUrl(),
    );
  }

  private buildSafeReturnTo(returnTo?: string): string {
    const fallback = `${this.getFrontendBaseUrl()}/schedule`;
    const frontendBase = this.getFrontendBaseUrl();

    if (!returnTo || typeof returnTo !== 'string') {
      return fallback;
    }

    if (returnTo.startsWith('/')) {
      try {
        return new URL(returnTo, frontendBase).toString();
      } catch {
        return fallback;
      }
    }

    try {
      const parsed = new URL(returnTo);
      const allowedOrigin = new URL(frontendBase).origin;
      return parsed.origin === allowedOrigin ? parsed.toString() : fallback;
    } catch {
      return fallback;
    }
  }

  private createSignedState(payload: GoogleCalendarStatePayload): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.getCalendarStateSecret())
      .update(encodedPayload)
      .digest('base64url');

    return `${encodedPayload}.${signature}`;
  }

  private parseSignedState(
    state: string,
  ): GoogleCalendarStatePayload | null {
    const [encodedPayload, signature] = String(state || '').split('.');
    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = createHmac('sha256', this.getCalendarStateSecret())
      .update(encodedPayload)
      .digest('base64url');

    if (expectedSignature.length !== signature.length) {
      return null;
    }

    if (
      !timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(signature, 'utf8'),
      )
    ) {
      return null;
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as Partial<GoogleCalendarStatePayload>;

      if (typeof decoded.userId !== 'number' || decoded.userId <= 0) {
        return null;
      }

      if (typeof decoded.returnTo !== 'string' || !decoded.returnTo) {
        return null;
      }

      if (typeof decoded.issuedAt !== 'number') {
        return null;
      }

      if (Date.now() - decoded.issuedAt > 15 * 60 * 1000) {
        return null;
      }

      return {
        userId: decoded.userId,
        returnTo: this.buildSafeReturnTo(decoded.returnTo),
        issuedAt: decoded.issuedAt,
        nonce:
          typeof decoded.nonce === 'string' && decoded.nonce
            ? decoded.nonce
            : randomBytes(8).toString('hex'),
      };
    } catch {
      return null;
    }
  }

  private withQuery(url: string, key: string, value: string): string {
    try {
      const next = new URL(url);
      next.searchParams.set(key, value);
      return next.toString();
    } catch {
      return url;
    }
  }

  async generateAuthUrl(userId: number, returnTo?: string): Promise<string> {
    const oauth2Client = this.getOAuthClient();
    const state = this.createSignedState({
      userId,
      returnTo: this.buildSafeReturnTo(returnTo),
      issuedAt: Date.now(),
      nonce: randomBytes(12).toString('hex'),
    });

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: CALENDAR_OAUTH_SCOPES,
      state,
    });
  }

  async handleOAuthCallback(
    code: string | undefined,
    state: string | undefined,
  ): Promise<string> {
    const safeDefaultRedirect = `${this.getFrontendBaseUrl()}/schedule`;
    const parsedState = state ? this.parseSignedState(state) : null;
    const returnTo = parsedState?.returnTo || safeDefaultRedirect;

    if (!parsedState || !code) {
      return this.withQuery(returnTo, 'googleCalendar', 'failed');
    }

    try {
      const oauth2Client = this.getOAuthClient();
      const tokenResponse = await oauth2Client.getToken(code);
      const tokens = tokenResponse.tokens;

      if (!tokens || Object.keys(tokens).length === 0) {
        return this.withQuery(returnTo, 'googleCalendar', 'failed');
      }

      await this.prisma.user.update({
        where: { id: parsedState.userId },
        data: { googleCalendarToken: tokens as unknown as object },
      });

      return this.withQuery(returnTo, 'googleCalendar', 'connected');
    } catch (error) {
      this.logger.error('Failed Google Calendar OAuth callback', error);
      return this.withQuery(returnTo, 'googleCalendar', 'failed');
    }
  }

  async getCalendarClient(
    userId: number,
  ): Promise<calendar_v3.Calendar | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !user.googleCalendarToken ||
      typeof user.googleCalendarToken !== 'object' ||
      Array.isArray(user.googleCalendarToken)
    ) {
      return null;
    }

    const storedCredentials = user.googleCalendarToken as Credentials;
    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials(storedCredentials);

    oauth2Client.on('tokens', (refreshedTokens) => {
      const mergedCredentials = {
        ...storedCredentials,
        ...refreshedTokens,
      };

      void this.prisma.user.update({
        where: { id: userId },
        data: { googleCalendarToken: mergedCredentials as unknown as object },
      });
    });

    // This will automatically handle token refresh if refresh_token is present
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async revokeUserToken(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !user.googleCalendarToken ||
      typeof user.googleCalendarToken !== 'object' ||
      Array.isArray(user.googleCalendarToken)
    ) {
      return;
    }

    const credentials = user.googleCalendarToken as Credentials;
    const token = credentials.refresh_token || credentials.access_token;
    if (!token) {
      return;
    }

    try {
      const oauth2Client = this.getOAuthClient();
      await oauth2Client.revokeToken(token);
    } catch (error) {
      this.logger.warn(
        `Failed to revoke Google Calendar token for user ${userId}`,
        error as Error,
      );
    }
  }

  async listEvents(
    userId: number,
    start?: string,
    end?: string,
  ): Promise<
    Array<{
      id: string;
      title: string;
      start: string;
      end: string;
      description?: string;
      status?: string;
      htmlLink?: string;
    }>
  > {
    const calendar = await this.getCalendarClient(userId);
    if (!calendar) {
      return [];
    }

    const now = new Date();
    const defaultEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const parsedStart = start ? new Date(start) : now;
    const parsedEnd = end ? new Date(end) : defaultEnd;
    const timeMin = Number.isNaN(parsedStart.getTime()) ? now : parsedStart;
    const timeMax = Number.isNaN(parsedEnd.getTime()) ? defaultEnd : parsedEnd;

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 250,
      });

      const items = response.data.items || [];
      return items
        .filter((item) => Boolean(item.id))
        .map((item) => ({
          id: String(item.id),
          title: item.summary || 'Untitled Event',
          start:
            item.start?.dateTime || item.start?.date || new Date().toISOString(),
          end: item.end?.dateTime || item.end?.date || new Date().toISOString(),
          description: item.description || undefined,
          status: item.status || undefined,
          htmlLink: item.htmlLink || undefined,
        }));
    } catch (error) {
      this.logger.error(
        `Failed to list Google Calendar events for user ${userId}`,
        error,
      );
      return [];
    }
  }

  async createEvent(
    userId: number,
    title: string,
    description: string,
    startTime: Date,
    durationMinutes: number,
  ) {
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
            timeZone: this.getCalendarTimeZone(),
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: this.getCalendarTimeZone(),
          },
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to create Google Calendar event for user ${userId}`,
        error,
      );
      return null;
    }
  }

  async updateEvent(
    userId: number,
    eventId: string,
    title: string,
    description: string,
    startTime: Date,
    durationMinutes: number,
  ) {
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
            timeZone: this.getCalendarTimeZone(),
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: this.getCalendarTimeZone(),
          },
        },
      });
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to update Google Calendar event ${eventId} for user ${userId}`,
        error,
      );
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
      this.logger.error(
        `Failed to delete Google Calendar event ${eventId} for user ${userId}`,
        error,
      );
      return false;
    }
  }
}
