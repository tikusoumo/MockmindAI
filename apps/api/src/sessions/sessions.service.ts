import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService
  ) {}

  async createSession(userId: number, data: any) {
    const participants: any[] = [];
    
    // Add the creator as the default participant
    participants.push({
      email: data.participantEmail || 'candidate@example.com',
      role: 'Candidate',
      status: 'joined'
    });

    // Add invites if present
    if (data.invites && Array.isArray(data.invites)) {
      data.invites.forEach((inv: any) => {
        if (inv.email) {
          participants.push({
            email: inv.email,
            role: inv.role || 'Observer',
            status: 'invited'
          });
        }
      });
    }

    return this.prisma.interviewSession.create({
      data: {
        userId,
        // @ts-ignore
        accessType: data.accessType || 'link',
        title: data.topic || data.title || 'Custom Interview Session',
        jobRole: data.jobRole,
        focusAreas: data.description || data.focusAreas,
        companyInfo: data.companyInfo,
        resumeText: data.resumeText,
        type: data.type || 'Technical',
        difficulty: data.difficulty || 'medium',
        aiBehavior: data.mode || data.aiBehavior || 'learning',
        persona: data.persona || 'Sarah',
        status: 'pending',
        materials: data.files || data.materials || [],
        participants: {
          create: participants
        }
      },
    }).then(async session => {
      // Send real email to invited participants
      if (data.invites && Array.isArray(data.invites)) {
        console.log(`\n\n[Email Service] \x1b[32mSending invitations for session ${session.id}\x1b[0m`);
        for (const inv of data.invites) {
          if (inv.email) {
            const meetingLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/interview?sessionId=${session.id}`;
            const subject = `You're invited to an Interview Session: ${session.title}`;
            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h2 style="color: #4F46E5; margin: 0;">MockMind AI</h2>
                </div>
                <p style="color: #333; font-size: 16px;">Hello,</p>
                <p style="color: #333; font-size: 16px;">You have been invited to join an interview session: <strong>${session.title}</strong>.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${meetingLink}" style="display: inline-block; font-size: 16px; font-weight: bold; color: #ffffff; background: #4F46E5; padding: 15px 30px; border-radius: 8px; text-decoration: none;">
                    Join Session
                  </a>
                </div>
                
                <p style="color: #555; font-size: 14px;">If the button above does not work, simply copy and paste this link into your browser:</p>
                <p style="color: #4F46E5; font-size: 14px; word-break: break-all;">${meetingLink}</p>
                
                <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
                <p style="color: #999; font-size: 12px; text-align: center;">
                  If you didn't expect this invitation, you can safely ignore this email.
                </p>
              </div>
            `;
            try {
              await this.notificationsService.sendEmail(inv.email, subject, html);
              console.log(`  -> Sent to: ${inv.email}`);
            } catch (err) {
              console.error(`  -> Failed to send to: ${inv.email}`, err);
            }
          }
        }
      }
      return session;
    });
  }

  async getSession(id: string, userId: number, userEmail: string = '') {
    const session = await this.prisma.interviewSession.findFirst({
      where: { id },
      include: {
        participants: true,
        report: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found or access denied');
    }

    if (session.userId !== userId) {
      const isInvited = session.participants.some(p => p.email === userEmail || p.userId === userId);
      // @ts-ignore
      if (session.accessType === 'restricted' && !isInvited) {
        throw new NotFoundException('Session not found or access denied');
      }
    }

    return session;
  }

  async getUserSessions(userId: number) {
    return this.prisma.interviewSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        participants: true,
      }
    });
  }

  async updateSession(id: string, userId: number, userEmail: string, data: any) {
    const session = await this.getSession(id, userId, userEmail);
    return this.prisma.interviewSession.update({
      where: { id: session.id },
      data,
    });
  }

  async inviteToSession(id: string, userId: number, emails: string[], accessType?: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id, userId },
      include: { participants: true }
    });

    if (!session) {
      throw new NotFoundException('Session not found or only host can invite');
    }

    if (accessType && accessType !== (session as any).accessType) {
      await this.prisma.interviewSession.update({
        where: { id },
        // @ts-ignore
        data: { accessType }
      });
      (session as any).accessType = accessType;
    }

    const newInvites: string[] = [];

    if (emails && emails.length > 0) {
      for (const email of emails) {
        if (!email) continue;
        // prevent duplicate
        if (session.participants.some(p => p.email === email)) continue;
        
        await this.prisma.sessionParticipant.create({
          data: {
            sessionId: id,
            email,
            role: 'Candidate',
            status: 'invited'
          }
        });
        newInvites.push(email);
      }
    }

    if (newInvites.length > 0) {
      console.log(`\n\n[Email Service] \x1b[32mSending mid-session invitations for ${session.id}\x1b[0m`);
      for (const email of newInvites) {
        const meetingLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/interview?sessionId=${session.id}`;
        const subject = `You're invited to an Interview Session: ${session.title}`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #4F46E5; margin: 0;">MockMind AI</h2>
            </div>
            <p style="color: #333; font-size: 16px;">Hello,</p>
            <p style="color: #333; font-size: 16px;">You have been invited to join an interview session: <strong>${session.title}</strong>.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${meetingLink}" style="display: inline-block; font-size: 16px; font-weight: bold; color: #ffffff; background: #4F46E5; padding: 15px 30px; border-radius: 8px; text-decoration: none;">
                Join Session
              </a>
            </div>
            
            <p style="color: #555; font-size: 14px;">If the button above does not work, simply copy and paste this link into your browser:</p>
            <p style="color: #4F46E5; font-size: 14px; word-break: break-all;">${meetingLink}</p>
            
            <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
          </div>
        `;
        try {
          await this.notificationsService.sendEmail(email, subject, html);
        } catch (err) {
          console.error(`  -> Failed to send to: ${email}`, err);
        }
      }
    }

    return { success: true, invited: newInvites };
  }
}
