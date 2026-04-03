import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService
  ) {}

  generateToken(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return this.jwtService.sign(payload);
  }
  sanitizeUser(user: any) {
    const { password_hash, googleId, ...safeUser } = user;
    return safeUser;
  }
  async sendOtp(email: string) {
    // Check if OTP already exists
    const existing = await this.prisma.oTP.findFirst({ where: { email } });
    if (existing) {
      await this.prisma.oTP.delete({ where: { id: existing.id } });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes

    await this.prisma.oTP.create({
      data: { email, code, expiresAt },
    });

    try {      if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
        console.log(`\n\n[DEV MODE] 🔑 OTP for ${email}: ${code}\n\n`);
        return { message: "OTP generated (Check server console)" };
      }
      await this.notificationsService.sendOtpEmail(email, code);
      return { message: "OTP sent successfully" };
    } catch (e) {
      console.error(e);
      throw new BadRequestException("Failed to send OTP email");
    }
  }

  async verifyOtpAndLogin(email: string, code: string, name?: string, pass?: string) {
    const otp = await this.prisma.oTP.findFirst({ where: { email, code } });
    
    if (!otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (new Date() > otp.expiresAt) {
      throw new UnauthorizedException('OTP has expired');
    }

    // OTP verified. Delete it.
    await this.prisma.oTP.delete({ where: { id: otp.id } });

    // Find or create user
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const password_hash = pass ? await bcrypt.hash(pass, 10) : undefined;
      const finalName = name || email.split('@')[0];
      user = await this.prisma.user.create({
        data: {
          email,
          name: finalName,
          password_hash,
          isVerified: true,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${finalName}`,
        },
      });
    } else if (!user.isVerified) {
      const password_hash = pass ? await bcrypt.hash(pass, 10) : user.password_hash;
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true, password_hash },
      });
    }

    const token = this.generateToken(user);
    return { user: this.sanitizeUser(user), token };
  }

  async login(email: string, pass: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.password_hash) {
      throw new UnauthorizedException('Please login with Google');
    }
    const isMatched = await bcrypt.compare(pass, user.password_hash);
    if (!isMatched) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isVerified) {
      throw new UnauthorizedException('User email not verified');
    }
    const token = this.generateToken(user);
    return { user: this.sanitizeUser(user), token };
  }

  async googleLogin(req: any) {
    if (!req.user) {
      return { message: 'No user from google' };
    }
    const { email, name, googleId, picture } = req.user;
    
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      }
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name,
          googleId,
          avatar: picture || '',
          isVerified: true
        }
      });
    } else if (!user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId, avatar: picture || user.avatar }
      });
    }

    const token = this.generateToken(user);
    return { user: this.sanitizeUser(user), token };
  }
}