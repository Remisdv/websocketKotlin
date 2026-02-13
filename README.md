# Serveur de Messagerie WebSocket NestJS

Un serveur de messagerie en temps réel avec WebSocket (Socket.io) et SQLite.

## Fonctionnalités

- ✅ Connexion WebSocket en temps réel
- ✅ Chat multi-utilisateurs avec messages globaux
- ✅ **Conversations privées (1-à-1)**
- ✅ **Conversations de groupe**
- ✅ Historique des messages persisté en SQLite
- ✅ Affichage du nom d'expéditeur et de l'heure d'envoi
- ✅ Notifications de connexion/déconnexion

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

### Interface Conversations
Ouvrez `http://localhost:3000/conversations.html` pour :
- Créer des conversations privées
- Créer des groupes de discussion
- Envoyer des messages dans les conversations

### Interface Globale (ancienne version)
Ouvrez `http://localhost:3000` pour le chat global classique.

## Documentation complète

- 📘 [Documentation d'intégration](INTEGRATION.md) - Guide pour intégrer le serveur
- 📗 [API Conversations](CONVERSATIONS.md) - Guide détaillé des conversations et messages privés

## Événements WebSocket

### Conversations

#### `createPrivateConversation`
Créer une conversation privée avec un utilisateur.
```javascript
socket.emit('createPrivateConversation', { 
  recipientUsername: 'Alice' 
}, (response) => {
  // response.conversation: { id, type, name, createdAt }
});
```

#### `createGroupConversation`
Créer une conversation de groupe.
```javascript
socket.emit('createGroupConversation', {
  name: 'Équipe Dev',
  memberUsernames: ['Alice', 'Bob']
}, (response) => {
  // response.conversation: { id, type, name, createdAt, memberCount }
});
```

#### `sendMessageToConversation`
Envoyer un message dans une conversation.
```javascript
socket.emit('sendMessageToConversation', {
  conversationId: 1,
  content: 'Hello!'
}, (response) => {
  // response: { success: true, messageId: 123 }
});

// Les membres reçoivent :
socket.on('newConversationMessage', (msg) => {
  // msg: { id, conversationId, content, sender, sentAt }
});
```

#### `getConversations`
Récupérer toutes ses conversations.
```javascript
socket.emit('getConversations', {}, (response) => {
  // response.conversations: Array avec lastMessage, memberCount, etc.
});
```

#### `getConversationMessages`
Récupérer l'historique d'une conversation.
```javascript
socket.emit('getConversationMessages', { 
  conversationId: 1 
}, (response) => {
  // response.messages: Array (100 derniers messages)
});
```

### Messages Globaux (compatibilité)

#### `join`
Rejoindre le chat avec un nom d'utilisateur.
```javascript
socket.emit('join', { username: 'Alice' });
```

#### `sendMessage`
Envoyer un message global.
```javascript
socket.emit('sendMessage', { content: 'Bonjour!' });
```

#### `getUsers`
Obtenir la liste des utilisateurs connectés.
```javascript
socket.emit('getUsers');
```

### Événements reçus

#### `messageHistory`
Historique des messages globaux (reçu après `join`).

#### `newMessage`
Nouveau message global diffusé à tous.
```json
{
  "id": 1,
  "content": "Bonjour!",
  "sender": "Alice",
  "sentAt": "2026-02-12T10:30:00.000Z"
}
```

#### `newConversationMessage`
Nouveau message dans une conversation.
```json
{
  "id": 1,
  "conversationId": 5,
  "content": "Hello!",
  "sender": "Alice",
  "sentAt": "2026-02-12T10:30:00.000Z"
}
```

#### `userJoined` / `userLeft`
Notifications de connexion/déconnexion.

## Base de données

Le fichier `messaging.db` (SQLite) est créé automatiquement au démarrage.

### Entités
- **User** - Utilisateurs
- **Message** - Messages (globaux ou liés à une conversation)
- **Conversation** - Conversations (privées ou groupes)
- **ConversationMember** - Membres des conversations
