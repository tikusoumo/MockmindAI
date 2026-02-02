import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, VideoGrant, RoomServiceClient } from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
  private roomService: RoomServiceClient | null = null;

  constructor(private configService: ConfigService) {
    const livekitUrl = this.configService.get<string>('LIVEKIT_URL');
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (livekitUrl && apiKey && apiSecret) {
      // Convert ws:// to http:// for API calls
      const httpUrl = livekitUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      this.roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    }
  }

  get isConfigured(): boolean {
    return !!(
      this.configService.get<string>('LIVEKIT_API_KEY') &&
      this.configService.get<string>('LIVEKIT_API_SECRET')
    );
  }

  get publicUrl(): string {
    return (
      this.configService.get<string>('LIVEKIT_PUBLIC_URL') ||
      this.configService.get<string>('LIVEKIT_URL') ||
      'ws://localhost:7880'
    );
  }

  async createRoom(
    name: string,
    emptyTimeout?: number,
    maxParticipants?: number,
  ): Promise<{ name: string; sid: string }> {
    if (!this.roomService) {
      throw new Error('LiveKit is not configured');
    }

    const room = await this.roomService.createRoom({
      name,
      emptyTimeout,
      maxParticipants,
    });

    return {
      name: room.name,
      sid: room.sid,
    };
  }

  async createToken(
    roomName: string,
    participantName: string,
    metadata?: string,
  ): Promise<{ token: string; url: string }> {
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!apiKey || !apiSecret) {
      throw new Error('LiveKit is not configured');
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      metadata,
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    } as VideoGrant);

    return {
      token: await token.toJwt(),
      url: this.publicUrl,
    };
  }

  async createAgentToken(
    roomName: string,
    participantName: string,
    metadata?: string,
  ): Promise<{ token: string; url: string }> {
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!apiKey || !apiSecret) {
      throw new Error('LiveKit is not configured');
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: `agent-${participantName}`,
      metadata,
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    } as VideoGrant);

    return {
      token: await token.toJwt(),
      url: this.publicUrl,
    };
  }
}
