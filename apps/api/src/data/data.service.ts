import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Default data for when database is empty
const defaultUser = {
  id: 1,
  name: 'Alex Rivera',
  role: 'Senior Software Engineer',
  avatar: 'https://i.pravatar.cc/150?u=alex',
  level: 'Pro',
};

const defaultInterviewTemplates = [
  {
    id: 'behavioral-general',
    title: 'Behavioral: General',
    description:
      'Practice common behavioral questions like "Tell me about yourself" and situational scenarios.',
    duration: '30-45 min',
    difficulty: 'Beginner',
    icon: 'Users',
    color: 'bg-blue-500',
  },
  {
    id: 'tech-system-design',
    title: 'Tech: System Design',
    description:
      'Deep dive into system design concepts and architectural patterns.',
    duration: '45-60 min',
    difficulty: 'Advanced',
    icon: 'Cpu',
    color: 'bg-purple-500',
  },
  {
    id: 'tech-algorithms',
    title: 'Tech: Algorithms & DS',
    description:
      'Practice data structures and algorithm problems with live coding.',
    duration: '45 min',
    difficulty: 'Intermediate',
    icon: 'Code',
    color: 'bg-green-500',
  },
  {
    id: 'leadership-management',
    title: 'Leadership & Management',
    description:
      'Questions focused on leadership experience and management scenarios.',
    duration: '30-45 min',
    difficulty: 'Intermediate',
    icon: 'Briefcase',
    color: 'bg-orange-500',
  },
];

const defaultProgressStats = [
  {
    label: 'Sessions Completed',
    value: 0,
    change: 0,
    history: [],
  },
  {
    label: 'Average Score',
    value: 0,
    change: 0,
    history: [],
  },
  {
    label: 'Hours Practiced',
    value: 0,
    change: 0,
    history: [],
  },
  { label: 'Streak Days', value: 0, change: 0, history: [] },
];

const defaultReportLatest = {
  id: 'report-latest',
  date: '2024-01-15',
  overallScore: 85,
  duration: '45:30',
  hardSkillsScore: 88,
  softSkillsScore: 82,
  radarData: [
    { subject: 'Communication', A: 85 },
    { subject: 'Technical', A: 88 },
    { subject: 'Problem Solving', A: 82 },
    { subject: 'Leadership', A: 78 },
    { subject: 'Adaptability', A: 80 },
  ],
  timelineData: [
    { time: '0:00', engagement: 70, confidence: 65 },
    { time: '10:00', engagement: 80, confidence: 75 },
    { time: '20:00', engagement: 85, confidence: 82 },
    { time: '30:00', engagement: 78, confidence: 80 },
    { time: '45:00', engagement: 90, confidence: 88 },
  ],
  fillerWordsAnalysis: [
    { word: 'um', count: 12, percentage: 40 },
    { word: 'like', count: 8, percentage: 27 },
    { word: 'you know', count: 6, percentage: 20 },
    { word: 'so', count: 4, percentage: 13 },
  ],
  pacingAnalysis: [
    { segment: 'Intro', wpm: 145, ideal: 150 },
    { segment: 'Technical', wpm: 165, ideal: 150 },
    { segment: 'Behavioral', wpm: 140, ideal: 150 },
    { segment: 'Q&A', wpm: 155, ideal: 150 },
  ],
  behavioralAnalysis: {
    confidence: { score: 82, trend: 'up' },
    clarity: { score: 85, trend: 'stable' },
    enthusiasm: { score: 78, trend: 'up' },
    professionalism: { score: 90, trend: 'stable' },
  },
  swot: {
    strengths: [
      'Strong technical explanations',
      'Good use of STAR method',
      'Confident body language',
    ],
    weaknesses: [
      'Occasional filler words',
      'Could improve pacing in technical sections',
    ],
    opportunities: ['Practice more system design', 'Work on concise answers'],
    threats: ['May rush when nervous', 'Complex questions need more structure'],
  },
  resources: [
    {
      title: 'STAR Method Deep Dive',
      type: 'article',
      url: '#',
      description: 'Master behavioral questions with the STAR framework',
    },
    {
      title: 'System Design Basics',
      type: 'video',
      url: '#',
      description: 'Learn scalable system design patterns',
    },
  ],
  questions: [
    {
      id: 1,
      question: 'Tell me about a time you led a challenging project',
      userAnswerSummary:
        'Discussed leading a migration project with tight deadlines and cross-team coordination.',
      aiFeedback:
        'Great use of STAR method. Consider adding more specific metrics about the impact.',
      score: 88,
      improvements: [
        'Add quantifiable outcomes',
        'Mention team size explicitly',
      ],
    },
    {
      id: 2,
      question: 'How would you design a URL shortening service?',
      userAnswerSummary:
        'Covered hashing strategies, database choices, and caching considerations.',
      aiFeedback:
        'Strong technical depth. Could improve by discussing failure scenarios.',
      score: 85,
      improvements: ['Discuss failure modes', 'Consider rate limiting'],
    },
  ],
  transcript: [
    {
      speaker: 'Interviewer',
      text: 'Thank you for joining us today.',
      timestamp: '0:00',
    },
    {
      speaker: 'You',
      text: 'Thank you for having me. I am excited to be here.',
      timestamp: '0:05',
    },
  ],
};

