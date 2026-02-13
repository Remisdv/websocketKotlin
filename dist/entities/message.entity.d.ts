import { User } from './user.entity';
import { Conversation } from './conversation.entity';
export declare class Message {
    id: number;
    content: string;
    sentAt: Date;
    sender: User;
    conversation: Conversation;
}
