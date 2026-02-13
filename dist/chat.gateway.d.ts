import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { User } from './entities/user.entity';
import { Conversation, ConversationType } from './entities/conversation.entity';
import { ConversationMember } from './entities/conversation-member.entity';
interface JoinPayload {
    username: string;
}
interface SendMessagePayload {
    content: string;
}
interface SendMessageToConversationPayload {
    conversationId: number;
    content: string;
}
interface CreatePrivateConversationPayload {
    recipientUsername: string;
}
interface CreateGroupConversationPayload {
    name: string;
    memberUsernames: string[];
}
export declare class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private messageRepository;
    private userRepository;
    private conversationRepository;
    private conversationMemberRepository;
    server: Server;
    private connectedUsers;
    constructor(messageRepository: Repository<Message>, userRepository: Repository<User>, conversationRepository: Repository<Conversation>, conversationMemberRepository: Repository<ConversationMember>);
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
    handleCreatePrivateConversation(payload: CreatePrivateConversationPayload, client: Socket): Promise<{
        success: boolean;
        error: string;
        conversation?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        conversation: {
            id: number;
            type: ConversationType;
            name: string;
            createdAt: Date;
        };
        message: string;
        error?: undefined;
    } | {
        success: boolean;
        conversation: {
            id: number;
            type: ConversationType;
            name: string;
            createdAt: Date;
        };
        error?: undefined;
        message?: undefined;
    }>;
    handleCreateGroupConversation(payload: CreateGroupConversationPayload, client: Socket): Promise<{
        success: boolean;
        error: string;
        conversation?: undefined;
    } | {
        success: boolean;
        conversation: {
            id: number;
            type: ConversationType;
            name: string;
            createdAt: Date;
            memberCount: number;
        };
        error?: undefined;
    }>;
    handleSendMessageToConversation(payload: SendMessageToConversationPayload, client: Socket): Promise<{
        success: boolean;
        error: string;
        messageId?: undefined;
    } | {
        success: boolean;
        messageId: number;
        error?: undefined;
    }>;
    handleGetConversations(client: Socket): Promise<{
        success: boolean;
        error: string;
        conversations?: undefined;
    } | {
        success: boolean;
        conversations: {
            id: number;
            type: ConversationType;
            name: string;
            createdAt: Date;
            memberCount: number;
            lastMessage: {
                content: string;
                sender: string;
                sentAt: string;
            } | null;
        }[];
        error?: undefined;
    }>;
    handleGetConversationMessages(payload: {
        conversationId: number;
    }, client: Socket): Promise<{
        success: boolean;
        error: string;
        messages?: undefined;
    } | {
        success: boolean;
        messages: {
            id: number;
            content: string;
            sender: string;
            sentAt: string;
        }[];
        error?: undefined;
    }>;
    handleGetAllUsers(): Promise<{
        success: boolean;
        users: {
            id: number;
            username: string;
            isOnline: boolean;
        }[];
    }>;
    handleSearchUsers(payload: {
        query: string;
    }): Promise<{
        success: boolean;
        error: string;
        users?: undefined;
    } | {
        success: boolean;
        users: {
            id: number;
            username: string;
            isOnline: boolean;
        }[];
        error?: undefined;
    }>;
}
export {};
