import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  Min,
  Max,
  ValidateNested,
  IsEnum,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum AnalysisRating {
  POOR = 'Poor',
  GOOD = 'Good',
  EXCELLENT = 'Excellent',
}

export enum AnalysisLevel {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
}

export enum AnalysisPace {
  SLOW = 'Slow',
  GOOD = 'Good',
  FAST = 'Fast',
}

// Radar chart data point
export class RadarDataDto {
  @ApiProperty()
  @IsString()
  subject: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  A: number;

  @ApiProperty()
  @IsNumber()
  fullMark: number = 100;
}

// Timeline data point
export class TimelineDataDto {
  @ApiProperty()
  @IsString()
  time: string;

  @ApiProperty()
  @IsNumber()
  score: number;

  @ApiProperty()
  @IsNumber()
  sentiment: number;
}

// Question feedback
export class QuestionFeedbackDto {
  @ApiProperty()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsString()
  question: string;

  @ApiProperty()
  @IsString()
  userAnswerSummary: string;

  @ApiProperty()
  @IsString()
  aiFeedback: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  improvements: string[];

  @ApiPropertyOptional({
    description: 'Optional recording URL for this question audio',
  })
  @IsOptional()
  @IsString()
  audioUrl?: string;
}

// Transcript entry
export class TranscriptEntryDto {
  @ApiProperty({ enum: ['Interviewer', 'You'] })
  @IsString()
  speaker: 'Interviewer' | 'You';

  @ApiProperty()
  @IsString()
  text: string;

  @ApiProperty()
  @IsString()
  timestamp: string;
}

// Filler word analysis
export class FillerWordDto {
  @ApiProperty()
  @IsString()
  word: string;

  @ApiProperty()
  @IsNumber()
  count: number;
}

// Pacing data
export class PacingDataDto {
  @ApiProperty()
  @IsString()
  time: string;

  @ApiProperty()
  @IsNumber()
  wpm: number;
}

// Behavioral analysis
export class BehavioralAnalysisDto {
  @ApiProperty({ enum: AnalysisRating })
  @IsEnum(AnalysisRating)
  eyeContact: AnalysisRating;

  @ApiProperty({ enum: AnalysisLevel })
  @IsEnum(AnalysisLevel)
  fillerWords: AnalysisLevel;

  @ApiProperty({ enum: AnalysisPace })
  @IsEnum(AnalysisPace)
  pace: AnalysisPace;

  @ApiProperty({ enum: AnalysisLevel })
  @IsEnum(AnalysisLevel)
  clarity: AnalysisLevel;

  @ApiPropertyOptional({
    description: 'Overall candidate sentiment label derived from transcript',
    example: 'Positive',
  })
  @IsOptional()
  @IsString()
  sentiment?: string;

  @ApiPropertyOptional({
    description: 'Normalized sentiment score in range [-1, 1]',
    example: 0.35,
  })
  @IsOptional()
  @IsNumber()
  sentimentScore?: number;

  @ApiPropertyOptional({
    description: 'Detected speaking tone label',
    example: 'Balanced',
  })
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiPropertyOptional({
    description: 'Detected delivery mood label',
    example: 'Steady',
  })
  @IsOptional()
  @IsString()
  mood?: string;

  @ApiPropertyOptional({
    description: 'Pronunciation clarity score out of 100',
    example: 88,
  })
  @IsOptional()
  @IsNumber()
  pronunciationClarity?: number;

  @ApiPropertyOptional({
    description: 'Approximate hesitation marker count in candidate transcript',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  hesitationCount?: number;

  @ApiPropertyOptional({
    description: 'Actionable delivery coaching guidance for the candidate',
  })
  @IsOptional()
  @IsString()
  deliveryGuidance?: string;
}

// SWOT analysis
export class SwotDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  strengths: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  weaknesses: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  opportunities: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  threats: string[];
}

// Resource recommendation
export class ResourceDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ enum: ['Article', 'Video', 'Course'] })
  @IsString()
  type: 'Article' | 'Video' | 'Course';

  @ApiProperty()
  @IsString()
  url: string;
}

