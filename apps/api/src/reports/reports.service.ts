import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  ReportResponseDto,
  ReportListItemDto,
  GenerateReportRequestDto,
  AnalysisRating,
  AnalysisLevel,
  AnalysisPace,
} from './dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly pendingTimeoutSeconds = Number(process.env.REPORT_PENDING_TIMEOUT_SECONDS || 90);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new report for a completed interview session.
   * This calls the Python AI service to run the analysis.
   */
  async generateReport(dto: GenerateReportRequestDto): Promise<ReportResponseDto> {
    this.logger.log(`Generating report for session: ${dto.sessionId}`);

    // Call Python AI service to generate report
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://agent-api:8001';
    
    try {
      const response = await fetch(`${aiServiceUrl}/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: dto.sessionId,
          template_id: dto.templateId,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}`);
      }

      const reportData = await response.json();

      // Save report to database (if schema exists)
      // For now, just return the data from AI service
      this.logger.log(`Report generated: ${reportData.id}`);
      
      return this.mapToResponseDto(reportData);
    } catch (error) {
      this.logger.error(`Failed to generate report: ${error}`);
      throw new InternalServerErrorException('Failed to generate report');
    }
  }

  /**
   * Get the latest report (most recently generated).
   */
  async getLatestReport(): Promise<ReportResponseDto> {
    this.logger.log('Fetching latest report');
    const existing = await this.prisma.report.findFirst({
        orderBy: { date: 'desc' },
        include: { questions: true, transcripts: true }
    });
    if (!existing) {
      throw new NotFoundException('No reports found');
    }
    return this.mapPrismaToDto(existing);
  }

  /**
   * Get a report by ID or sessionId.
   */
  async getReport(id: string): Promise<ReportResponseDto> {
    this.logger.log(`Fetching report: ${id}`);

    const existingById = await this.prisma.report.findUnique({
        where: { id },
        include: { questions: true, transcripts: true }
    });
    if (existingById) return this.mapPrismaToDto(existingById);

    // Try finding by sessionId just in case the frontend sends that
    const existingBySession = await this.prisma.report.findUnique({
        where: { sessionId: id },
        include: { questions: true, transcripts: true }
    });
    if (existingBySession) return this.mapPrismaToDto(existingBySession);

    // Session exists but report is still being generated: return a pending marker
    const existingSession = await this.prisma.interviewSession.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        startedAt: true,
        createdAt: true,
      },
    });
    if (existingSession) {
      const referenceTime = existingSession.startedAt ?? existingSession.createdAt;
      const pendingAgeSeconds = Math.floor(
        (Date.now() - referenceTime.getTime()) / 1000,
      );

      if (pendingAgeSeconds >= this.pendingTimeoutSeconds) {
        this.logger.warn(
          `Session ${id} pending for ${pendingAgeSeconds}s (timeout=${this.pendingTimeoutSeconds}s). Creating fallback report.`,
        );
        return this.createPendingTimeoutFallbackReport(id);
      }

      return this.getPendingReport(id);
    }

    throw new NotFoundException(`Report not found for id/session: ${id}`);
  }

  /**
   * List all reports for a user.
   */
  async listReports(userId?: string): Promise<ReportListItemDto[]> {
    this.logger.log(`Listing reports for user: ${userId || 'all'}`);
    const condition = userId ? { session: { userId: Number(userId) } } : {};

    const reports = await this.prisma.report.findMany({
        where: condition as any,
        orderBy: { date: 'desc' },
        include: { session: { select: { title: true } } }
    });

    if (reports.length === 0) {
        return [];
    }

    return reports.map(r => ({
        id: r.id,
        date: r.date.toISOString(),
        overallScore: r.overallScore,
        duration: r.duration,
        templateTitle: r.session?.title || 'Custom Session'
    }));
  }

  /**
   * Delete a report.
   */
  async deleteReport(id: string): Promise<void> {
    this.logger.log(`Deleting report: ${id}`);
    try {
        await this.prisma.report.delete({ where: { id } });
    } catch(e) {
        // Ignored in mock
    }
  }

  /**
   * Save a webhook payload from the Python Agent directly to PostgreSQL.
   */
  async saveWebhookReport(payload: any): Promise<void> {
    this.logger.log(`Received webhook report for session: ${payload.session_id || payload.sessionId || '(missing)'}`);

    const sessionId = payload.session_id || payload.sessionId;
    if (!sessionId) {
      this.logger.warn(`Webhook payload missing session_id. report_id=${payload?.id || '(none)'}`);
        return;
    }

    const radarData = payload.radarData ?? payload.radar_data ?? [];
    const timelineData = payload.timelineData ?? payload.timeline_data ?? [];
    const fillerWordsAnalysis =
      payload.fillerWordsAnalysis ?? payload.filler_words_analysis ?? [];
    const pacingAnalysis = payload.pacingAnalysis ?? payload.pacing_analysis ?? [];
    const behavioralAnalysis =
      payload.behavioralAnalysis ?? payload.behavioral_analysis ?? {};
    const swot = payload.swot ?? {};
    const resources = payload.resources ?? [];
    const questionsPayload = payload.questions ?? payload.question_evaluations ?? [];
    const transcriptPayload = payload.transcript ?? payload.transcripts ?? [];

    try {
        // Find existing session to link against
        const session = await this.prisma.interviewSession.findUnique({
             where: { id: sessionId }
        });

        if (!session) {
             this.logger.warn(`No InterviewSession found for ID: ${sessionId}. Cannot save report deeply yet.`);
             // You can choose to create a placeholder or just abort.
             return;
        }

        await this.prisma.report.deleteMany({ where: { sessionId } });

        await this.prisma.report.create({
            data: {
                sessionId: session.id,
                overallScore: payload.overallScore || 0,
                duration: payload.duration || '00:00',
                hardSkillsScore: payload.hardSkillsScore || 0,
                softSkillsScore: payload.softSkillsScore || 0,
            radarData,
            timelineData,
            fillerWordsAnalysis,
            pacingAnalysis,
            behavioralAnalysis,
            swot,
            resources,
                questions: {
              create: questionsPayload.map((q: any) => ({
                question: q.question || q.prompt || '',
                userAnswerSummary: q.userAnswerSummary || q.user_answer_summary || q.answerSummary || '',
                aiFeedback: q.aiFeedback || q.ai_feedback || q.feedback || '',
                score: Number(q.score || 0),
                  improvements: q.improvements || q.suggested_improvements || [],
                  audioUrl: q.audioUrl || q.audio_url || `http://localhost:8000/public/recordings/${session.id}-recording.mp4`
                      }))
                },
                transcripts: {
              create: transcriptPayload.map((t: any) => ({
                        speaker: t.speaker || '',
                        text: t.text || '',
                        timestamp: String(t.timestamp || '0')
                    }))
                }
            }
        });

        // Optionally, mark session as 'completed'
        await this.prisma.interviewSession.update({
             where: { id: sessionId },
             data: { status: 'completed', completedAt: new Date() }
        });

        this.logger.log(`Successfully saved report for session ${sessionId}`);

    } catch(error) {
        this.logger.error(`Failed to save webhook report: ${error.message}`);
    }
  }

  /**
   * Map AI service response to DTO.
   */
  private mapToResponseDto(data: any): ReportResponseDto {
    return {
      id: data.id,
      date: data.date,
      overallScore: data.overallScore ?? data.overall_score ?? 0,
      duration: data.duration ?? '00:00',
      hardSkillsScore: data.hardSkillsScore ?? data.hard_skills_score ?? 0,
      softSkillsScore: data.softSkillsScore ?? data.soft_skills_score ?? 0,
      radarData: data.radarData ?? data.radar_data ?? [],
      timelineData: data.timelineData ?? data.timeline_data ?? [],
      questions: data.questions ?? data.question_evaluations ?? [],
      transcript: data.transcript ?? data.transcripts ?? [],
      fillerWordsAnalysis: data.fillerWordsAnalysis ?? data.filler_words_analysis ?? [],
      pacingAnalysis: data.pacingAnalysis ?? data.pacing_analysis ?? [],
      behavioralAnalysis: data.behavioralAnalysis ?? data.behavioral_analysis ?? {},
      swot: data.swot ?? {},
      resources: data.resources ?? [],
    };
  }

  private mapPrismaToDto(r: any): ReportResponseDto {
      return {
          id: r.id,
          date: r.date.toISOString(),
          overallScore: r.overallScore,
          duration: r.duration,
          hardSkillsScore: r.hardSkillsScore,
          softSkillsScore: r.softSkillsScore,
        radarData: r.radarData || [],
        timelineData: r.timelineData || [],
          questions: r.questions || [],
          transcript: r.transcripts || [],
        fillerWordsAnalysis: r.fillerWordsAnalysis || [],
        pacingAnalysis: r.pacingAnalysis || [],
        behavioralAnalysis: r.behavioralAnalysis || {},
        swot: r.swot || {},
        resources: r.resources || []
      };
  }

  private async createPendingTimeoutFallbackReport(sessionId: string): Promise<ReportResponseDto> {
    const existing = await this.prisma.report.findUnique({
      where: { sessionId },
      include: { questions: true, transcripts: true },
    });

    if (existing) {
      return this.mapPrismaToDto(existing);
    }

    try {
      await this.prisma.report.create({
        data: {
          sessionId,
          overallScore: 0,
          duration: '00:00',
          hardSkillsScore: 0,
          softSkillsScore: 0,
          radarData: [],
          timelineData: [],
          fillerWordsAnalysis: [],
          pacingAnalysis: [],
          behavioralAnalysis: {
            eyeContact: AnalysisRating.GOOD,
            fillerWords: AnalysisLevel.LOW,
            pace: AnalysisPace.GOOD,
            clarity: AnalysisLevel.MEDIUM,
          },
          swot: {
            strengths: [],
            weaknesses: [],
            opportunities: [],
            threats: [],
          },
          resources: [],
          questions: { create: [] },
          transcripts: {
            create: [
              {
                speaker: 'system',
                text: 'Report generation timed out. A fallback report was created automatically.',
                timestamp: '00:00',
              },
            ],
          },
        },
      });

      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: { status: 'completed', completedAt: new Date() },
      });
    } catch (error: any) {
      // If another process wrote the report in parallel, just read and return it.
      const code = error?.code as string | undefined;
      if (code !== 'P2002') {
        this.logger.error(
          `Failed to create timeout fallback report for session ${sessionId}: ${error?.message || error}`,
        );
      }
    }

    const saved = await this.prisma.report.findUnique({
      where: { sessionId },
      include: { questions: true, transcripts: true },
    });

    if (saved) {
      return this.mapPrismaToDto(saved);
    }

    return this.getPendingReport(sessionId);
  }

  private getPendingReport(sessionId: string): ReportResponseDto {
    return {
      id: `rep_pending_${sessionId.slice(0, 8)}`,
      date: new Date().toISOString(),
      overallScore: 0,
      duration: '00:00',
      hardSkillsScore: 0,
      softSkillsScore: 0,
      radarData: [],
      timelineData: [],
      questions: [],
      transcript: [],
      fillerWordsAnalysis: [],
      pacingAnalysis: [],
      behavioralAnalysis: {
        eyeContact: AnalysisRating.GOOD,
        fillerWords: AnalysisLevel.LOW,
        pace: AnalysisPace.GOOD,
        clarity: AnalysisLevel.MEDIUM,
      },
      swot: {
        strengths: [],
        weaknesses: [],
        opportunities: [],
        threats: [],
      },
      resources: [],
    };
  }

  /**
   * Get mock report data for development.
   */
  private getMockReport(sessionId: string): ReportResponseDto {
    return {
      id: sessionId.startsWith('rep_') ? sessionId : `rep_${sessionId.slice(0, 8)}`,
      date: new Date().toISOString(),
      overallScore: 82,
      duration: '42:15',
      hardSkillsScore: 85,
      softSkillsScore: 78,
      radarData: [
        { subject: 'Technical', A: 85, fullMark: 100 },
        { subject: 'Communication', A: 78, fullMark: 100 },
        { subject: 'Problem Solving', A: 90, fullMark: 100 },
        { subject: 'Confidence', A: 70, fullMark: 100 },
        { subject: 'Engagement', A: 88, fullMark: 100 },
      ],
      timelineData: [
        { time: '00:00', score: 70, sentiment: 65 },
        { time: '05:00', score: 75, sentiment: 70 },
        { time: '10:00', score: 85, sentiment: 80 },
        { time: '15:00', score: 80, sentiment: 75 },
      ],
      questions: [
        {
          id: 1,
          question: 'Tell me about your experience with React.',
          userAnswerSummary: 'Discussed 3 years of React experience with hooks and state management.',
          aiFeedback: 'Good depth of experience shown. Consider adding specific project examples.',
          score: 85,
          improvements: ['Add quantifiable metrics', 'Mention team collaboration'],
        },
      ],
      transcript: [
        { speaker: 'Interviewer', text: 'Tell me about your experience with React.', timestamp: '00:15' },
        { speaker: 'You', text: 'I have been working with React for about 3 years now...', timestamp: '00:20' },
      ],
      fillerWordsAnalysis: [
        { word: 'um', count: 8 },
        { word: 'like', count: 5 },
      ],
      pacingAnalysis: [
        { time: '00:00', wpm: 120 },
        { time: '05:00', wpm: 135 },
      ],
      behavioralAnalysis: {
        eyeContact: AnalysisRating.GOOD,
        fillerWords: AnalysisLevel.MEDIUM,
        pace: AnalysisPace.GOOD,
        clarity: AnalysisLevel.HIGH,
      },
      swot: {
        strengths: ['Strong technical knowledge', 'Clear communication'],
        weaknesses: ['Occasional filler words', 'Could provide more examples'],
        opportunities: ['Practice STAR method', 'Prepare project metrics'],
        threats: ['Competition may have deeper specialization'],
      },
      resources: [
        { title: 'STAR Method Guide', type: 'Article', url: '#' },
        { title: 'Interview Confidence Building', type: 'Video', url: '#' },
      ],
    };
  }
}
