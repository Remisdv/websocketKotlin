# Serveur de Messagerie WebSocket NestJS

Un serveur de messagerie en temps réel avec WebSocket (Socket.io) et SQLite.

## Fonctionnalités

- Connexion WebSocket en temps réel
- Chat multi-utilisateurs
- Historique des messages persisté en SQLite
- Affichage du nom d'expéditeur et de l'heure d'envoi
- Notifications de connexion/déconnexion

## Installation

```bash
npm install
```

## Démarrage

```bash
# Mode développement
npm run start:dev

# Mode production
npm run start:prod
```

Le serveur démarre sur `http://localhost:3000`

## Utilisation

1. Ouvrez `http://localhost:3000` dans votre navigateur
2. Entrez votre nom d'utilisateur
3. Commencez à chatter!

## Événements WebSocket

### Client -> Serveur

#### `join`
Rejoindre le chat avec un nom d'utilisateur.
```javascript
socket.emit('join', { username: 'Alice' });
```

#### `sendMessage`
Envoyer un message.
```javascript
socket.emit('sendMessage', { content: 'Bonjour!' });
```

#### `getUsers`
Obtenir la liste des utilisateurs connectés.
```javascript
socket.emit('getUsers');
```

### Serveur -> Client

#### `messageHistory`
Historique des derniers messages (reçu après `join`).

#### `newMessage`
Nouveau message diffusé à tous.
```json
{
  "id": 1,
  "content": "Bonjour!",
  "sender": "Alice",
  "sentAt": "2026-02-12T10:30:00.000Z"
}
```

#### `userJoined`
Notification quand un utilisateur rejoint.

#### `userLeft`
Notification quand un utilisateur quitte.

## Test avec Socket.io Client

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.emit('join', { username: 'TestUser' });

socket.on('newMessage', (msg) => {
  console.log(`[${msg.sender}] ${msg.content} - ${msg.sentAt}`);
});

socket.emit('sendMessage', { content: 'Hello World!' });
```

## Base de données

Le fichier `messaging.db` (SQLite) est créé automatiquement au démarrage.
