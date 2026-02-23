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
