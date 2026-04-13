import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Response } from 'express';
import { ScheduleService } from './schedule.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getSessions(
    @Req() req: any,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
  ) {
    return this.scheduleService.getSessions(req.user.userId, dateStart, dateEnd);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createSession(@Req() req: any, @Body() body: any) {
    return this.scheduleService.createSession(req.user.userId, body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateSession(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.scheduleService.updateSession(req.user.userId, id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteSession(@Req() req: any, @Param('id') id: string) {
    return this.scheduleService.deleteSession(req.user.userId, id);
  }

  // --- Routines ---

  @Get('routines')
  @UseGuards(JwtAuthGuard)
  async getRoutines(@Req() req: any) {
    return this.scheduleService.getRoutines(req.user.userId);
  }

  @Post('routines/generate')
  @UseGuards(JwtAuthGuard)
  async generateRoutine(@Req() req: any, @Body() body: any) {
    return this.scheduleService.generateRoutine(req.user.userId, body);
  }

  @Patch('routines/:id')
  @UseGuards(JwtAuthGuard)
  async updateRoutine(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.scheduleService.updateRoutine(req.user.userId, id, body);
  }

  // --- Google Calendar ---

  @Get('google/status')
  @UseGuards(JwtAuthGuard)
  async getGoogleStatus(@Req() req: any) {
    return this.scheduleService.getGoogleConnectionStatus(req.user.userId);
  }

  @Get('google/connect-url')
  @UseGuards(JwtAuthGuard)
  async getGoogleConnectUrl(
    @Req() req: any,
    @Query('returnTo') returnTo?: string,
  ) {
    const url = await this.scheduleService.getGoogleConnectUrl(
      req.user.userId,
      returnTo,
    );
    return { url };
  }

  @Get('google/callback')
  async handleGoogleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const redirectUrl = await this.scheduleService.handleGoogleCallback(
      code,
      state,
    );
    return res.redirect(redirectUrl);
  }

  @Get('google/events')
  @UseGuards(JwtAuthGuard)
  async getGoogleEvents(
    @Req() req: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.scheduleService.getGoogleEvents(req.user.userId, start, end);
  }

  @Post('google/connect')
  @UseGuards(JwtAuthGuard)
  async connectGoogle(
    @Req() req: any,
    @Body() body: { token?: unknown; returnTo?: string },
  ) {
    if (body?.token && typeof body.token === 'object') {
      return this.scheduleService.connectGoogleWithToken(
        req.user.userId,
        body.token,
      );
    }

    const url = await this.scheduleService.getGoogleConnectUrl(
      req.user.userId,
      body?.returnTo,
    );

    return { success: true, url };
  }

  @Post('google/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectGoogle(@Req() req: any) {
    return this.scheduleService.disconnectGoogle(req.user.userId);
  }
}
