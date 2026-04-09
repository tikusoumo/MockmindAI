import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getPosts(userId: number, tab: string = 'feed', search?: string, limit: number = 20) {
    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy: any = { timestamp: 'desc' };
    if (tab === 'popular') {
      // Order by number of likes
      orderBy = {
        postLikes: {
          _count: 'desc'
        }
      };
    }

    const posts = await this.prisma.communityPost.findMany({
      where: whereClause,
      orderBy,
      take: limit,
      include: {
        author: {
          select: { id: true, name: true, avatar: true, role: true }
        },
        _count: {
          select: { comments: true, postLikes: true }
        },
        postLikes: {
          where: { userId } // Check if current user liked it
        }
      }
    });

    return posts.map(post => ({
      ...post,
      isLikedByMe: post.postLikes.length > 0,
      likesCount: post._count.postLikes,
      commentsCount: post._count.comments,
      postLikes: undefined, // remove raw array from response
      _count: undefined
    }));
  }

  async createPost(userId: number, data: { title?: string, content: string, tags?: string[] }) {
    return this.prisma.communityPost.create({
      data: {
        authorId: userId,
        title: data.title || '',
        content: data.content,
        tags: data.tags || [],
      },
      include: {
        author: { select: { id: true, name: true, avatar: true, role: true } }
      }
    });
  }

  async updatePost(userId: number, role: string, id: string, data: { title?: string, content?: string, tags?: string[] }) {
    const post = await this.prisma.communityPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    
    if (post.authorId !== userId && role !== 'superadmin') {
      throw new UnauthorizedException('You can only edit your own posts');
    }

    return this.prisma.communityPost.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        tags: data.tags,
      }
    });
  }

  async deletePost(userId: number, role: string, id: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    
    if (post.authorId !== userId && role !== 'superadmin') {
      throw new UnauthorizedException('You can only delete your own posts');
    }

    await this.prisma.communityPost.delete({ where: { id } });
    return { success: true };
  }

  async toggleLike(userId: number, postId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    const existingLike = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } }
    });

    if (existingLike) {
      await this.prisma.postLike.delete({ where: { id: existingLike.id } });
      return { liked: false };
    } else {
      await this.prisma.postLike.create({
        data: { postId, userId }
      });

      // Notify post author if someone else liked it
      if (post.authorId !== userId) {
        const liker = await this.prisma.user.findUnique({ where: { id: userId } });
        await this.notifications.createNotification(
          post.authorId,
          'post_like',
          'New Like',
          `${liker?.name || 'Someone'} liked your post.`,
          { postId }
        );
      }
      return { liked: true };
    }
  }

  // --- Comments ---

  async getComments(postId: string) {
    return this.prisma.communityComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, avatar: true, role: true } }
      }
    });
  }

  async createComment(userId: number, postId: string, content: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    const comment = await this.prisma.communityComment.create({
      data: {
        postId,
        authorId: userId,
        content,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true, role: true } }
      }
    });

    // Notify post author
    if (post.authorId !== userId) {
      const commenter = await this.prisma.user.findUnique({ where: { id: userId } });
      await this.notifications.createNotification(
        post.authorId,
        'post_reply',
        'New Comment',
        `${commenter?.name || 'Someone'} commented on your post.`,
        { postId }
      );
    }

    return comment;
  }

  async deleteComment(userId: number, role: string, commentId: number) {
    const comment = await this.prisma.communityComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.authorId !== userId && role !== 'superadmin') {
      throw new UnauthorizedException('You can only delete your own comments');
    }

    await this.prisma.communityComment.delete({ where: { id: commentId } });
    return { success: true };
  }

  // --- Templates ---
  
  async getCommunityTemplates() {
    return this.prisma.interviewTemplate.findMany({
      where: { isPublished: true },
      include: {
        creator: { select: { name: true, avatar: true } }
      },
      orderBy: { rating: 'desc' }
    });
  }

  async useTemplate(userId: number, templateId: string) {
    const template = await this.prisma.interviewTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Template not found');

    // Increment usage 
    await this.prisma.interviewTemplate.update({
      where: { id: templateId },
      data: { usageCount: { increment: 1 } }
    });

    // Create a clone for the user
    return this.prisma.interviewTemplate.create({
      data: {
        title: `${template.title} (Clone)`,
        description: template.description,
        duration: template.duration,
        difficulty: template.difficulty,
        icon: template.icon,
        color: template.color,
        type: template.type,
        documents: template.documents as any,
        systemPrompt: template.systemPrompt,
        creatorId: userId,
        isPublished: false,
      }
    });
  }
}
