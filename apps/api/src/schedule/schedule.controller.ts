import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Controller('schedule')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getSessions(@Req() req: any) {
    return this.scheduleService.getSessions(req.user.userId);
  }

  @Post()
  async createSession(@Req() req: any, @Body() body: any) {
    return this.scheduleService.createSession(req.user.userId, body);
  }

  @Patch(':id')
  async updateSession(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.scheduleService.updateSession(req.user.userId, id, body);
  }

  @Delete(':id')
  async deleteSession(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.deleteSession(req.user.userId, id);
  }

  // --- Routines ---

  @Get('routines')
  async getRoutines(@Req() req: any) {
    return this.scheduleService.getRoutines(req.user.userId);
  }

  @Post('routines/generate')
  async generateRoutine(@Req() req: any, @Body() body: any) {
    return this.scheduleService.generateRoutine(req.user.userId, body);
  }

  @Patch('routines/:id')
  async updateRoutine(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.scheduleService.updateRoutine(req.user.userId, id, body);
  }

  // --- Google Calendar ---

  @Get('google/status')
  async getGoogleStatus(@Req() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
    });
    return { connected: !!user?.googleCalendarToken };
  }

  @Post('google/connect')
  async connectGoogle(@Req() req: any, @Body() body: { token: any }) {
    await this.prisma.user.update({
      where: { id: req.user.userId },
      data: { googleCalendarToken: body.token },
    });
    return { success: true };
  }

  @Post('google/disconnect')
  async disconnectGoogle(@Req() req: any) {
    await this.prisma.user.update({
      where: { id: req.user.userId },
      data: { googleCalendarToken: Prisma.DbNull },
    });
    return { success: true };
  }
}
