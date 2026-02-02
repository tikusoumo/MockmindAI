import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { LivekitService } from './livekit.service';

class CreateRoomDto {
  name: string;
  empty_timeout?: number;
  max_participants?: number;
}

class CreateTokenDto {
  room_name: string;
  participant_name: string;
  metadata?: string;
}

@Controller('livekit')
export class LivekitController {
  constructor(private readonly livekitService: LivekitService) {}

  @Post('rooms')
  async createRoom(@Body() body: CreateRoomDto) {
    if (!this.livekitService.isConfigured) {
      throw new HttpException(
        'LiveKit is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      return await this.livekitService.createRoom(
        body.name,
        body.empty_timeout,
        body.max_participants,
      );
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create room',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('token')
  async createToken(@Body() body: CreateTokenDto) {
    if (!this.livekitService.isConfigured) {
      throw new HttpException(
        'LiveKit is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      return await this.livekitService.createToken(
        body.room_name,
        body.participant_name,
        body.metadata,
      );
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('agent-token')
  async createAgentToken(@Body() body: CreateTokenDto) {
    if (!this.livekitService.isConfigured) {
      throw new HttpException(
        'LiveKit is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      return await this.livekitService.createAgentToken(
        body.room_name,
        body.participant_name,
        body.metadata,
      );
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create agent token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
