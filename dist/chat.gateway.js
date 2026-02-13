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
let ChatGateway = class ChatGateway {
    messageRepository;
    userRepository;
    server;
    connectedUsers = new Map();
    constructor(messageRepository, userRepository) {
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
    }
    async handleConnection(client) {
        console.log(`Client connected: ${client.id}`);
    }
    async handleDisconnect(client) {
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
            order: { sentAt: 'ASC' },
            take: 50,
        });
        client.emit('messageHistory', messages.map(msg => ({
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
            return { success: false, error: 'User not authenticated. Please join first.' };
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
        const users = Array.from(this.connectedUsers.values()).map(u => u.username);
        return { users };
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
exports.ChatGateway = ChatGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    __param(0, (0, typeorm_1.InjectRepository)(message_entity_1.Message)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map