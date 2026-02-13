# Documentation d'intégration - Serveur de Messagerie WebSocket

## Vue d'ensemble

Serveur de messagerie temps réel basé sur WebSocket (Socket.io) avec persistance SQLite.

## Prérequis

- Node.js >= 14
- npm >= 6

## Installation

```bash
npm install
```

## Configuration

### Base de données
SQLite configurée automatiquement dans `src/app.module.ts`
- Fichier: `database.sqlite`
- Synchronisation auto: activée (dev uniquement)

### Port serveur
- WebSocket: `http://localhost:3000`
- Configurable dans `src/main.ts`

## API WebSocket

### Connexion

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');
```

### Événements Client → Serveur

#### 1. Rejoindre le chat
```javascript
socket.emit('join', { username: 'John' });
```
**Réponse:** Reçoit l'historique via `messageHistory`

#### 2. Envoyer un message
```javascript
socket.emit('sendMessage', { message: 'Hello!' });
```
**Réponse:** Broadcast à tous via `newMessage`

### Événements Serveur → Client

#### 1. Historique des messages
```javascript
socket.on('messageHistory', (messages) => {
  // messages: Array<{ id, content, timestamp, user: { id, username } }>
});
```

#### 2. Nouveau message
```javascript
socket.on('newMessage', (message) => {
  // message: { id, content, timestamp, user: { id, username } }
});
```

#### 3. Erreurs
```javascript
socket.on('error', (error) => {
  // error: { message: string }
});
```

## Exemple d'intégration

### Client JavaScript

```javascript
import { io } from 'socket.io-client';

class ChatClient {
  constructor(serverUrl = 'http://localhost:3000') {
    this.socket = io(serverUrl);
    this.setupListeners();
  }

  setupListeners() {
    this.socket.on('messageHistory', (messages) => {
      console.log('Historique reçu:', messages);
      this.displayMessages(messages);
    });

    this.socket.on('newMessage', (message) => {
      console.log('Nouveau message:', message);
      this.displayMessage(message);
    });

    this.socket.on('error', (error) => {
      console.error('Erreur:', error.message);
    });
  }

  join(username) {
    this.socket.emit('join', { username });
  }

  sendMessage(text) {
    this.socket.emit('sendMessage', { message: text });
  }

  displayMessages(messages) {
    // Implémenter l'affichage
  }

  displayMessage(message) {
    // Implémenter l'affichage
  }
}

// Utilisation
const chat = new ChatClient();
chat.join('Alice');
chat.sendMessage('Hello World!');
```

### Client React

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
  id: number;
  content: string;
  timestamp: Date;
  user: { id: number; username: string };
}

export function ChatComponent() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    newSocket.on('messageHistory', (history: Message[]) => {
      setMessages(history);
    });

    newSocket.on('newMessage', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => { newSocket.close(); };
  }, []);

  const handleJoin = () => {
    socket?.emit('join', { username });
  };

  const handleSend = () => {
    socket?.emit('sendMessage', { message });
    setMessage('');
  };

  return (
    <div>
      {/* UI implementation */}
    </div>
  );
}
```

## Format des données

### Message
```typescript
{
  id: number;
  content: string;
  timestamp: Date;
  user: {
    id: number;
    username: string;
  }
}
```

## Démarrage

### Mode développement
```bash
npm run start:dev
```

### Mode production
```bash
npm run build
npm run start:prod
```

## Tests

### Client de test HTML
```bash
# Démarrer le serveur puis ouvrir
open public/index.html
```

### Test automatisé
```bash
node test-websocket.js
```

## Gestion des erreurs

### Erreurs courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `error: { message: 'User not found' }` | `sendMessage` sans `join` | Appeler `join` d'abord |
| Pas de connexion | Port déjà utilisé | Vérifier port 3000 |
| Base de données locked | SQLite multi-accès | Redémarrer le serveur |

## Sécurité

⚠️ **À implémenter pour la production:**
- Authentification utilisateur
- Validation des entrées
- Rate limiting
- CORS configuration stricte

## Support

Pour tester rapidement:
```bash
npm run start:dev
# Dans un autre terminal
node test-websocket.js
```
