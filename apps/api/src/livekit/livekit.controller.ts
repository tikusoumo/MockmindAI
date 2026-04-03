import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { LivekitService } from './livekit.service';

class CreateRoomDto {
  @ApiProperty({ description: 'The unique name of the LiveKit room' })
  name: string;

  @ApiProperty({ required: false, description: 'Seconds to wait before closing empty room' })
  empty_timeout?: number;

  @ApiProperty({ required: false, description: 'Maximum number of participants' })
  max_participants?: number;
}

class CreateTokenDto {
  @ApiProperty({ description: 'The unique name of the LiveKit room to join' })
  room_name: string;

  @ApiProperty({ description: 'The identity/name of the participant' })
  participant_name: string;

  @ApiProperty({ required: false, description: 'Optional JSON stringified metadata' })
  metadata?: string;
}

@ApiTags('LiveKit Video Calling')
@Controller('livekit')
export class LivekitController {
  constructor(private readonly livekitService: LivekitService) {}

  @ApiOperation({ summary: 'Create a new LiveKit room' })
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

  @ApiOperation({ summary: 'Generate an access token for a participant' })
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

  @ApiOperation({ summary: 'Generate a special identity token for AI Agents' })
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
