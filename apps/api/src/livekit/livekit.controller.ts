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

  @ApiProperty({
    required: false,
    description: 'Seconds to wait before closing empty room',
  })
  empty_timeout?: number;

  @ApiProperty({
    required: false,
    description: 'Maximum number of participants',
  })
  max_participants?: number;
}

class CreateTokenDto {
  @ApiProperty({ description: 'The unique name of the LiveKit room to join' })
  room_name: string;

  @ApiProperty({ description: 'The identity/name of the participant' })
  participant_name: string;

  @ApiProperty({
    required: false,
    description: 'Optional JSON stringified metadata',
  })
  metadata?: string;
}

class StartRoomRecordingDto {
  @ApiProperty({ description: 'The LiveKit room name to record' })
  room_name: string;

  @ApiProperty({
    description:
      'Session ID used to generate deterministic recording file name',
  })
  session_id: string;
}

class StopRoomRecordingDto {
  @ApiProperty({
    description: 'LiveKit egress ID returned by start-room-recording endpoint',
  })
  egress_id: string;
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

  @ApiOperation({
    summary: 'Start room-level interview recording (AI + candidate audio)',
  })
  @Post('recordings/start')
  async startRoomRecording(@Body() body: StartRoomRecordingDto) {
    if (!this.livekitService.isConfigured) {
      throw new HttpException(
        'LiveKit is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      return await this.livekitService.startRoomAudioRecording(
        body.room_name,
        body.session_id,
      );
    } catch (error) {
      throw new HttpException(
        error instanceof Error
          ? error.message
          : 'Failed to start room recording',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Stop room-level interview recording' })
  @Post('recordings/stop')
  async stopRoomRecording(@Body() body: StopRoomRecordingDto) {
    if (!this.livekitService.isConfigured) {
      throw new HttpException(
        'LiveKit is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      return await this.livekitService.stopRoomAudioRecording(body.egress_id);
    } catch (error) {
      throw new HttpException(
        error instanceof Error
          ? error.message
          : 'Failed to stop room recording',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
