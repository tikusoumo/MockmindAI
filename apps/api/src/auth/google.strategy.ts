import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'clientid',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'secret',
      callbackURL: 'http://localhost:8000/api/auth/google/callback', // Note: Make sure port matches
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, name, emails, photos } = profile;
    const user = {
      googleId: id,
      email: emails[0].value,
      name: name.givenName + (name.familyName ? ' ' + name.familyName : ''),
      picture: photos[0].value,
      accessToken,
    };
    done(null, user);
  }
}
