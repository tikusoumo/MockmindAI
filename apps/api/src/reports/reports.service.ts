import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import puppeteer from 'puppeteer-core';
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
  private readonly pendingTimeoutSeconds = Number(process.env.REPORT_PENDING_TIMEOUT_SECONDS || 600);

  constructor(private readonly prisma: PrismaService) {}

  async saveSessionRecording(
    sessionId: string,
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
  ): Promise<{ audioUrl: string; fileName: string; size: number }> {
    const safeSessionId = this.sanitizeSessionId(sessionId);
    if (!safeSessionId) {
      throw new InternalServerErrorException('Invalid session ID for recording upload');
    }

    const extension = this.inferRecordingExtension(file.originalname, file.mimetype);
    const fileName = `${safeSessionId}-recording${extension}`;
    const recordingsDir = this.getRecordingsDirectory();
    const destinationPath = join(recordingsDir, fileName);

    await fs.mkdir(recordingsDir, { recursive: true });
    await fs.writeFile(destinationPath, file.buffer);

    this.logger.log(
      `Saved session recording ${fileName} (${file.buffer.length} bytes) for session ${safeSessionId}`,
    );

    return {
      audioUrl: `/public/recordings/${fileName}`,
      fileName,
      size: file.buffer.length,
    };
  }

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
    const recentReports = await this.prisma.report.findMany({
        orderBy: { date: 'desc' },
        take: 50,
        include: { questions: true, transcripts: true }
    });

    if (recentReports.length === 0) {
      throw new NotFoundException('No reports found');
    }

    const preferred =
      recentReports.find((r) => !this.isTimeoutFallbackReportRecord(r)) ||
      recentReports[0];

    return await this.mapPrismaToDto(preferred);
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
    if (existingById) return await this.mapPrismaToDto(existingById);

    // Try finding by sessionId just in case the frontend sends that
    const existingBySession = await this.prisma.report.findUnique({
        where: { sessionId: id },
        include: { questions: true, transcripts: true }
    });
    if (existingBySession) return await this.mapPrismaToDto(existingBySession);

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
        include: {
          session: { select: { title: true } },
          transcripts: { select: { speaker: true, text: true } },
        }
    });

    if (reports.length === 0) {
        return [];
    }

    const visibleReports = reports.filter(
      (r) => !this.isTimeoutFallbackReportRecord(r),
    );

    return visibleReports.map(r => ({
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

  async generateReportPdf(id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const report = id === 'latest' ? await this.getLatestReport() : await this.getReport(id);
    const html = this.buildReportPdfHtml(report);

    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '14mm',
          bottom: '16mm',
          left: '14mm',
        },
      });

      const fileName = `interview-report-${report.id}.pdf`;
      return { buffer: Buffer.from(pdf), fileName };
    } finally {
      await browser.close();
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
    const overallScore = Number(payload.overallScore ?? payload.overall_score ?? 0);
    const hardSkillsScore = Number(payload.hardSkillsScore ?? payload.hard_skills_score ?? 0);
    const softSkillsScore = Number(payload.softSkillsScore ?? payload.soft_skills_score ?? 0);

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
            overallScore,
                duration: payload.duration || '00:00',
            hardSkillsScore,
            softSkillsScore,
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
                  audioUrl: q.audioUrl || q.audio_url || undefined
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
      recordingAudioUrl:
        data.recordingAudioUrl ??
        data.recording_audio_url ??
        data.audioUrl ??
        data.audio_url ??
        undefined,
    };
  }

  private buildReportPdfHtml(report: ReportResponseDto): string {
    const questions = Array.isArray(report.questions) ? report.questions : [];
    const swot = report.swot || {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    const resources = Array.isArray(report.resources) ? report.resources : [];

    const renderList = (items: string[]) => {
      if (!items.length) {
        return '<li class="muted">No items available.</li>';
      }
      return items
        .map((item) => `<li>${this.escapeHtml(item)}</li>`)
        .join('');
    };

    const questionCards = questions.length
      ? questions
          .map(
            (q, index) => `
              <div class="question-card">
                <div class="question-title">Q${index + 1}. ${this.escapeHtml(q.question || '')}</div>
                <div class="question-meta">Score: ${Number(q.score || 0)}/100</div>
                <div class="question-block"><strong>Answer Summary:</strong> ${this.escapeHtml(q.userAnswerSummary || '')}</div>
                <div class="question-block"><strong>AI Feedback:</strong> ${this.escapeHtml(q.aiFeedback || '')}</div>
              </div>
            `,
          )
          .join('')
      : '<div class="question-card"><div class="question-block muted">No question-level data available.</div></div>';

    const resourceRows = resources.length
      ? resources
          .map(
            (resource) => `
              <tr>
                <td>${this.escapeHtml(resource.title || '')}</td>
                <td>${this.escapeHtml(resource.type || '')}</td>
                <td>${this.escapeHtml(resource.url || '')}</td>
              </tr>
            `,
          )
          .join('')
      : '<tr><td colspan="3" class="muted">No resources available.</td></tr>';

    const reportDate = new Date(report.date);
    const formattedDate = Number.isNaN(reportDate.getTime())
      ? this.escapeHtml(report.date)
      : reportDate.toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Interview Report ${this.escapeHtml(report.id)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1b2333; margin: 0; background: #f4f7fb; }
            .sheet { width: 100%; max-width: 1000px; margin: 0 auto; }
            .hero { background: linear-gradient(120deg, #0f172a, #1d4ed8); color: #fff; border-radius: 18px; padding: 28px; margin-bottom: 18px; }
            .hero h1 { margin: 0; font-size: 30px; letter-spacing: 0.2px; }
            .hero .meta { margin-top: 10px; font-size: 13px; opacity: 0.9; }
            .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
            .metric { background: #fff; border: 1px solid #dbe3f0; border-radius: 14px; padding: 16px; }
            .metric .label { color: #586175; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; }
            .metric .value { font-size: 28px; font-weight: 700; margin-top: 8px; color: #12203a; }
            .section { background: #fff; border: 1px solid #dbe3f0; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
            .section h2 { margin: 0 0 12px 0; font-size: 18px; color: #0f172a; }
            .question-card { border: 1px solid #e4ebf6; border-radius: 12px; padding: 12px; margin-bottom: 10px; background: #fbfdff; }
            .question-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
            .question-meta { font-size: 12px; color: #3f4b64; margin-bottom: 8px; }
            .question-block { font-size: 12px; line-height: 1.45; margin-bottom: 6px; }
            .swot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
            .swot-box { border: 1px solid #e4ebf6; border-radius: 12px; padding: 10px; }
            .swot-box h3 { margin: 0 0 8px 0; font-size: 13px; color: #1e2d4d; }
            ul { margin: 0; padding-left: 18px; }
            li { font-size: 12px; line-height: 1.45; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e4ebf6; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #eef3fb; color: #1d2a42; }
            .muted { color: #6c778c; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="hero">
              <h1>Interview Performance Report</h1>
              <div class="meta">Report ID: ${this.escapeHtml(report.id)} | Generated: ${formattedDate} | Duration: ${this.escapeHtml(report.duration)}</div>
            </div>

            <div class="grid">
              <div class="metric">
                <div class="label">Overall Score</div>
                <div class="value">${Number(report.overallScore || 0)}</div>
              </div>
              <div class="metric">
                <div class="label">Hard Skills</div>
                <div class="value">${Number(report.hardSkillsScore || 0)}</div>
              </div>
              <div class="metric">
                <div class="label">Soft Skills</div>
                <div class="value">${Number(report.softSkillsScore || 0)}</div>
              </div>
            </div>

            <div class="section">
              <h2>Question Evaluation</h2>
              ${questionCards}
            </div>

            <div class="section">
              <h2>SWOT Summary</h2>
              <div class="swot-grid">
                <div class="swot-box">
                  <h3>Strengths</h3>
                  <ul>${renderList(Array.isArray(swot.strengths) ? swot.strengths : [])}</ul>
                </div>
                <div class="swot-box">
                  <h3>Weaknesses</h3>
                  <ul>${renderList(Array.isArray(swot.weaknesses) ? swot.weaknesses : [])}</ul>
                </div>
                <div class="swot-box">
                  <h3>Opportunities</h3>
                  <ul>${renderList(Array.isArray(swot.opportunities) ? swot.opportunities : [])}</ul>
                </div>
                <div class="swot-box">
                  <h3>Threats</h3>
                  <ul>${renderList(Array.isArray(swot.threats) ? swot.threats : [])}</ul>
                </div>
              </div>
            </div>

            <div class="section">
              <h2>Recommended Resources</h2>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  ${resourceRows}
                </tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async mapPrismaToDto(r: any): Promise<ReportResponseDto> {
      const fallbackAudioUrl = await this.resolveRecordingUrl(r?.sessionId);

      const mappedQuestions = (r.questions || []).map((q: any) => ({
        ...q,
        audioUrl: this.resolveQuestionAudioUrl(
          q.audioUrl,
          r?.sessionId,
          fallbackAudioUrl,
        ),
      }));

      return {
          id: r.id,
          date: r.date.toISOString(),
          overallScore: r.overallScore,
          duration: r.duration,
          hardSkillsScore: r.hardSkillsScore,
          softSkillsScore: r.softSkillsScore,
        radarData: r.radarData || [],
        timelineData: r.timelineData || [],
          questions: mappedQuestions,
          transcript: r.transcripts || [],
        fillerWordsAnalysis: r.fillerWordsAnalysis || [],
        pacingAnalysis: r.pacingAnalysis || [],
        behavioralAnalysis: r.behavioralAnalysis || {},
        swot: r.swot || {},
        resources: r.resources || [],
        recordingAudioUrl: fallbackAudioUrl || undefined,
      };
  }

  private resolveQuestionAudioUrl(
    questionAudioUrl: string | undefined,
    sessionId: string | undefined,
    fallbackAudioUrl: string | null,
  ): string | undefined {
    if (!questionAudioUrl) {
      return fallbackAudioUrl || undefined;
    }

    if (this.isLegacySessionFallbackAudioUrl(questionAudioUrl, sessionId)) {
      return fallbackAudioUrl || questionAudioUrl;
    }

    return questionAudioUrl;
  }

  private isLegacySessionFallbackAudioUrl(
    audioUrl: string,
    sessionId: string | undefined,
  ): boolean {
    const safeSessionId = this.sanitizeSessionId(sessionId || '');
    if (!safeSessionId) {
      return false;
    }

    const normalized = String(audioUrl || '').trim();
    if (!normalized) {
      return false;
    }

    const legacySuffix = `/public/recordings/${safeSessionId}-recording.mp4`;
    return normalized === legacySuffix || normalized.endsWith(legacySuffix);
  }

  private sanitizeSessionId(rawSessionId: string): string {
    return String(rawSessionId || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private inferRecordingExtension(originalName?: string, mimeType?: string): string {
    const normalizedExt = extname(originalName || '').toLowerCase();
    if (normalizedExt && normalizedExt.length <= 10) {
      return normalizedExt;
    }

    const normalizedMimeType = String(mimeType || '').toLowerCase();
    if (normalizedMimeType.includes('webm')) return '.webm';
    if (normalizedMimeType.includes('mp4')) return '.mp4';
    if (normalizedMimeType.includes('mpeg') || normalizedMimeType.includes('mp3')) return '.mp3';
    if (normalizedMimeType.includes('wav')) return '.wav';
    if (normalizedMimeType.includes('ogg')) return '.ogg';

    return '.webm';
  }

  private async resolveRecordingUrl(sessionId: string | undefined): Promise<string | null> {
    const safeSessionId = this.sanitizeSessionId(sessionId || '');
    if (!safeSessionId) {
      return null;
    }

    const recordingsDir = this.getRecordingsDirectory();
    const filePrefix = `${safeSessionId}-recording`;

    try {
      const files = await fs.readdir(recordingsDir);
      const candidates = files.filter(
        (fileName) => fileName === filePrefix || fileName.startsWith(`${filePrefix}.`),
      );

      if (candidates.length === 0) {
        return null;
      }

      const preferredOrder = ['.webm', '.m4a', '.mp4', '.mp3', '.wav', '.ogg'];
      for (const extension of preferredOrder) {
        const match = candidates.find(
          (fileName) => extname(fileName).toLowerCase() === extension,
        );
        if (match) {
          return `/public/recordings/${match}`;
        }
      }

      return `/public/recordings/${candidates[0]}`;
    } catch {
      return null;
    }
  }

  private getRecordingsDirectory(): string {
    return join(process.cwd(), 'public', 'recordings');
  }

  private async createPendingTimeoutFallbackReport(sessionId: string): Promise<ReportResponseDto> {
    const existing = await this.prisma.report.findUnique({
      where: { sessionId },
      include: { questions: true, transcripts: true },
    });

    if (existing) {
      return await this.mapPrismaToDto(existing);
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
      return await this.mapPrismaToDto(saved);
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

  private isTimeoutFallbackReportRecord(report: {
    overallScore?: number;
    transcripts?: Array<{ speaker?: string; text?: string }>;
  }): boolean {
    if (Number(report?.overallScore ?? 0) !== 0) {
      return false;
    }

    const transcripts = report?.transcripts || [];
    if (!Array.isArray(transcripts) || transcripts.length === 0) {
      return false;
    }

    return transcripts.some(
      (entry) =>
        typeof entry?.text === 'string' &&
        /timed out|fallback report/i.test(entry.text),
    );
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
