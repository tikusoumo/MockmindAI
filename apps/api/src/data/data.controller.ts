import { Controller, Get, Post, Put, Body, UseGuards, Req } from '@nestjs/common';
import { DataService } from './data.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class UserDto {
  name: string;
  role: string;
  avatar: string;
  level: string;
}

class CreateScheduleDto {
  title: string;
  date: string;
  time: string;
  interviewer: string;
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
  async updateUser(@Req() req: any, @Body() body: UserDto) {
    return this.dataService.updateUser(req.user.userId, body as any);
  }

  @Get('interview-templates')
  async getInterviewTemplates() {
    return this.dataService.getInterviewTemplates();
  }

  @Get('progress-stats')
  async getProgressStats() {
    return this.dataService.getProgressStats();
  }

  @Get('schedule')
  async getSchedule() {
    return this.dataService.getSchedule();
  }

  @Post('schedule')
  async createSchedule(@Body() body: CreateScheduleDto) {
    return this.dataService.createScheduledSession(body);
  }

  @Get('report/latest')
  async getLatestReport() {
    return this.dataService.getLatestReport();
  }

  @Get('community/posts')
  async getCommunityPosts() {
    return this.dataService.getCommunityPosts();
  }

  @Get('interviews/past')
  async getPastInterviews() {
    return this.dataService.getPastInterviews();
  }

  @Post('report')
  async createReport(@Body() body: any) {
    return this.dataService.createReport(body);
  }
}
