import { Controller, Post, Delete, Get, Body, Req, UseGuards, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Login with email and password' })
  @Post('login')
  async login(@Body() body: any) {
    return this.authService.login(body.email, body.password);
  }

  @ApiOperation({ summary: 'Sign up new user with OTP, email, password' })
  @Post('signup')
  async signup(@Body() body: any) {
    return this.authService.verifyOtpAndLogin(body.email, body.code, body.name, body.password);
  }

  @ApiOperation({ summary: 'Send OTP to an email address' })
  @Post('send-otp')
  async sendOtp(@Body('email') email: string) {
    return this.authService.sendOtp(email);
  }

  @ApiOperation({ summary: 'Verify an OTP code' })
  @Post('verify-otp')
  async verifyOtp(@Body() body: { email: string; code: string; name?: string; password?: string }) {
    return this.authService.verifyOtpAndLogin(body.email, body.code, body.name, body.password);
  }

  @ApiOperation({ summary: 'Change authenticated user password' })
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
  }

  @ApiOperation({ summary: 'Initiate Google OAuth2 flow' })
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Initiates Google Auth
  }

  @ApiOperation({ summary: 'Google OAuth2 callback handler' })
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const { token } = await this.authService.googleLogin(req);
    res.redirect(`http://localhost:3000/auth/callback?token=${token}`);
  }
}
