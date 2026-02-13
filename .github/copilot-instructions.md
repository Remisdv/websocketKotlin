# Serveur de Messagerie WebSocket NestJS

## Stack technique
- NestJS avec WebSocket (Socket.io)
- SQLite avec TypeORM
- Client HTML/JS pour test

## Structure
- `src/chat.gateway.ts` - Gateway WebSocket principale
- `src/entities/` - Entités User et Message
- `public/index.html` - Client de test

## Commandes
- `npm run start:dev` - Démarrer en mode dev
- `node test-websocket.js` - Test automatisé

## Événements WebSocket
- `join` - Rejoindre avec username
- `sendMessage` - Envoyer un message
- `newMessage` - Recevoir un message
- `messageHistory` - Historique au join
