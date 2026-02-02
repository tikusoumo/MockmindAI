import { Controller, Get, Post, Put, Body } from '@nestjs/common';
import { DataService } from './data.service';

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

@Controller('api')
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Get('user')
  async getUser() {
    return this.dataService.getUser();
  }

  @Put('user')
  async updateUser(@Body() body: UserDto) {
    return this.dataService.updateUser(body as any);
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
}
