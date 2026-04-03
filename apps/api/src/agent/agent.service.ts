import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Service to handle all outbound communication to the Python AI Agent backend.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  
  // Resolve docker internal network URL, fallback to localhost for standard dev
  private readonly baseUrl = process.env.AGENT_API_URL || 'http://agent-api:8001';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Ping the Python AI Service to ensure it is alive.
   */
  async checkHealth(): Promise<any> {
    try {
      this.logger.debug(`Pinging python agent at ${this.baseUrl}/healthz`);
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/healthz`, {
          // If we add Auth later:
          // headers: { 'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}` }
        }),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to connect to Python Agent API: ${error.message}`);
      throw new HttpException(
        'AI Service is currently unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Send a user document (like a CV) downstream to the Python backend for RAG embedding linked to a session.
   */
  async ingestDocument(sessionId: string, userId: string, fileBuffer: Buffer, filename: string, mimeType: string) {
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
      formData.append('file', blob, filename);
      formData.append('doc_type', 'resume'); // Default to resume for Custom Sessions
      formData.append('user_id', userId);

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/documents/user-upload/${sessionId}`, formData, {
          // axios handles multipart form boundaries automatically when passing FormData
        }),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to ingest document into AI Service: ${error.message}`);
      throw new HttpException(
        'Failed to process document through AI',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
