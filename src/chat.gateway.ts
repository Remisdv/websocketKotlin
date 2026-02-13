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
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { User } from './entities/user.entity';

interface JoinPayload {
  username: string;
}

interface SendMessagePayload {
  content: string;
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
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
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

  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() payload: JoinPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { username } = payload;

    // Chercher ou créer l'utilisateur
    let user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      user = this.userRepository.create({ username });
      await this.userRepository.save(user);
    }

    this.connectedUsers.set(client.id, user);

    // Récupérer les derniers messages
    const messages = await this.messageRepository.find({
      relations: ['sender'],
      order: { sentAt: 'ASC' },
      take: 50,
    });

    // Envoyer l'historique au client qui vient de se connecter
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

    console.log(`User ${username} joined`);

    return { success: true, username: user.username };
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() payload: SendMessagePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated. Please join first.',
      };
    }

    const { content } = payload;
    if (!content || content.trim() === '') {
      return { success: false, error: 'Message content cannot be empty.' };
    }

    // Créer et sauvegarder le message
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
}
