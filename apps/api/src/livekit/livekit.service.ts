import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  VideoGrant,
  RoomServiceClient,
  EgressClient,
  EncodedFileType,
  EncodedFileOutput,
  EgressStatus,
} from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);
  private roomService: RoomServiceClient | null = null;
  private egressService: EgressClient | null = null;

  constructor(private configService: ConfigService) {
    const livekitUrl = this.configService.get<string>('LIVEKIT_URL');
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (livekitUrl && apiKey && apiSecret) {
      // Convert ws:// to http:// for API calls
      const httpUrl = livekitUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      this.roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      this.egressService = new EgressClient(httpUrl, apiKey, apiSecret);
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

    const uniqueIdentity = `${participantName}-${Date.now().toString(36).substring(4)}`;
    
    const token = new AccessToken(apiKey, apiSecret, {
      identity: uniqueIdentity,
      name: participantName, // this preserves the display name while making identity unique
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

  async startRoomAudioRecording(
    roomName: string,
    sessionId: string,
  ): Promise<{ egressId: string; status: number; fileName: string; audioUrl: string }> {
    if (!this.egressService) {
      throw new Error('LiveKit egress is not configured');
    }

    const safeSessionId = this.sanitizeSessionId(sessionId);
    if (!safeSessionId) {
      throw new Error('Invalid session ID for recording');
    }

    const outputDir = this.getEgressOutputDir();
    const fileName = `${safeSessionId}-recording.mp3`;
    const filepath = `${outputDir.replace(/\/+$/, '')}/${fileName}`;

    const info = await this.egressService.startRoomCompositeEgress(
      roomName,
      {
        file: new EncodedFileOutput({
          filepath,
          fileType: EncodedFileType.MP3,
        }),
      },
      {
        audioOnly: true,
      },
    );

    this.logger.log(
      `Started room audio recording for ${roomName}, egressId=${info.egressId}, output=${filepath}`,
    );

    return {
      egressId: info.egressId,
      status: info.status,
      fileName,
      audioUrl: `/public/recordings/${fileName}`,
    };
  }

  async stopRoomAudioRecording(
    egressId: string,
  ): Promise<{ egressId: string; status: number; error?: string; audioUrl?: string }> {
    if (!this.egressService) {
      throw new Error('LiveKit egress is not configured');
    }

    const stopInfo = await this.egressService.stopEgress(egressId);
    const settledInfo = await this.waitForEgressToSettle(egressId, stopInfo);
    const fileName = this.extractFileNameFromEgress(settledInfo);

    if (settledInfo.status === EgressStatus.EGRESS_FAILED) {
      this.logger.error(
        `Egress ${egressId} failed: ${settledInfo.error || 'Unknown LiveKit egress error'}`,
      );
    } else {
      this.logger.log(`Stopped room audio recording egressId=${egressId}, status=${settledInfo.status}`);
    }

    return {
      egressId,
      status: settledInfo.status,
      error: settledInfo.error || undefined,
      audioUrl: fileName ? `/public/recordings/${fileName}` : undefined,
    };
  }

  private getEgressOutputDir(): string {
    return this.configService.get<string>('LIVEKIT_EGRESS_OUTPUT_DIR') || '/out';
  }

  private sanitizeSessionId(sessionId: string): string {
    return String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private async waitForEgressToSettle(egressId: string, initialInfo: any): Promise<any> {
    if (!this.egressService) {
      return initialInfo;
    }

    let latestInfo = initialInfo;
    const terminalStates = new Set<number>([
      EgressStatus.EGRESS_COMPLETE,
      EgressStatus.EGRESS_FAILED,
      EgressStatus.EGRESS_ABORTED,
      EgressStatus.EGRESS_LIMIT_REACHED,
    ]);

    if (terminalStates.has(latestInfo.status)) {
      return latestInfo;
    }

    for (let attempt = 0; attempt < 15; attempt += 1) {
      await this.sleep(1000);
      const entries = await this.egressService.listEgress({ egressId });
      if (entries.length > 0) {
        latestInfo = entries[0];
      }
      if (terminalStates.has(latestInfo.status)) {
        break;
      }
    }

    return latestInfo;
  }

  private extractFileNameFromEgress(info: any): string | null {
    const primaryLocation =
      info?.fileResults?.[0]?.filename ||
      info?.fileResults?.[0]?.location ||
      (info?.result?.case === 'file' ? info?.result?.value?.filename || info?.result?.value?.location : '');

    if (!primaryLocation) {
      return null;
    }

    const normalized = String(primaryLocation).replace(/\\/g, '/');
    return normalized.split('/').pop() || null;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
