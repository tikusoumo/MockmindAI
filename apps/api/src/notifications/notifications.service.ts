import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
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
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
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

  async sendEmail(to: string, subject: string, html: string) {
    try {
      if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
        this.logger.warn(
          `SMTP credentials not configured. Mock sending email to ${to}`,
        );
        return;
      }
      await this.transporter.sendMail({
        from: '"MockMind AI" <' + process.env.SMTP_USER + '>',
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}`);
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
    metadata: any = {},
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
      setTimeout(async () => {
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
}
