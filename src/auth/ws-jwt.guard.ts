import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

interface JwtPayload {
  sub: number;
  username: string;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const client = context.switchToWs().getClient<Socket>();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.split(' ')[1];

      if (!token) {
        throw new WsException('No token provided');
      }

      const payload = this.jwtService.verify(
        token as string,
        {
          secret:
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
        },
      ) as JwtPayload;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (context.switchToWs().getData() as any).user = payload;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (client as any).user = payload;

      return true;
    } catch {
      throw new WsException('Invalid token');
    }
  }
}
