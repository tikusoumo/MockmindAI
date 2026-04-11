import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth.token?.split(' ')[1] ||
        client.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const decoded = this.jwtService.verify(token);
      const userId = decoded.userId;

      // Join a room specific to this user
      client.join(`user:${userId}`);
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Automatically leave rooms on disconnect
  }

  // Push a notification to a specific user
  sendToUser(userId: number, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  // Broadcast to all connected clients
  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }
}
