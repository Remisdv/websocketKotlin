import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { User } from './entities/user.entity';
interface JoinPayload {
    username: string;
}
interface SendMessagePayload {
    content: string;
}
export declare class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private messageRepository;
    private userRepository;
    server: Server;
    private connectedUsers;
    constructor(messageRepository: Repository<Message>, userRepository: Repository<User>);
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoin(payload: JoinPayload, client: Socket): Promise<{
        success: boolean;
        username: string;
    }>;
    handleMessage(payload: SendMessagePayload, client: Socket): Promise<{
        success: boolean;
        error: string;
        messageId?: undefined;
    } | {
        success: boolean;
        messageId: number;
        error?: undefined;
    }>;
    handleGetUsers(): {
        users: string[];
    };
}
export {};
