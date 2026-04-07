import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

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
    }).then(session => {
      // Mock sending email to invited participants
      if (data.invites && Array.isArray(data.invites)) {
        console.log(`\n\n[Email Service] \x1b[32mSending invitations for session ${session.id}\x1b[0m`);
        data.invites.forEach((inv: any) => {
          if (inv.email) {
            const meetingLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/interview?sessionId=${session.id}`;
            console.log(`  -> To: ${inv.email}`);
            console.log(`     Subject: You're invited to an Interview Session: ${session.title}`);
            console.log(`     Link to join: ${meetingLink}\n`);
          }
        });
      }
      return session;
    });
  }

  async getSession(id: string, userId: number, userEmail?: string) {
    const accessOr: any[] = [{ userId }];
    if (userEmail) {
      accessOr.push({
        participants: {
          some: { email: userEmail },
        },
      });
    }

    const session = await this.prisma.interviewSession.findFirst({
      where: { id, OR: accessOr },
      include: {
        participants: true,
        report: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found or access denied');
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

  async updateSession(id: string, userId: number, userEmail: string | undefined, data: any) {
    const session = await this.getSession(id, userId, userEmail);
    return this.prisma.interviewSession.update({
      where: { id: session.id },
      data,
    });
  }

  async inviteToSession(id: string, userId: number, emails: string[], accessType?: string) {
    const session = await this.prisma.interviewSession.findFirst({
      where: { id, userId },
      include: { participants: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found or access denied');
    }

    const normalized = (emails || [])
      .map((email) => String(email || '').trim().toLowerCase())
      .filter((email) => email.length > 0);

    if (normalized.length === 0) {
      return session;
    }

    const existingEmails = new Set(
      (session.participants || []).map((p) => String(p.email || '').trim().toLowerCase()),
    );

    const newParticipants = normalized
      .filter((email) => !existingEmails.has(email))
      .map((email) => ({
        email,
        role: accessType === 'candidate' ? 'Candidate' : 'Observer',
        status: 'invited',
      }));

    if (newParticipants.length > 0) {
      await this.prisma.sessionParticipant.createMany({
        data: newParticipants.map((p) => ({
          sessionId: session.id,
          email: p.email,
          role: p.role,
          status: p.status,
        })),
      });

      console.log(`\n\n[Email Service] \x1b[32mSending invitations for session ${session.id}\x1b[0m`);
      newParticipants.forEach((p) => {
        const meetingLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/interview?sessionId=${session.id}`;
        console.log(`  -> To: ${p.email}`);
        console.log(`     Subject: You're invited to an Interview Session: ${session.title}`);
        console.log(`     Link to join: ${meetingLink}\n`);
      });
    }

    return this.prisma.interviewSession.findFirst({
      where: { id: session.id },
      include: { participants: true, report: true },
    });
  }
}
