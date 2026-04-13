import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const MIN_HISTORY_INTERVAL_SECONDS = 5;
const MAX_HISTORY_INTERVAL_SECONDS = 300;
const MAX_AI_INTERVIEWERS = 4;
const AI_AGENT_EMAIL_DOMAIN = 'virtual.interview.local';

const PERSONA_DISPLAY_NAME_MAP: Record<string, string> = {
  sarah: 'Sarah',
  david: 'David',
  alex: 'Alex',
  maya: 'Maya',
};

function normalizeHistoryInterval(raw: unknown): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(
    MIN_HISTORY_INTERVAL_SECONDS,
    Math.min(MAX_HISTORY_INTERVAL_SECONDS, Math.round(parsed)),
  );
}

function mergeSystemPromptWithHistoryInterval(
  systemPrompt: unknown,
  historyIntervalSec: unknown,
): string | null {
  const normalizedInterval = normalizeHistoryInterval(historyIntervalSec);
  const basePrompt =
    typeof systemPrompt === 'string' ? systemPrompt.trim() : '';

  if (normalizedInterval === null) {
    return basePrompt || null;
  }

  let payload: Record<string, unknown> = {};

  if (basePrompt) {
    try {
      const parsed = JSON.parse(basePrompt);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      } else {
        payload = { prompt: basePrompt };
      }
    } catch {
      payload = { prompt: basePrompt };
    }
  }

  payload.historySnapshotIntervalSec = normalizedInterval;
  return JSON.stringify(payload);
}

function normalizePersonaKey(raw: unknown): string {
  const normalized = String(raw || 'sarah').trim().toLowerCase();
  return normalized || 'sarah';
}

function personaDisplayName(personaKey: string): string {
  const mapped = PERSONA_DISPLAY_NAME_MAP[personaKey];
  if (mapped) {
    return mapped;
  }

  const cleaned = personaKey.replace(/[^a-z0-9\s_-]/gi, '').trim();
  if (!cleaned) {
    return 'Sarah';
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeDesignation(raw: unknown): string {
  const designation = String(raw || '').trim();
  return designation || 'Technical Head';
}

type NormalizedAiAgent = {
  persona: string;
  displayName: string;
  designation: string;
  email: string;
};

function buildAiAgentEmail(index: number, persona: string): string {
  const safePersona = persona.replace(/[^a-z0-9_-]/gi, '') || 'agent';
  return `ai-agent+${index + 1}-${safePersona}@${AI_AGENT_EMAIL_DOMAIN}`;
}

function normalizeAiAgents(
  rawAiAgents: unknown,
  fallbackPersona: unknown,
  fallbackCount: unknown,
): NormalizedAiAgent[] {
  if (Array.isArray(rawAiAgents) && rawAiAgents.length > 0) {
    const normalizedAgents = rawAiAgents
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const persona = normalizePersonaKey(record.persona);
        const displayName = personaDisplayName(persona);
        const designation = normalizeDesignation(record.designation);

        return {
          persona,
          displayName,
          designation,
          email: buildAiAgentEmail(index, persona),
        };
      })
      .filter((agent): agent is NormalizedAiAgent => Boolean(agent))
      .slice(0, MAX_AI_INTERVIEWERS);

    if (normalizedAgents.length > 0) {
      return normalizedAgents;
    }
  }

  const panelSize = Math.max(
    1,
    Math.min(MAX_AI_INTERVIEWERS, Math.round(Number(fallbackCount || 1) || 1)),
  );
  const fallbackPersonaKey = normalizePersonaKey(fallbackPersona);
  const fallbackPool = [fallbackPersonaKey, 'david', 'alex', 'maya'];

  return Array.from({ length: panelSize }).map((_, index) => {
    const persona = normalizePersonaKey(fallbackPool[index] || fallbackPersonaKey);
    const displayName = personaDisplayName(persona);
    const designation = index === 0 ? 'Technical Head' : 'Panel Interviewer';

    return {
      persona,
      displayName,
      designation,
      email: buildAiAgentEmail(index, persona),
    };
  });
}

