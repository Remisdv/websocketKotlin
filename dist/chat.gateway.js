"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const message_entity_1 = require("./entities/message.entity");
const user_entity_1 = require("./entities/user.entity");
const conversation_entity_1 = require("./entities/conversation.entity");
const conversation_member_entity_1 = require("./entities/conversation-member.entity");
let ChatGateway = class ChatGateway {
    messageRepository;
    userRepository;
    conversationRepository;
    conversationMemberRepository;
    server;
    connectedUsers = new Map();
    constructor(messageRepository, userRepository, conversationRepository, conversationMemberRepository) {
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.conversationRepository = conversationRepository;
        this.conversationMemberRepository = conversationMemberRepository;
    }
    handleConnection(client) {
        console.log(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
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
    async handleJoin(payload, client) {
        const { username } = payload;
        let user = await this.userRepository.findOne({ where: { username } });
        if (!user) {
            user = this.userRepository.create({ username });
            await this.userRepository.save(user);
        }
        this.connectedUsers.set(client.id, user);
        const messages = await this.messageRepository.find({
            relations: ['sender'],
            where: { conversation: (0, typeorm_2.IsNull)() },
            order: { sentAt: 'ASC' },
            take: 50,
        });
        client.emit('messageHistory', messages.map((msg) => ({
            id: msg.id,
            content: msg.content,
            sender: msg.sender.username,
            sentAt: msg.sentAt.toISOString(),
        })));
        this.server.emit('userJoined', {
            username: user.username,
            timestamp: new Date().toISOString(),
        });
        console.log(`User ${username} joined`);
        return { success: true, username: user.username };
    }
    async handleMessage(payload, client) {
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
        const message = this.messageRepository.create({
            content: content.trim(),
            sender: user,
        });
        await this.messageRepository.save(message);
        this.server.emit('newMessage', {
            id: message.id,
            content: message.content,
            sender: user.username,
            sentAt: message.sentAt.toISOString(),
        });
        console.log(`[${user.username}] ${content}`);
        return { success: true, messageId: message.id };
    }
    handleGetUsers() {
        const users = Array.from(this.connectedUsers.values()).map((u) => u.username);
        return { users };
    }
    async handleCreatePrivateConversation(payload, client) {
        const user = this.connectedUsers.get(client.id);
        if (!user) {
            return {
                success: false,
                error: 'User not authenticated. Please join first.',
            };
        }
        const { recipientUsername } = payload;
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
        const existingConversations = await this.conversationRepository
            .createQueryBuilder('conversation')
            .innerJoin('conversation.members', 'member')
            .where('conversation.type = :type', { type: conversation_entity_1.ConversationType.PRIVATE })
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
        const conversation = this.conversationRepository.create({
            type: conversation_entity_1.ConversationType.PRIVATE,
            createdBy: user,
        });
        await this.conversationRepository.save(conversation);
        const member1 = this.conversationMemberRepository.create({
            conversation,
            user,
        });
        const member2 = this.conversationMemberRepository.create({
            conversation,
            user: recipient,
        });
        await this.conversationMemberRepository.save([member1, member2]);
        console.log(`Private conversation created between ${user.username} and ${recipientUsername}`);
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
    async handleCreateGroupConversation(payload, client) {
        const user = this.connectedUsers.get(client.id);
        if (!user) {
            return {
                success: false,
                error: 'User not authenticated. Please join first.',
            };
        }
        const { name, memberUsernames } = payload;
        if (!name || name.trim() === '') {
            return { success: false, error: 'Group name is required.' };
        }
        const users = await this.userRepository.find({
            where: { username: (0, typeorm_2.In)(memberUsernames) },
        });
        if (users.length === 0) {
            return { success: false, error: 'No valid members found.' };
        }
        const conversation = this.conversationRepository.create({
            type: conversation_entity_1.ConversationType.GROUP,
            name: name.trim(),
            createdBy: user,
        });
        await this.conversationRepository.save(conversation);
        const allUsers = [user, ...users.filter((u) => u.id !== user.id)];
        const members = allUsers.map((u) => this.conversationMemberRepository.create({
            conversation,
            user: u,
        }));
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
    async handleSendMessageToConversation(payload, client) {
        const user = this.connectedUsers.get(client.id);
        if (!user) {
            return {
                success: false,
                error: 'User not authenticated. Please join first.',
            };
        }
        const { conversationId, content } = payload;
        if (!content || content.trim() === '') {
            return { success: false, error: 'Message content cannot be empty.' };
        }
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
        const message = this.messageRepository.create({
            content: content.trim(),
            sender: user,
            conversation: membership.conversation,
        });
        await this.messageRepository.save(message);
        const members = await this.conversationMemberRepository.find({
            where: { conversation: { id: conversationId } },
            relations: ['user'],
        });
        const messageData = {
            id: message.id,
            conversationId,
            content: message.content,
            sender: user.username,
            sentAt: message.sentAt.toISOString(),
        };
        for (const [socketId, connectedUser] of this.connectedUsers.entries()) {
            if (members.some((m) => m.user.id === connectedUser.id)) {
                this.server.to(socketId).emit('newConversationMessage', messageData);
            }
        }
        console.log(`[Conversation ${conversationId}] ${user.username}: ${content}`);
        return { success: true, messageId: message.id };
    }
    async handleGetConversations(client) {
        const user = this.connectedUsers.get(client.id);
        if (!user) {
            return {
                success: false,
                error: 'User not authenticated. Please join first.',
            };
        }
        const memberships = await this.conversationMemberRepository.find({
            where: { user: { id: user.id } },
            relations: [
                'conversation',
                'conversation.members',
                'conversation.members.user',
                'conversation.createdBy',
            ],
        });
        const conversations = await Promise.all(memberships.map(async (membership) => {
            const conv = membership.conversation;
            const lastMessage = await this.messageRepository.findOne({
                where: { conversation: { id: conv.id } },
                order: { sentAt: 'DESC' },
                relations: ['sender'],
            });
            let displayName = conv.name;
            if (conv.type === conversation_entity_1.ConversationType.PRIVATE) {
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
        }));
        return {
            success: true,
            conversations: conversations.sort((a, b) => {
                const aTime = a.lastMessage?.sentAt || a.createdAt;
                const bTime = b.lastMessage?.sentAt || b.createdAt;
                return new Date(bTime).getTime() - new Date(aTime).getTime();
            }),
        };
    }
    async handleGetConversationMessages(payload, client) {
        const user = this.connectedUsers.get(client.id);
        if (!user) {
            return {
                success: false,
                error: 'User not authenticated. Please join first.',
            };
        }
        const { conversationId } = payload;
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
    async handleGetAllUsers() {
        const allUsers = await this.userRepository.find({
            order: { username: 'ASC' },
        });
        return {
            success: true,
            users: allUsers.map((user) => ({
                id: user.id,
                username: user.username,
                isOnline: Array.from(this.connectedUsers.values()).some((u) => u.id === user.id),
            })),
        };
    }
    async handleSearchUsers(payload) {
        const { query } = payload;
        if (!query || query.trim() === '') {
            return { success: false, error: 'Search query is required.' };
        }
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
                isOnline: Array.from(this.connectedUsers.values()).some((u) => u.id === user.id),
            })),
        };
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ChatGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('sendMessage'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleMessage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('getUsers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleGetUsers", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('createPrivateConversation'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleCreatePrivateConversation", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('createGroupConversation'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleCreateGroupConversation", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('sendMessageToConversation'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleSendMessageToConversation", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('getConversations'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleGetConversations", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('getConversationMessages'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleGetConversationMessages", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('getAllUsers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleGetAllUsers", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('searchUsers'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleSearchUsers", null);
exports.ChatGateway = ChatGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    __param(0, (0, typeorm_1.InjectRepository)(message_entity_1.Message)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(conversation_entity_1.Conversation)),
    __param(3, (0, typeorm_1.InjectRepository)(conversation_member_entity_1.ConversationMember)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map