const defaultPastInterviews = [
  {
    id: 'int-1',
    title: 'System Design: URL Shortener',
    date: '2024-01-10',
    duration: '45 min',
    score: 88,
    type: 'Tech',
  },
  {
    id: 'int-2',
    title: 'Behavioral: Leadership',
    date: '2024-01-08',
    duration: '35 min',
    score: 82,
    type: 'Behavioral',
  },
  {
    id: 'int-3',
    title: 'Tech: React Deep Dive',
    date: '2024-01-05',
    duration: '50 min',
    score: 90,
    type: 'Tech',
  },
];

@Injectable()
export class DataService {
  private userData = { ...defaultUser };

  constructor(private prisma: PrismaService) {}

  async getUser(userId: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatar: true,
          level: true,
          isVerified: true,
          createdAt: true,
        },
      });
      return user || this.userData;
    } catch {
      return this.userData;
    }
  }

  async updateUser(userId: number, data: any) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: data.name,
          avatar: data.avatar,
          role: data.role,
          level: data.level,
          email: data.email,
        },
      });
    } catch {
      this.userData = { ...this.userData, ...data };
      return this.userData;
    }
  }

  async deleteUser(userId: number) {
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch (error) {
      console.error('Failed to delete user:', error);
      throw error;
    }
  }

  async getInterviewTemplates() {
    try {
      const templates = await this.prisma.interviewTemplate.findMany();
      return templates.length > 0 ? templates : defaultInterviewTemplates;
    } catch {
      return defaultInterviewTemplates;
    }
  }

  async createInterviewTemplate(data: any) {
    try {
      return await this.prisma.interviewTemplate.create({
        data: {
          id: data.id || undefined,
          title: data.title,
          description: data.description || '',
          duration: data.duration || '45 min',
          difficulty: data.difficulty || 'Medium',
          icon: data.icon || 'Brain',
          color: data.color || 'bg-blue-500',
          type: data.type || 'Custom',
          systemPrompt:
            typeof data.systemPrompt === 'string' ? data.systemPrompt : null,
        },
      });
    } catch (error) {
      console.error('Failed to create template in DB:', error);
      // Return the data as-is for graceful degradation
      return { ...data, id: data.id || `tpl-${Date.now()}` };
    }
  }

  async updateInterviewTemplate(id: string, data: any) {
    try {
      return await this.prisma.interviewTemplate.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          duration: data.duration,
          difficulty: data.difficulty,
          icon: data.icon,
          color: data.color,
          type: data.type,
          isPublished:
            data.isPublished !== undefined ? data.isPublished : undefined,
          publishedAt: data.publishedAt
            ? new Date(data.publishedAt)
            : undefined,
          systemPrompt:
            typeof data.systemPrompt === 'string'
              ? data.systemPrompt
              : undefined,
        },
      });
    } catch (error) {
      console.error('Failed to update template in DB:', error);
      return { id, ...data };
    }
  }

  async deleteInterviewTemplate(id: string) {
    try {
      await this.prisma.interviewTemplate.delete({ where: { id } });
    } catch (error) {
      console.error('Failed to delete template in DB:', error);
    }
  }

  async getProgressStats(userId: number) {
    const normalizedUserId = Number(userId);
    if (!Number.isFinite(normalizedUserId)) {
      return defaultProgressStats;
    }

    try {
      // Always derive from reports to avoid showing seeded/static legacy rows
      // when a user has not completed interviews yet.
      return this.buildProgressStatsFromReports(normalizedUserId);
    } catch {
      return defaultProgressStats;
    }
  }

  private async buildProgressStatsFromReports(userId: number) {
    const reports = await this.prisma.report.findMany({
      where: {
        session: {
          userId,
        },
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        overallScore: true,
        session: {
          select: {
            duration: true,
          },
        },
      },
    });

    if (reports.length === 0) {
      return defaultProgressStats;
    }

    const now = new Date();
    const currentWindowStart = new Date(now);
    currentWindowStart.setUTCDate(currentWindowStart.getUTCDate() - 30);
    const previousWindowStart = new Date(currentWindowStart);
    previousWindowStart.setUTCDate(previousWindowStart.getUTCDate() - 30);

    const currentWindowReports = reports.filter(
      (report) => report.date >= currentWindowStart,
    );
    const previousWindowReports = reports.filter(
      (report) =>
        report.date >= previousWindowStart && report.date < currentWindowStart,
    );

    const totalSessions = reports.length;
    const totalScore = reports.reduce(
      (sum, report) => sum + (report.overallScore || 0),
      0,
    );
    const averageScore = Math.round(totalScore / totalSessions);

    const totalDurationSeconds = reports.reduce(
      (sum, report) => sum + (report.session?.duration || 0),
      0,
    );
    const totalHours = Number((totalDurationSeconds / 3600).toFixed(1));

    const currentAvgScore =
      currentWindowReports.length > 0
        ? Math.round(
            currentWindowReports.reduce(
              (sum, report) => sum + (report.overallScore || 0),
              0,
            ) / currentWindowReports.length,
          )
        : 0;
    const previousAvgScore =
      previousWindowReports.length > 0
        ? Math.round(
            previousWindowReports.reduce(
              (sum, report) => sum + (report.overallScore || 0),
              0,
            ) / previousWindowReports.length,
          )
        : 0;

    const currentHours = Number(
      (
        currentWindowReports.reduce(
          (sum, report) => sum + (report.session?.duration || 0),
          0,
        ) / 3600
      ).toFixed(1),
    );
    const previousHours = Number(
      (
        previousWindowReports.reduce(
          (sum, report) => sum + (report.session?.duration || 0),
          0,
        ) / 3600
      ).toFixed(1),
    );

    const streakDays = this.calculateStreakDays(
      reports.map((report) => report.date),
    );
    const previousStreakDays = this.calculateStreakDays(
      previousWindowReports.map((report) => report.date),
    );

    const monthBuckets = this.getRecentMonthKeys(6, now);
    const monthBucketSet = new Set(monthBuckets);
    const reportsByMonth = new Map<
      string,
      Array<{
        date: Date;
        overallScore: number;
        session: { duration: number | null } | null;
      }>
    >();

    for (const report of reports) {
      const monthKey = this.toMonthKey(report.date);
      if (!monthBucketSet.has(monthKey)) {
        continue;
      }
      const existing = reportsByMonth.get(monthKey) || [];
      existing.push(report);
      reportsByMonth.set(monthKey, existing);
    }

    const sessionsHistory = monthBuckets.map(
      (month) => reportsByMonth.get(month)?.length || 0,
    );
    const averageScoreHistory = monthBuckets.map((month) => {
      const monthReports = reportsByMonth.get(month) || [];
      if (monthReports.length === 0) {
        return 0;
      }
      const scoreSum = monthReports.reduce(
        (sum, report) => sum + (report.overallScore || 0),
        0,
      );
      return Math.round(scoreSum / monthReports.length);
    });
    const hoursHistory = monthBuckets.map((month) => {
      const monthReports = reportsByMonth.get(month) || [];
      if (monthReports.length === 0) {
        return 0;
      }
      const durationSumSeconds = monthReports.reduce(
        (sum, report) => sum + (report.session?.duration || 0),
        0,
      );
      return Number((durationSumSeconds / 3600).toFixed(1));
    });
    const streakHistory = monthBuckets.map((month) => {
      const monthReports = reportsByMonth.get(month) || [];
      if (monthReports.length === 0) {
        return 0;
      }
      return this.calculateStreakDays(monthReports.map((report) => report.date));
    });

    return [
      {
        label: 'Sessions Completed',
        value: totalSessions,
        change: currentWindowReports.length - previousWindowReports.length,
        history: sessionsHistory,
      },
      {
        label: 'Average Score',
        value: averageScore,
        change: currentAvgScore - previousAvgScore,
        history: averageScoreHistory,
      },
      {
        label: 'Hours Practiced',
        value: totalHours,
        change: Number((currentHours - previousHours).toFixed(1)),
        history: hoursHistory,
      },
      {
        label: 'Streak Days',
        value: streakDays,
        change: streakDays - previousStreakDays,
        history: streakHistory,
      },
    ];
  }

  private calculateStreakDays(dates: Date[]) {
    if (dates.length === 0) {
      return 0;
    }

    const dayKeys = Array.from(
      new Set(dates.map((date) => this.toDayKey(date))),
    ).sort((a, b) => b.localeCompare(a));

    let streak = 0;
    let cursor = this.dayKeyToDate(dayKeys[0]);

    for (const dayKey of dayKeys) {
      const dayDate = this.dayKeyToDate(dayKey);
      if (dayDate.getTime() === cursor.getTime()) {
        streak += 1;
        cursor = new Date(cursor);
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        continue;
      }

      break;
    }

    return streak;
  }

  private getRecentMonthKeys(count: number, referenceDate: Date) {
    return Array.from({ length: count }, (_, index) => {
      const monthDate = new Date(
        Date.UTC(
          referenceDate.getUTCFullYear(),
          referenceDate.getUTCMonth() - (count - 1 - index),
          1,
        ),
      );
      return this.toMonthKey(monthDate);
    });
  }

  private toMonthKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  private toDayKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  private dayKeyToDate(dayKey: string) {
    return new Date(`${dayKey}T00:00:00.000Z`);
  }

  async getLatestReport(userId?: number, _userEmail?: string) {
    try {
      if (!userId) {
        return null;
      }

      const report = await this.prisma.report.findFirst({
        where: {
          session: {
            userId: Number(userId),
          },
        },
        include: {
          questions: true,
          transcripts: true,
        },
        orderBy: { date: 'desc' },
      });
      if (report) {
        // Map Prisma DB naming back to Frontend expectations
        const { transcripts, ...rest } = report as any;
        return {
          ...rest,
          transcript: transcripts,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async getPastInterviews(userId?: number, _userEmail?: string) {
    try {
      if (!userId) {
        return [];
      }

      const reports = await this.prisma.report.findMany({
        where: {
          session: {
            userId: Number(userId),
          },
        },
        orderBy: { date: 'desc' },
        include: {
          session: {
            include: { template: true },
          },
        },
      });
      return reports.map((r) => ({
        id: r.id,
        title:
          r.session?.title || r.session?.template?.title || 'Interview Session',
        date: r.date.toISOString(),
        duration: r.duration || '45:00',
        type: r.session?.template?.type || 'Technical',
        score: r.overallScore || 0,
      }));
    } catch (e) {
      console.error('Error fetching past interviews:', e);
      return [];
    }
  }

  async createReport(data: any) {
    try {
      const { transcript, ...rest } = data;

      return await this.prisma.report.create({
        data: {
          id: rest.id,
          session: { connect: { id: rest.sessionId || 'dummy' } },
          date: rest.date,
          overallScore: rest.overallScore,
          duration: rest.duration,
          hardSkillsScore: rest.hardSkillsScore,
          softSkillsScore: rest.softSkillsScore,
          radarData: rest.radarData,
          timelineData: rest.timelineData,
          fillerWordsAnalysis: rest.fillerWordsAnalysis,
          pacingAnalysis: rest.pacingAnalysis,
          behavioralAnalysis: rest.behavioralAnalysis,
          swot: rest.swot,
          resources: rest.resources,
          questions: {
            create: (rest.questions || []).map((q: any) => ({
              question: q.question,
              userAnswerSummary: q.userAnswerSummary,
              aiFeedback: q.aiFeedback,
              score: q.score,
              improvements: q.improvements,
              audioUrl: q.audioUrl || null,
            })),
          },
          transcripts: {
            create: (transcript || []).map((t: any) => ({
              speaker: t.speaker,
              text: t.text,
              timestamp: t.timestamp,
            })),
          },
        },
      });
    } catch (error) {
      console.error('Failed to create report in DB:', error);
      throw error;
    }
  }
}