function extractAiAgentsFromSystemPrompt(systemPrompt: unknown): unknown[] {
  if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(systemPrompt);
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const aiAgents = (parsed as Record<string, unknown>).aiAgents;
    return Array.isArray(aiAgents) ? aiAgents : [];
  } catch {
    return [];
  }
}

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async createSession(userId: number, data: any) {
    const participants: any[] = [];
    const aiAgentsFromPrompt = extractAiAgentsFromSystemPrompt(data.systemPrompt);
    const aiAgents = normalizeAiAgents(
      Array.isArray(data.aiAgents) && data.aiAgents.length > 0
        ? data.aiAgents
        : aiAgentsFromPrompt,
      data.persona,
      data.interviewerCount,
    );
    const sessionSystemPrompt = mergeSystemPromptWithHistoryInterval(
      data.systemPrompt,
      data.historySnapshotIntervalSec,
    );

    // Add the creator as the default participant
    participants.push({
      email: data.participantEmail || 'candidate@example.com',
      role: 'Candidate',
      status: 'joined',
    });

    // Add invites if present
    if (data.invites && Array.isArray(data.invites)) {
      data.invites.forEach((inv: any) => {
        if (inv.email) {
          participants.push({
            email: inv.email,
            role: inv.role || 'Observer',
            status: 'invited',
          });
        }
      });
    }

    aiAgents.forEach((agent) => {
      participants.push({
        email: agent.email,
        name: `${agent.displayName} (${agent.designation})`,
        role: 'Interviewer',
        status: 'joined',
      });
    });

    return this.prisma.interviewSession
      .create({
        data: {
          userId,
          title: data.topic || data.title || 'Custom Interview Session',
          jobRole: data.jobRole,
          focusAreas: data.description || data.focusAreas,
          companyInfo: data.companyInfo,
          resumeText: data.resumeText,
          accessType: data.accessType || 'link',
          type: data.type || 'Technical',
          difficulty: data.difficulty || 'medium',
          aiBehavior: data.mode || data.aiBehavior || 'learning',
          persona: aiAgents[0]?.displayName || data.persona || 'Sarah',
          systemPrompt: sessionSystemPrompt,
          status: 'pending',
          materials: data.files || data.materials || [],
          participants: {
            create: participants,
          },
        },
      })
      .then((session) => {
        // Mock sending email to invited participants
        if (data.invites && Array.isArray(data.invites)) {
          console.log(
            `\n\n[Email Service] \x1b[32mSending invitations for session ${session.id}\x1b[0m`,
          );
          data.invites.forEach((inv: any) => {
            if (inv.email) {
              const meetingLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/interview?sessionId=${session.id}`;
              console.log(`  -> To: ${inv.email}`);
              console.log(
                `     Subject: You're invited to an Interview Session: ${session.title}`,
              );
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
        template: true,
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
      },
    });
  }

  async updateSession(
    id: string,
    userId: number,
    userEmail: string | undefined,
    data: any,
  ) {
    const session = await this.getSession(id, userId, userEmail);
    return this.prisma.interviewSession.update({
      where: { id: session.id },
      data,
    });
  }

  async inviteToSession(
    id: string,
    userId: number,
    emails: string[],
    accessType?: string,
  ) {
    const session = await this.prisma.interviewSession.findFirst({
      where: { id, userId },
      include: { participants: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found or access denied');
    }

    const normalized = (emails || [])
      .map((email) =>
        String(email || '')
          .trim()
          .toLowerCase(),
      )
      .filter((email) => email.length > 0);

    if (normalized.length === 0) {
      return session;
    }

    const existingEmails = new Set(
      (session.participants || []).map((p) =>
        String(p.email || '')
          .trim()
          .toLowerCase(),
      ),
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

      console.log(
        `\n\n[Email Service] \x1b[32mSending invitations for session ${session.id}\x1b[0m`,
      );
      newParticipants.forEach((p) => {
        const meetingLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/interview?sessionId=${session.id}`;
        console.log(`  -> To: ${p.email}`);
        console.log(
          `     Subject: You're invited to an Interview Session: ${session.title}`,
        );
        console.log(`     Link to join: ${meetingLink}\n`);
      });
    }

    return this.prisma.interviewSession.findFirst({
      where: { id: session.id },
      include: { participants: true, report: true },
    });
  }
}
