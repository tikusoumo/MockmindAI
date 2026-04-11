import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CommunityService } from './community.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('posts')
  async getPosts(
    @Req() req: any,
    @Query('tab') tab?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.getPosts(
      req.user.userId,
      tab || 'feed',
      search,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('posts')
  async createPost(@Req() req: any, @Body() body: any) {
    return this.communityService.createPost(req.user.userId, body);
  }

  @Patch('posts/:id')
  async updatePost(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.communityService.updatePost(
      req.user.userId,
      req.user.role,
      id,
      body,
    );
  }

  @Delete('posts/:id')
  async deletePost(@Req() req: any, @Param('id') id: string) {
    return this.communityService.deletePost(req.user.userId, req.user.role, id);
  }

  @Post('posts/:id/like')
  async toggleLike(@Req() req: any, @Param('id') id: string) {
    return this.communityService.toggleLike(req.user.userId, id);
  }

  @Get('posts/:id/comments')
  async getComments(@Param('id') id: string) {
    return this.communityService.getComments(id);
  }

  @Post('posts/:id/comments')
  async createComment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    return this.communityService.createComment(
      req.user.userId,
      id,
      body.content,
    );
  }

  @Delete('comments/:id')
  async deleteComment(@Req() req: any, @Param('id') id: string) {
    return this.communityService.deleteComment(
      req.user.userId,
      req.user.role,
      parseInt(id, 10),
    );
  }

  // --- Templates ---

  @Get('templates')
  async getCommunityTemplates() {
    return this.communityService.getCommunityTemplates();
  }

  @Post('templates/:id/use')
  async useTemplate(@Req() req: any, @Param('id') id: string) {
    return this.communityService.useTemplate(req.user.userId, id);
  }
}
