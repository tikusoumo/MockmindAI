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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  ReportResponseDto,
  ReportListItemDto,
  GenerateReportRequestDto,
} from './dto';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
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
