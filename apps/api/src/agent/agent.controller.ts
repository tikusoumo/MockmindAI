import {
  Controller,
  Get,
  Post,
  Param,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AgentService } from './agent.service';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Agent Engine (Python Bridge)')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Ping the internal Python AI Service' })
  async pingPythonAgent() {
    return this.agentService.checkHealth();
  }

  @Post('upload/:sessionId')
  @ApiOperation({
    summary: 'Proxy a CV/Document directly to Python for RAG parsing',
  })
  @ApiParam({
    name: 'sessionId',
    type: 'string',
    description: 'The Interview Session ID',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadContextDocument(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    // Standard mock user ID since auth isn't hooked into req.user yet locally
    const userId = req.user?.id || 'admin_user';
    return await this.agentService.ingestDocument(
      sessionId,
      userId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }
}
