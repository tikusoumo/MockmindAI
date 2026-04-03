import { Controller, Get, Post, Put, Body, Param, UseGuards, Req } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(@Req() req, @Body() createSessionDto: any) {
    // req.user contains the decoded JWT loaded by passport
    const userId = req.user.sub || req.user.id;
    // ensure email is tracked for participant mapping
    createSessionDto.participantEmail = req.user.email;
    return this.sessionsService.createSession(userId, createSessionDto);
  }

  @Get()
  findAll(@Req() req) {
    const userId = req.user.sub || req.user.id;
    return this.sessionsService.getUserSessions(userId);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    const userId = req.user.sub || req.user.id;
    return this.sessionsService.getSession(id, userId);
  }

  @Put(':id')
  update(@Req() req, @Param('id') id: string, @Body() updateSessionDto: any) {
    const userId = req.user.sub || req.user.id;
    return this.sessionsService.updateSession(id, userId, updateSessionDto);
  }
}
