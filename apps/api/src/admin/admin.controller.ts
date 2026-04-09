import { Controller, Get, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async getStats() {
    const userCount = await this.prisma.user.count();
    const postCount = await this.prisma.communityPost.count();
    const sessionCount = await this.prisma.scheduledSession.count();
    
    return {
      users: userCount,
      posts: postCount,
      sessions: sessionCount,
    };
  }

  @Get('users')
  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  @Patch('users/:id/role')
  async updateUserRole(@Param('id') id: string, @Body() body: { role: string }) {
    return this.prisma.user.update({
      where: { id: parseInt(id, 10) },
      data: { role: body.role }
    });
  }

  @Delete('posts/:id')
  async deletePost(@Param('id') id: string) {
    await this.prisma.communityPost.delete({ where: { id } });
    return { success: true };
  }

  @Delete('comments/:id')
  async deleteComment(@Param('id') id: string) {
    await this.prisma.communityComment.delete({ where: { id: parseInt(id, 10) } });
    return { success: true };
  }
}
