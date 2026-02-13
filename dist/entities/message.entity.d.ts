import { User } from './user.entity';
export declare class Message {
    id: number;
    content: string;
    sentAt: Date;
    sender: User;
}
