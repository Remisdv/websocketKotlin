# Serveur de Messagerie WebSocket NestJS

Un serveur de messagerie en temps réel avec WebSocket (Socket.io), authentification JWT et SQLite.

## Fonctionnalités

- 🔐 **Authentification sécurisée** : Inscription/connexion avec JWT
- 🔒 **Hashage des mots de passe** : bcrypt avec 10 rounds de salting
- 💬 **Chat en temps réel** : WebSocket avec Socket.io
- 👥 **Chat multi-utilisateurs** : Messages globaux et conversations privées
- 📝 **Persistance** : Historique des messages en SQLite
- ✅ **Compatible Kotlin/Android** : Documentation complète pour intégration mobile

## Installation

```bash
npm install
```

## Configuration

Copiez le fichier `.env.example` vers `.env` et modifiez les valeurs :

```bash
cp .env.example .env
```

**Important** : Changez `JWT_SECRET` en production !

```env
JWT_SECRET=votre-cle-secrete-tres-longue-et-aleatoire
PORT=3000
```

## Démarrage

```bash
# Mode développement
npm run start:dev

# Mode production
npm run start:prod
```

Le serveur démarre sur `http://localhost:3000`

## API REST - Authentification

### POST `/auth/register`
Créer un nouveau compte.

**Body:**
```json
{
  "username": "alice",
  "password": "monmotdepasse"
}
```

**Réponse:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "alice"
  }
}
```

### POST `/auth/login`
Se connecter avec un compte existant.

**Body:**
```json
{
  "username": "alice",
  "password": "monmotdepasse"
}
```

**Réponse:** Identique à `/auth/register`

## WebSocket - Connexion sécurisée

### Connexion avec JWT

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'votre-token-jwt'
  }
});

// Le serveur authentifie automatiquement et envoie l'historique
socket.on('messageHistory', (messages) => {
  console.log('Historique:', messages);
});
```

**Important** : Sans token JWT valide, la connexion WebSocket est refusée.

## Événements WebSocket

### Serveur -> Client (automatique)

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

### Serveur -> Client (automatique)

#### `messageHistory`
Historique des derniers messages (envoyé automatiquement à la connexion).

#### `newMessage`
Nouveau message diffusé à tous.
```json
{
  "id": 1,
  "content": "Bonjour!",
  "sender": "alice",
  "sentAt": "2026-02-13T10:30:00.000Z"
}
```

#### `userJoined` / `userLeft`
Notifications de connexion/déconnexion des utilisateurs.

### Client -> Serveur

#### `newMessage`
Nouveau message diffusé à tous.
```json
{
  "id": 1,
  "content": "Bonjour!",
// 1. D'abord, s'authentifier via REST
const response = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'password123' })
});
const { access_token } = await response.json();

// 2. Connecter le WebSocket avec le token
const socket = io('http://localhost:3000', {
  auth: { token: access_token }
});

socket.on('connect', () => {
  console.log('Connecté!');
});

socket.on('messageHistory', (messages) => {
  console.log('Historique:', messages);
});

socket.on('newMessage', (msg) => {
  console.log(`[${msg.sender}] ${msg.content}`);
});

// 3. Envoyer un message
socket.emit('sendMessage', { content: 'Hello World!' });
```

## Intégration Kotlin/Android

Consultez [KOTLIN_INTEGRATION.md](KOTLIN_INTEGRATION.md) pour une documentation complète de l'intégration Android avec :
- Configuration Gradle
- Modèles de données
- Service d'authentification
- Service WebSocket
- ViewModel et exemples d'utilisation

## Sécurité

- ✅ Mots de passe hashés avec bcrypt (10 rounds)
- ✅ Authentification JWT avec expiration (7 jours)
- ✅ WebSocket protégé par JWT
- ✅ Pas de mot de passe en clair dans la base
- ⚠️ En production : utilisez HTTPS/WSS et changez JWT_SECRET

## Base de données

Le fichier `messaging.db` (SQLite) est créé automatiquement avec les tables :
- `user` : id, username, password (hashé), createdAt
- `message` : id, content, senderId, conversationId, sentAt
- `conversation` : id, type, name, createdBy, createdAt
- `conversation_member` : conversationId, userId, joinedAt
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
