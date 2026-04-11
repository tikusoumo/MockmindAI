import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DataService } from './data.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class UserDto {
  name: string;
  role: string;
  avatar: string;
  level: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Get('user')
  async getUser(@Req() req: any) {
    return this.dataService.getUser(req.user.userId);
  }

  @Put('user')
  async updateUser(@Req() req: any, @Body() body: any) {
    return this.dataService.updateUser(req.user.userId, body);
  }

  @Delete('user')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Req() req: any) {
    return this.dataService.deleteUser(req.user.userId);
  }

  @Get('interview-templates')
  async getInterviewTemplates() {
    return this.dataService.getInterviewTemplates();
  }

  @Post('interview-templates')
  async createInterviewTemplate(@Body() body: any) {
    return this.dataService.createInterviewTemplate(body);
  }

  @Patch('interview-templates/:id')
  async updateInterviewTemplate(@Param('id') id: string, @Body() body: any) {
    return this.dataService.updateInterviewTemplate(id, body);
  }

  @Delete('interview-templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteInterviewTemplate(@Param('id') id: string) {
    return this.dataService.deleteInterviewTemplate(id);
  }

  @Get('progress-stats')
  async getProgressStats() {
    return this.dataService.getProgressStats();
  }

  @Get('report/latest')
  async getLatestReport() {
    return this.dataService.getLatestReport();
  }

  @Get('interviews/past')
  async getPastInterviews(@Req() req: any) {
    return this.dataService.getPastInterviews(req.user.userId, req.user.email);
  }

  @Post('report')
  async createReport(@Body() body: any) {
    return this.dataService.createReport(body);
  }
}
