import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Message } from './entities/message.entity';
import { User } from './entities/user.entity';
import { Conversation, ConversationType } from './entities/conversation.entity';
import { ConversationMember } from './entities/conversation-member.entity';

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

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<string, User> = new Map();

  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(ConversationMember)
    private conversationMemberRepository: Repository<ConversationMember>,
    private jwtService: JwtService,
  ) {}
async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.split(' ')[1];

      if (!token) {
        console.log('Client connected without token, disconnecting...');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token as string, {
        secret:
          process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      }) as { sub: number; username: string };

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });
      
      if (!user) {
        console.log('User not found, disconnecting...');
        client.disconnect();
        return;
      }

      client['user'] = user;
      this.connectedUsers.set(client.id, user);

      // Récupérer les derniers messages globaux (sans conversation)
      const messages = await this.messageRepository.find({
        relations: ['sender'],
        where: { conversation: IsNull() },
        order: { sentAt: 'ASC' },
        take: 50,
      });

      // Envoyer l'historique au client
      client.emit(
        'messageHistory',
        messages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          sender: msg.sender.username,
          sentAt: msg.sentAt.toISOString(),
        })),
      );

      // Notifier tous les utilisateurs de la nouvelle connexion
      this.server.emit('userJoined', {
        username: user.username,
        timestamp: new Date().toISOString(),
      });

      console.log(`User ${user.username} connected with JWT`);
    } catch (error: any) {
      console.log('Invalid token, disconnecting...', error?.message || error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = this.connectedUsers.get(client.id);
    if (user) {
      this.connectedUsers.delete(client.id);
      this.server.emit('userLeft', {
        username: user.username,
        timestamp: new Date().toISOString(),
      });
      console.log(`User ${user.username} disconnected`);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() payload: SendMessagePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client['user'] as User;
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated.',
      };
    }

    const { content } = payload;
    if (!content || content.trim() === '') {
      return { success: false, error: 'Message content cannot be empty.' };
    }

    // Créer et sauvegarder le message global (sans conversation)
    const message = this.messageRepository.create({
      content: content.trim(),
      sender: user,
    });
    await this.messageRepository.save(message);

    // Diffuser le message à tous les clients
    this.server.emit('newMessage', {
      id: message.id,
      content: message.content,
      sender: user.username,
      sentAt: message.sentAt.toISOString(),
    });

    console.log(`[${user.username}] ${content}`);

    return { success: true, messageId: message.id };
  }

  @SubscribeMessage('getUsers')
  handleGetUsers() {
    const users = Array.from(this.connectedUsers.values()).map(
      (u) => u.username,
    );
    return { users };
  }

  @SubscribeMessage('createPrivateConversation')
  async handleCreatePrivateConversation(
    @MessageBody() payload: CreatePrivateConversationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client['user'] as User;
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated.',
      };
    }

    const { recipientUsername } = payload;

    // Trouver le destinataire
    const recipient = await this.userRepository.findOne({
      where: { username: recipientUsername },
    });

    if (!recipient) {
      return { success: false, error: 'Recipient not found.' };
    }

    if (recipient.id === user.id) {
      return {
        success: false,
        error: 'Cannot create conversation with yourself.',
      };
    }

    // Vérifier si une conversation privée existe déjà entre ces deux utilisateurs
    const existingConversations = await this.conversationRepository
      .createQueryBuilder('conversation')
      .innerJoin('conversation.members', 'member')
      .where('conversation.type = :type', { type: ConversationType.PRIVATE })
      .andWhere('member.user.id IN (:...userIds)', {
        userIds: [user.id, recipient.id],
      })
      .groupBy('conversation.id')
      .having('COUNT(DISTINCT member.user.id) = 2')
      .getMany();

    for (const conv of existingConversations) {
      const members = await this.conversationMemberRepository.find({
        where: { conversation: { id: conv.id } },
        relations: ['user'],
      });

      const memberIds = members.map((m) => m.user.id).sort();
      const targetIds = [user.id, recipient.id].sort();

      if (JSON.stringify(memberIds) === JSON.stringify(targetIds)) {
        return {
          success: true,
          conversation: {
            id: conv.id,
            type: conv.type,
            name: recipientUsername,
            createdAt: conv.createdAt,
          },
          message: 'Conversation already exists',
        };
      }
    }

    // Créer nouvelle conversation privée
    const conversation = this.conversationRepository.create({
      type: ConversationType.PRIVATE,
      createdBy: user,
    });
    await this.conversationRepository.save(conversation);

    // Ajouter les membres
    const member1 = this.conversationMemberRepository.create({
      conversation,
      user,
    });
    const member2 = this.conversationMemberRepository.create({
      conversation,
      user: recipient,
    });

    await this.conversationMemberRepository.save([member1, member2]);

    console.log(
      `Private conversation created between ${user.username} and ${recipientUsername}`,
    );

    return {
      success: true,
      conversation: {
        id: conversation.id,
        type: conversation.type,
        name: recipientUsername,
        createdAt: conversation.createdAt,
      },
    };
  }

  @SubscribeMessage('createGroupConversation')
  async handleCreateGroupConversation(
    @MessageBody() payload: CreateGroupConversationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client['user'] as User;
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated.',
      };
    }

    const { name, memberUsernames } = payload;

    if (!name || name.trim() === '') {
      return { success: false, error: 'Group name is required.' };
    }

    // Trouver tous les membres
    const users = await this.userRepository.find({
      where: { username: In(memberUsernames) },
    });

    if (users.length === 0) {
      return { success: false, error: 'No valid members found.' };
    }

    // Créer la conversation de groupe
    const conversation = this.conversationRepository.create({
      type: ConversationType.GROUP,
      name: name.trim(),
      createdBy: user,
    });
    await this.conversationRepository.save(conversation);

    // Ajouter le créateur et les membres
    const allUsers = [user, ...users.filter((u) => u.id !== user.id)];
    const members = allUsers.map((u) =>
      this.conversationMemberRepository.create({
        conversation,
        user: u,
      }),
    );

    await this.conversationMemberRepository.save(members);

    console.log(`Group conversation "${name}" created by ${user.username}`);

    return {
      success: true,
      conversation: {
        id: conversation.id,
        type: conversation.type,
        name: conversation.name,
        createdAt: conversation.createdAt,
        memberCount: members.length,
      },
    };
  }

  @SubscribeMessage('sendMessageToConversation')
  async handleSendMessageToConversation(
    @MessageBody() payload: SendMessageToConversationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client['user'] as User;
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated.',
      };
    }

    const { conversationId, content } = payload;

    if (!content || content.trim() === '') {
      return { success: false, error: 'Message content cannot be empty.' };
    }

    // Vérifier que l'utilisateur est membre de la conversation
    const membership = await this.conversationMemberRepository.findOne({
      where: {
        conversation: { id: conversationId },
        user: { id: user.id },
      },
      relations: ['conversation'],
    });

    if (!membership) {
      return {
        success: false,
        error: 'You are not a member of this conversation.',
      };
    }

    // Créer et sauvegarder le message
    const message = this.messageRepository.create({
      content: content.trim(),
      sender: user,
      conversation: membership.conversation,
    });
    await this.messageRepository.save(message);

    // Récupérer tous les membres de la conversation
    const members = await this.conversationMemberRepository.find({
      where: { conversation: { id: conversationId } },
      relations: ['user'],
    });

    // Envoyer le message à tous les membres connectés
    const messageData = {
      id: message.id,
      conversationId,
      content: message.content,
      sender: user.username,
      sentAt: message.sentAt.toISOString(),
    };

    // Émettre à tous les clients connectés qui sont membres
    for (const [socketId, connectedUser] of this.connectedUsers.entries()) {
      if (members.some((m) => m.user.id === connectedUser.id)) {
        this.server.to(socketId).emit('newConversationMessage', messageData);
      }
    }

    console.log(
      `[Conversation ${conversationId}] ${user.username}: ${content}`,
    );

    return { success: true, messageId: message.id };
  }

  @SubscribeMessage('getConversations')
  async handleGetConversations(@ConnectedSocket() client: Socket) {
    const user = client['user'] as User;
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated.',
      };
    }

    // Récupérer toutes les conversations de l'utilisateur
    const memberships = await this.conversationMemberRepository.find({
      where: { user: { id: user.id } },
      relations: [
        'conversation',
        'conversation.members',
        'conversation.members.user',
        'conversation.createdBy',
      ],
    });

    const conversations = await Promise.all(
      memberships.map(async (membership) => {
        const conv = membership.conversation;

        // Récupérer le dernier message
        const lastMessage = await this.messageRepository.findOne({
          where: { conversation: { id: conv.id } },
          order: { sentAt: 'DESC' },
          relations: ['sender'],
        });

        // Pour les conversations privées, le nom est l'autre utilisateur
        let displayName = conv.name;
        if (conv.type === ConversationType.PRIVATE) {
          const otherMember = conv.members.find((m) => m.user.id !== user.id);
          displayName = otherMember?.user.username || 'Unknown';
        }

        return {
          id: conv.id,
          type: conv.type,
          name: displayName,
          createdAt: conv.createdAt,
          memberCount: conv.members.length,
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                sender: lastMessage.sender.username,
                sentAt: lastMessage.sentAt.toISOString(),
              }
            : null,
        };
      }),
    );

    return {
      success: true,
      conversations: conversations.sort((a, b) => {
        const aTime = a.lastMessage?.sentAt || a.createdAt;
        const bTime = b.lastMessage?.sentAt || b.createdAt;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      }),
    };
  }

  @SubscribeMessage('getConversationMessages')
  async handleGetConversationMessages(
    @MessageBody() payload: { conversationId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client['user'] as User;
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated.',
      };
    }

    const { conversationId } = payload;

    // Vérifier que l'utilisateur est membre
    const membership = await this.conversationMemberRepository.findOne({
      where: {
        conversation: { id: conversationId },
        user: { id: user.id },
      },
    });

    if (!membership) {
      return {
        success: false,
        error: 'You are not a member of this conversation.',
      };
    }

    // Récupérer les messages
    const messages = await this.messageRepository.find({
      where: { conversation: { id: conversationId } },
      relations: ['sender'],
      order: { sentAt: 'ASC' },
      take: 100,
    });

    return {
      success: true,
      messages: messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        sender: msg.sender.username,
        sentAt: msg.sentAt.toISOString(),
      })),
    };
  }

  @SubscribeMessage('getAllUsers')
  async handleGetAllUsers() {
    // Récupérer tous les utilisateurs de la base
    const allUsers = await this.userRepository.find({
      order: { username: 'ASC' },
    });

    return {
      success: true,
      users: allUsers.map((user) => ({
        id: user.id,
        username: user.username,
        isOnline: Array.from(this.connectedUsers.values()).some(
          (u) => u.id === user.id,
        ),
      })),
    };
  }

  @SubscribeMessage('searchUsers')
  async handleSearchUsers(@MessageBody() payload: { query: string }) {
    const { query } = payload;

    if (!query || query.trim() === '') {
      return { success: false, error: 'Search query is required.' };
    }

    // Chercher les utilisateurs dont le nom contient la requête (insensible à la casse)
    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) LIKE LOWER(:query)', {
        query: `%${query.trim()}%`,
      })
      .orderBy('user.username', 'ASC')
      .limit(20)
      .getMany();

    return {
      success: true,
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        isOnline: Array.from(this.connectedUsers.values()).some(
          (u) => u.id === user.id,
        ),
      })),
    };
  }
}
