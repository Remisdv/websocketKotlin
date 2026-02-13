import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Message } from './message.entity';
import { ConversationMember } from './conversation-member.entity';
import { User } from './user.entity';

export enum ConversationType {
  PRIVATE = 'private',
  GROUP = 'group',
}

@Entity()
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'text',
    default: ConversationType.PRIVATE,
  })
  type: ConversationType;

  @Column({ nullable: true })
  name: string;

  @ManyToOne(() => User, { nullable: true })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];

  @OneToMany(() => ConversationMember, (member) => member.conversation, {
    cascade: true,
  })
  members: ConversationMember[];
}
