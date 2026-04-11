import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getUserNotifications(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.getUserNotifications(
      req.user.userId,
      limit ? parseInt(limit, 10) : 50,
      unreadOnly === 'true',
    );
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const count = await this.notificationsService.getUnreadCount(
      req.user.userId,
    );
    return { count };
  }

  @Patch('read-all')
  async markAllAsRead(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }

  @Patch(':id/read')
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(id, req.user.userId);
  }
}
