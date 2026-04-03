import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationsService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(NotificationsService.name);

  constructor() {
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
    return this.sendEmail(email, 'Your MockMind AI Verification Code', htmlContent);
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: '"MockMind AI" <' + process.env.SMTP_USER + '>',
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Error sending email to ${to}`, error);
      throw new BadRequestException("Could not send mail");
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
