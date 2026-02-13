# API WebSocket - Conversations et Messages Privés

## Nouvelles fonctionnalités

Le serveur supporte maintenant :
- ✅ Conversations privées (1-à-1)
- ✅ Conversations de groupe
- ✅ Messages dans les conversations
- ✅ Messages globaux (compatibilité ancienne version)

## Événements disponibles

### 1. Créer une conversation privée

**Événement:** `createPrivateConversation`

```javascript
socket.emit('createPrivateConversation', { 
  recipientUsername: 'Alice' 
}, (response) => {
  // response.conversation: { id, type, name, createdAt }
});
```

**Réponse:**
```javascript
{
  success: true,
  conversation: {
    id: 1,
    type: 'private',
    name: 'Alice',
    createdAt: '2024-01-01T12:00:00.000Z'
  },
  message: 'Conversation already exists' // si elle existe déjà
}
```

### 2. Créer une conversation de groupe

**Événement:** `createGroupConversation`

```javascript
socket.emit('createGroupConversation', {
  name: 'Équipe Dev',
  memberUsernames: ['Alice', 'Bob', 'Charlie']
}, (response) => {
  // response.conversation: { id, type, name, createdAt, memberCount }
});
```

**Réponse:**
```javascript
{
  success: true,
  conversation: {
    id: 2,
    type: 'group',
    name: 'Équipe Dev',
    createdAt: '2024-01-01T12:00:00.000Z',
    memberCount: 4
  }
}
```

### 3. Envoyer un message dans une conversation

**Événement:** `sendMessageToConversation`

```javascript
socket.emit('sendMessageToConversation', {
  conversationId: 1,
  content: 'Hello dans la conversation !'
}, (response) => {
  // response: { success: true, messageId: 123 }
});
```

**Les membres reçoivent:**
```javascript
socket.on('newConversationMessage', (message) => {
  // message: { id, conversationId, content, sender, sentAt }
});
```

### 4. Récupérer toutes ses conversations

**Événement:** `getConversations`

```javascript
socket.emit('getConversations', {}, (response) => {
  // response.conversations: Array
});
```

**Réponse:**
```javascript
{
  success: true,
  conversations: [
    {
      id: 1,
      type: 'private',
      name: 'Alice',
      createdAt: '2024-01-01T12:00:00.000Z',
      memberCount: 2,
      lastMessage: {
        content: 'Hello !',
        sender: 'Alice',
        sentAt: '2024-01-01T12:05:00.000Z'
      }
    },
    {
      id: 2,
      type: 'group',
      name: 'Équipe Dev',
      createdAt: '2024-01-01T11:00:00.000Z',
      memberCount: 4,
      lastMessage: null
    }
  ]
}
```

### 5. Récupérer l'historique d'une conversation

**Événement:** `getConversationMessages`

```javascript
socket.emit('getConversationMessages', {
  conversationId: 1
}, (response) => {
  // response.messages: Array (100 derniers messages)
});
```

**Réponse:**
```javascript
{
  success: true,
  messages: [
    {
      id: 1,
      content: 'Hello !',
      sender: 'Alice',
      sentAt: '2024-01-01T12:00:00.000Z'
    },
    {
      id: 2,
      content: 'Salut !',
      sender: 'Bob',
      sentAt: '2024-01-01T12:01:00.000Z'
    }
  ]
}
```

## Événements existants (compatibilité)

### Messages globaux

Les événements suivants fonctionnent toujours :

```javascript
// Rejoindre le chat
socket.emit('join', { username: 'Bob' });

// Envoyer un message global (pas dans une conversation)
socket.emit('sendMessage', { content: 'Hello everyone!' });

// Recevoir un message global
socket.on('newMessage', (message) => {
  // message: { id, content, sender, sentAt }
});

// Récupérer l'historique global
socket.on('messageHistory', (messages) => {
  // Reçu automatiquement après 'join'
});

// Obtenir les utilisateurs connectés
socket.emit('getUsers', {}, (response) => {
  // response.users: ['Alice', 'Bob', ...]
});
```

## Exemple complet - Client React

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface Conversation {
  id: number;
  type: 'private' | 'group';
  name: string;
  memberCount: number;
  lastMessage?: {
    content: string;
    sender: string;
    sentAt: string;
  };
}

