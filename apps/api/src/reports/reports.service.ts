import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new report for a completed interview session.
   * This calls the Python AI service to run the analysis.
   */
  async generateReport(dto: GenerateReportRequestDto): Promise<ReportResponseDto> {
    this.logger.log(`Generating report for session: ${dto.sessionId}`);

    // Call Python AI service to generate report
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai-services:8000';
    
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
      // Return mock data for development/fallback
      return this.getMockReport(dto.sessionId);
    }
  }

  /**
   * Get a report by ID.
   */
  async getReport(id: string): Promise<ReportResponseDto> {
    // In production, fetch from database
    // For now, return mock data
    this.logger.log(`Fetching report: ${id}`);
    
    // Simulate not found for invalid IDs
    if (!id.startsWith('rep_')) {
      throw new NotFoundException(`Report not found: ${id}`);
    }

    return this.getMockReport(id);
  }

  /**
   * List all reports for a user.
   */
  async listReports(userId?: string): Promise<ReportListItemDto[]> {
    this.logger.log(`Listing reports for user: ${userId || 'all'}`);

    // Return mock list for development
    return [
      {
        id: 'rep_001',
        date: new Date().toISOString(),
        overallScore: 82,
        duration: '42:15',
        templateTitle: 'Tech Round',
      },
      {
        id: 'rep_002',
        date: new Date(Date.now() - 86400000).toISOString(),
        overallScore: 75,
        duration: '35:00',
        templateTitle: 'Behavioral',
      },
      {
        id: 'rep_003',
        date: new Date(Date.now() - 172800000).toISOString(),
        overallScore: 88,
        duration: '45:30',
        templateTitle: 'HR Round',
      },
    ];
  }

  /**
   * Delete a report.
   */
  async deleteReport(id: string): Promise<void> {
    this.logger.log(`Deleting report: ${id}`);
    // In production, delete from database
  }

  /**
   * Map AI service response to DTO.
   */
  private mapToResponseDto(data: any): ReportResponseDto {
    return {
      id: data.id,
      date: data.date,
      overallScore: data.overallScore,
      duration: data.duration,
      hardSkillsScore: data.hardSkillsScore,
      softSkillsScore: data.softSkillsScore,
      radarData: data.radarData,
      timelineData: data.timelineData,
      questions: data.questions,
      transcript: data.transcript,
      fillerWordsAnalysis: data.fillerWordsAnalysis,
      pacingAnalysis: data.pacingAnalysis,
      behavioralAnalysis: data.behavioralAnalysis,
      swot: data.swot,
      resources: data.resources,
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
