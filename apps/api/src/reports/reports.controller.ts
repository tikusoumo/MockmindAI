import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReportsService } from './reports.service';
import { Logger } from '@nestjs/common';
import {
  ReportResponseDto,
  ReportListItemDto,
  GenerateReportRequestDto,
  AskReportCoachRequestDto,
  AskReportCoachResponseDto,
} from './dto';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);
  constructor(private readonly reportsService: ReportsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook to receive generated reports from Python agent',
  })
  async reportWebhook(@Body() payload: any): Promise<void> {
    return this.reportsService.saveWebhookReport(payload);
  }

  @Post('recordings/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upload a recorded interview audio file for a session',
  })
  @ApiParam({
    name: 'sessionId',
    type: 'string',
    description: 'Interview session ID',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadSessionRecording(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: any,
  ): Promise<{ audioUrl: string; fileName: string; size: number }> {
    if (!file?.buffer) {
      throw new BadRequestException('Missing recording file upload');
    }

    return this.reportsService.saveSessionRecording(sessionId, file);
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a new interview report' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Report generated successfully',
    type: ReportResponseDto,
  })
  async generateReport(
    @Body() dto: GenerateReportRequestDto,
  ): Promise<ReportResponseDto> {
    return this.reportsService.generateReport(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all reports' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of reports',
    type: [ReportListItemDto],
  })
  async listReports(
    @Query('userId') userId?: string,
  ): Promise<ReportListItemDto[]> {
    return this.reportsService.listReports(userId);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get the latest report' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Latest report',
    type: ReportResponseDto,
  })
  async getLatestReport(): Promise<ReportResponseDto> {
    return this.reportsService.getLatestReport();
  }

  @Post(':id/ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask AI coach a question about this report' })
  @ApiParam({ name: 'id', description: 'Report ID or latest' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Coach response generated successfully',
  })
  async askCoach(
    @Param('id') id: string,
    @Body() dto: AskReportCoachRequestDto,
  ): Promise<AskReportCoachResponseDto> {
    if (!dto?.question || !dto.question.trim()) {
      throw new BadRequestException('Question is required');
    }

    return this.reportsService.askCoachAboutReport(id, dto.question);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download a report as PDF' })
  @ApiParam({ name: 'id', description: 'Report ID or latest' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'PDF generated successfully',
  })
  async downloadReportPdf(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } =
      await this.reportsService.generateReportPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a report by ID' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Report details',
    type: ReportResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Report not found',
  })
  async getReport(@Param('id') id: string): Promise<ReportResponseDto> {
    this.logger.log(`Fetching report: ${id}`);
    if (id === 'latest') return this.reportsService.getLatestReport();
    return this.reportsService.getReport(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a report' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Report deleted',
  })
  async deleteReport(@Param('id') id: string): Promise<void> {
    return this.reportsService.deleteReport(id);
  }
}