export class CodeHistoryEntryDto {
  @ApiProperty({ description: 'Stable snapshot ID (e.g. SNAP-0004)' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Actor who made the change (ai/user/system)' })
  @IsString()
  actor: string;

  @ApiProperty({
    description: 'Event type (code_change, code_apply, test_run, test_case)',
  })
  @IsString()
  eventType: string;

  @ApiProperty({ description: 'Human-readable summary of the coding event' })
  @IsString()
  summary: string;

  @ApiProperty({
    description: 'Timestamp in MM:SS or ISO format depending on source',
  })
  @IsString()
  timestamp: string;

  @ApiPropertyOptional({ description: 'Programming language for the event' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Code snapshot at this history step' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: 'Additional event details',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class AudioTrackDto {
  @ApiProperty({ description: 'Track identifier', example: 'candidate-track' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Display label for this audio track' })
  @IsString()
  label: string;

  @ApiProperty({ description: 'Speaker for this audio track' })
  @IsString()
  speaker: string;

  @ApiPropertyOptional({ description: 'Resolved audio URL for playback' })
  @IsOptional()
  @IsString()
  audioUrl?: string;
}

// Complete report response
export class ReportResponseDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  date: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  overallScore: number;

  @ApiProperty()
  @IsString()
  duration: string;

  @ApiProperty()
  @IsNumber()
  hardSkillsScore: number;

  @ApiProperty()
  @IsNumber()
  softSkillsScore: number;

  @ApiProperty({ type: [RadarDataDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RadarDataDto)
  radarData: RadarDataDto[];

  @ApiProperty({ type: [TimelineDataDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimelineDataDto)
  timelineData: TimelineDataDto[];

  @ApiProperty({ type: [QuestionFeedbackDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionFeedbackDto)
  questions: QuestionFeedbackDto[];

  @ApiProperty({ type: [TranscriptEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranscriptEntryDto)
  transcript: TranscriptEntryDto[];

  @ApiProperty({ type: [FillerWordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FillerWordDto)
  fillerWordsAnalysis: FillerWordDto[];

  @ApiProperty({ type: [PacingDataDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PacingDataDto)
  pacingAnalysis: PacingDataDto[];

  @ApiProperty({ type: BehavioralAnalysisDto })
  @ValidateNested()
  @Type(() => BehavioralAnalysisDto)
  behavioralAnalysis: BehavioralAnalysisDto;

  @ApiProperty({ type: SwotDto })
  @ValidateNested()
  @Type(() => SwotDto)
  swot: SwotDto;

  @ApiProperty({ type: [ResourceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourceDto)
  resources: ResourceDto[];

  @ApiPropertyOptional({
    description:
      'Shared recording URL that can be used as fallback question audio',
  })
  @IsOptional()
  @IsString()
  recordingAudioUrl?: string;

  @ApiPropertyOptional({
    type: [CodeHistoryEntryDto],
    description: 'Coding and testing timeline for technical rounds',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CodeHistoryEntryDto)
  codeHistory?: CodeHistoryEntryDto[];

  @ApiPropertyOptional({
    type: [AudioTrackDto],
    description:
      'Resolved audio tracks for candidate and AI/interviewer voices',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AudioTrackDto)
  audioTracks?: AudioTrackDto[];
}

export class AskReportCoachRequestDto {
  @ApiProperty({ description: 'Question for AI coach about this report' })
  @IsString()
  question: string;
}

export class AskReportCoachResponseDto {
  @ApiProperty({ description: 'Coach answer generated from report analytics' })
  @IsString()
  answer: string;

  @ApiProperty({
    type: [String],
    description: 'Key highlights that support the answer',
  })
  @IsArray()
  @IsString({ each: true })
  highlights: string[];

  @ApiProperty({
    type: [String],
    description: 'Suggested follow-up questions for the user',
  })
  @IsArray()
  @IsString({ each: true })
  suggestedQuestions: string[];

  @ApiProperty({ description: 'Response generation timestamp in ISO format' })
  @IsString()
  generatedAt: string;
}

// Request to generate a report
export class GenerateReportRequestDto {
  @ApiProperty({ description: 'Session/Room ID from the interview' })
  @IsString()
  sessionId: string;

  @ApiPropertyOptional({ description: 'Template ID used for the interview' })
  @IsOptional()
  @IsString()
  templateId?: string;
}

// List reports response
export class ReportListItemDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  date: string;

  @ApiProperty()
  @IsNumber()
  overallScore: number;

  @ApiProperty()
  @IsString()
  duration: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateTitle?: string;
}