interface Message {
  id: number;
  content: string;
  sender: string;
  sentAt: string;
  conversationId?: number;
}

export function ChatApp() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    // Écouter les nouveaux messages dans les conversations
    newSocket.on('newConversationMessage', (message: Message) => {
      if (message.conversationId === currentConversation) {
        setMessages(prev => [...prev, message]);
      }
      // Actualiser la liste des conversations pour mettre à jour le dernier message
      loadConversations();
    });

    return () => { newSocket.close(); };
  }, []);

  const join = (username: string) => {
    socket?.emit('join', { username }, (response: any) => {
      if (response.success) {
        setUsername(username);
        loadConversations();
      }
    });
  };

  const loadConversations = () => {
    socket?.emit('getConversations', {}, (response: any) => {
      if (response.success) {
        setConversations(response.conversations);
      }
    });
  };

  const createPrivateConversation = (recipientUsername: string) => {
    socket?.emit('createPrivateConversation', { recipientUsername }, (response: any) => {
      if (response.success) {
        loadConversations();
        openConversation(response.conversation.id);
      }
    });
  };

  const createGroupConversation = (name: string, memberUsernames: string[]) => {
    socket?.emit('createGroupConversation', { name, memberUsernames }, (response: any) => {
      if (response.success) {
        loadConversations();
        openConversation(response.conversation.id);
      }
    });
  };

  const openConversation = (conversationId: number) => {
    setCurrentConversation(conversationId);
    socket?.emit('getConversationMessages', { conversationId }, (response: any) => {
      if (response.success) {
        setMessages(response.messages);
      }
    });
  };

  const sendMessage = (content: string) => {
    if (currentConversation) {
      socket?.emit('sendMessageToConversation', {
        conversationId: currentConversation,
        content
      });
    } else {
      // Message global
      socket?.emit('sendMessage', { content });
    }
  };

  return (
    <div className="chat-app">
      {/* UI implementation */}
    </div>
  );
}
```

## Exemple - Client Vanilla JS

```javascript
const socket = io('http://localhost:3000');

// Rejoindre
socket.emit('join', { username: 'Bob' });

// Créer une conversation privée avec Alice
socket.emit('createPrivateConversation', 
  { recipientUsername: 'Alice' },
  (response) => {
    if (response.success) {
      const conversationId = response.conversation.id;
      
      // Envoyer un message privé
      socket.emit('sendMessageToConversation', {
        conversationId,
        content: 'Salut Alice !'
      });
    }
  }
);

// Recevoir les messages de conversation
socket.on('newConversationMessage', (message) => {
  console.log(`[Conv ${message.conversationId}] ${message.sender}: ${message.content}`);
  displayMessage(message);
});

// Créer un groupe
socket.emit('createGroupConversation', {
  name: 'Équipe Dev',
  memberUsernames: ['Alice', 'Charlie']
}, (response) => {
  console.log('Groupe créé:', response.conversation);
});

// Lister mes conversations
socket.emit('getConversations', {}, (response) => {
  response.conversations.forEach(conv => {
    console.log(`- ${conv.name} (${conv.type})`);
  });
});
```

## Gestion des erreurs

Toutes les réponses incluent un champ `success`:

```javascript
// Succès
{ success: true, ... }

// Erreur
{ success: false, error: 'Message d\'erreur' }
```

**Erreurs courantes:**
- `User not authenticated. Please join first.` → Appeler `join` d'abord
- `Recipient not found.` → L'utilisateur destinataire n'existe pas
- `You are not a member of this conversation.` → Accès refusé à cette conversation
- `Cannot create conversation with yourself.` → Impossible de créer une conversation privée avec soi-même

## Migration depuis l'ancienne version

L'ancienne API est **100% compatible** :
- `join` fonctionne toujours
- `sendMessage` envoie des messages globaux
- `newMessage` reçoit les messages globaux
- `messageHistory` contient les messages globaux

Pour utiliser les conversations :
1. Appeler `createPrivateConversation` ou `createGroupConversation`
2. Utiliser `sendMessageToConversation` au lieu de `sendMessage`
3. Écouter `newConversationMessage` au lieu de `newMessage`
