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
    });
  }

  async getSession(id: string, userId: number) {
    const session = await this.prisma.interviewSession.findFirst({
      where: { id, userId },
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

  async updateSession(id: string, userId: number, data: any) {
    const session = await this.getSession(id, userId);
    return this.prisma.interviewSession.update({
      where: { id: session.id },
      data,
    });
  }
}
