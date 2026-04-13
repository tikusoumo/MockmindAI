import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {
    const smtpUser =
      process.env.SMTP_USER ||
      process.env.SMTP_USERNAME ||
      process.env.MAIL_USER;
    const smtpPass =
      process.env.SMTP_PASSWORD ||
      process.env.SMTP_PASS ||
      process.env.MAIL_PASSWORD;
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number.parseInt(String(process.env.SMTP_PORT || ''), 10);
    const hasHostConfig = Boolean(smtpHost && Number.isFinite(smtpPort));

    this.transporter = nodemailer.createTransport({
      ...(hasHostConfig
        ? {
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
          }
        : { service: 'gmail' }),
      auth:
        smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    });
  }

  async sendOtpEmail(email: string, code: string) {
    const htmlContent = this.getOtpEmailTemplate(code);
    return this.sendEmail(
      email,
      'Your MockMind AI Verification Code',
      htmlContent,
    );
  }

  async sendScheduleInviteEmail(params: {
    email: string;
    name?: string;
    title: string;
    interviewer: string;
    scheduledAt: Date;
    durationMinutes: number;
    scheduleLink: string;
    assessmentLink: string;
  }) {
    const htmlContent = this.getScheduleInviteTemplate(params);
    return this.sendEmail(
      params.email,
      `Scheduled: ${params.title} (${params.durationMinutes} mins)`,
      htmlContent,
    );
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      const smtpUser =
        process.env.SMTP_USER ||
        process.env.SMTP_USERNAME ||
        process.env.MAIL_USER;
      const smtpPass =
        process.env.SMTP_PASSWORD ||
        process.env.SMTP_PASS ||
        process.env.MAIL_PASSWORD;
      if (!smtpUser || !smtpPass) {
        this.logger.warn(
          `SMTP credentials not configured (expected SMTP_USER/SMTP_PASS variants). Mock sending email to ${to}`,
        );
        return;
      }
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"MockMind AI" <' + smtpUser + '>',
        to,
        subject,
        html,
      });

      const accepted = Array.isArray(info.accepted)
        ? info.accepted.filter(Boolean)
        : [];
      const rejected = Array.isArray(info.rejected)
        ? info.rejected.filter(Boolean)
        : [];

      this.logger.log(
        `Email SMTP result for ${to}: accepted=${accepted.length}, rejected=${rejected.length}, messageId=${info.messageId || 'n/a'}`,
      );

      if (accepted.length === 0) {
        throw new BadRequestException(
          `SMTP accepted no recipients. Rejected: ${rejected.join(', ') || 'unknown'}`,
        );
      }
    } catch (error) {
      this.logger.error(`Error sending email to ${to}`, error);
      throw new BadRequestException('Could not send mail');
    }
  }

  // ---- In-App / DB Notifications ----

  async createNotification(
    userId: number,
    type: string,
    title: string,
    body: string,
    metadata: Prisma.InputJsonValue = {},
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        metadata,
      },
    });

    // Push to client
    this.gateway.sendToUser(userId, 'notification:new', notification);

    // Also update unread count
    const unreadCount = await this.getUnreadCount(userId);
    this.gateway.sendToUser(userId, 'notification:count', {
      count: unreadCount,
    });

    return notification;
  }

  async getUserNotifications(userId: number, limit = 50, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markAsRead(id: string, userId: number) {
    const notification = await this.prisma.notification.update({
      where: { id, userId },
      data: { read: true },
    });

    const unreadCount = await this.getUnreadCount(userId);
    this.gateway.sendToUser(userId, 'notification:count', {
      count: unreadCount,
    });

    return notification;
  }

  async markAllAsRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    this.gateway.sendToUser(userId, 'notification:count', { count: 0 });
    return { success: true };
  }

  async getUnreadCount(userId: number) {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // A simple timeout-based reminder for demo purposes
  // In production, you'd use @nestjs/bull or a proper job queue
  scheduleReminder(
    userId: number,
    sessionId: string,
    title: string,
    date: Date,
  ) {
    const now = new Date();
    // Schedule 30 mins before the event
    const runAt = new Date(date.getTime() - 30 * 60 * 1000);
    const delay = runAt.getTime() - now.getTime();

    if (delay > 0) {
      setTimeout(() => {
        void (async () => {
          try {
            await this.createNotification(
              userId,
              'schedule_reminder',
              'Upcoming Session Reminder',
              `Your session "${title}" is starting in 30 minutes.`,
              { sessionId },
            );
          } catch (error) {
            this.logger.error(
              `Failed to send schedule reminder for session ${sessionId}`,
              error,
            );
          }
        })();
      }, delay);
      this.logger.log(
        `Scheduled reminder for session ${sessionId} in ${delay}ms`,
      );
    } else {
      this.logger.warn(
        `Reminder for session ${sessionId} is in the past or too soon.`,
      );
    }
  }

  private getOtpEmailTemplate(code: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #4F46E5; margin: 0;">MockMind AI</h2>
        </div>
        <p style="color: #333; font-size: 16px;">Hello,</p>
        <p style="color: #333; font-size: 16px;">Your One-Time Password (OTP) for accessing MockMind AI is:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="display: inline-block; font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #4F46E5; background: #EEF2FF; padding: 15px 30px; border-radius: 8px;">
            ${code}
          </span>
        </div>
        
        <p style="color: #555; font-size: 14px;">This code is valid for <strong>10 minutes</strong>. Please do not share it with anyone.</p>
        
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
    `;
  }

  private getScheduleInviteTemplate(params: {
    name?: string;
    title: string;
    interviewer: string;
    scheduledAt: Date;
    durationMinutes: number;
    scheduleLink: string;
    assessmentLink: string;
  }): string {
    const scheduledDate = params.scheduledAt.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const safeName = (params.name || 'there').replace(/[<>]/g, '');
    const safeTitle = params.title.replace(/[<>]/g, '');
    const safeInterviewer = params.interviewer.replace(/[<>]/g, '');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <h2 style="margin: 0 0 10px 0; color: #1f2937;">Your session is scheduled</h2>
        <p style="margin: 0 0 16px 0; color: #4b5563;">Hi ${safeName}, your interview prep session is ready.</p>

        <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; background: #f9fafb; margin-bottom: 16px;">
          <p style="margin: 0 0 8px 0; color: #111827; font-size: 16px;"><strong>${safeTitle}</strong></p>
          <p style="margin: 0 0 4px 0; color: #374151;">When: ${scheduledDate}</p>
          <p style="margin: 0 0 4px 0; color: #374151;">Duration: ${params.durationMinutes} minutes</p>
          <p style="margin: 0; color: #374151;">Interviewer: ${safeInterviewer}</p>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px;">
          <a href="${params.scheduleLink}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 14px; border-radius: 8px; font-weight: 600;">Open Schedule</a>
          <a href="${params.assessmentLink}" style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; padding: 10px 14px; border-radius: 8px; font-weight: 600;">Start Assessment</a>
        </div>

        <p style="margin: 12px 0 0 0; color: #6b7280; font-size: 12px;">If the buttons do not work, copy these links:</p>
        <p style="margin: 4px 0; color: #2563eb; font-size: 12px; word-break: break-all;">${params.scheduleLink}</p>
        <p style="margin: 4px 0; color: #0f766e; font-size: 12px; word-break: break-all;">${params.assessmentLink}</p>
      </div>
    `;
  }
}
