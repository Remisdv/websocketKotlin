# 💬 Conversations en Temps Réel - Guide Kotlin/Android

## Vue d'ensemble

Ce guide explique comment intégrer les conversations privées et de groupe en temps réel dans votre application Android. Les conversations s'affichent automatiquement grâce aux WebSockets - pas besoin de rafraîchir !

---

## 🔔 Événements WebSocket pour les Conversations

### Événements reçus du serveur

#### `newConversation` 
**Déclenché quand** : Quelqu'un crée une conversation avec vous

**Données reçues** :
```json
{
  "id": 123,
  "type": "PRIVATE",  // ou "GROUP"
  "name": "alice",
  "createdAt": "2026-02-13T10:30:00.000Z",
  "createdBy": "bob",
  "memberCount": 2    // Pour les groupes uniquement
}
```

**Utilisation** : Ajouter automatiquement la conversation à la liste sans recharger

---

## 📱 Intégration Complète

### Étape 1 : Modèles de Données (models/ConversationModels.kt)

```kotlin
package com.votreapp.models

data class Conversation(
    val id: Int,
    val type: String,           // "PRIVATE" ou "GROUP"
    val name: String,           // Nom du groupe ou de l'autre utilisateur
    val createdAt: String,
    val createdBy: String? = null,
    val memberCount: Int? = null,
    val lastMessage: LastMessage? = null
)

data class LastMessage(
    val content: String,
    val sender: String,
    val sentAt: String
)

data class ConversationMessage(
    val id: Int? = null,
    val conversationId: Int,
    val content: String,
    val sender: String,
    val sentAt: String
)
```

---

### Étape 2 : Service WebSocket (services/ChatSocketService.kt)

```kotlin
package com.votreapp.services

import com.google.gson.Gson
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject

class ChatSocketService(private val serverUrl: String) {
    private var socket: Socket? = null
    private val gson = Gson()
    
    // StateFlow pour les conversations
    private val _conversations = MutableStateFlow<List<Conversation>>(emptyList())
    val conversations: StateFlow<List<Conversation>> = _conversations
    
    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected
    
    fun connect(jwtToken: String) {
        try {
            val options = IO.Options().apply {
                auth = mapOf("token" to jwtToken)
                reconnection = true
            }
            
            socket = IO.socket(serverUrl, options)
            
            socket?.on(Socket.EVENT_CONNECT) {
                _isConnected.value = true
                // Charger automatiquement les conversations à la connexion
                loadConversations()
            }
            
            socket?.on(Socket.EVENT_DISCONNECT) {
                _isConnected.value = false
            }
            
            // 🆕 Écouter les nouvelles conversations en temps réel
            socket?.on("newConversation") { args ->
                try {
                    val convJson = args[0].toString()
                    val conversation = gson.fromJson(convJson, Conversation::class.java)
                    
                    // Ajouter en haut de la liste (plus récent en premier)
                    _conversations.value = listOf(conversation) + _conversations.value
                    
                    Log.d("ChatSocket", "✨ Nouvelle conversation reçue: ${conversation.name}")
                } catch (e: Exception) {
                    Log.e("ChatSocket", "Erreur parsing newConversation", e)
                }
            }
            
            socket?.connect()
        } catch (e: Exception) {
            Log.e("ChatSocket", "Erreur connexion", e)
        }
    }
    
    // Charger toutes les conversations
    private fun loadConversations() {
        socket?.emit("getConversations") { args ->
            try {
                val response = args[0] as JSONObject
                if (response.getBoolean("success")) {
                    val convsArray = response.getJSONArray("conversations")
                    val convsList = mutableListOf<Conversation>()
                    
                    for (i in 0 until convsArray.length()) {
                        val convJson = convsArray.getJSONObject(i).toString()
                        val conv = gson.fromJson(convJson, Conversation::class.java)
                        convsList.add(conv)
                    }
                    
                    _conversations.value = convsList
                    Log.d("ChatSocket", "📋 ${convsList.size} conversations chargées")
                }
            } catch (e: Exception) {
                Log.e("ChatSocket", "Erreur chargement conversations", e)
            }
        }
    }
    
    // 🆕 Créer une conversation privée
    fun createPrivateConversation(
        recipientUsername: String,
        callback: (Boolean, Conversation?, String?) -> Unit
    ) {
        val payload = JSONObject().apply {
            put("recipientUsername", recipientUsername)
        }
        
        socket?.emit("createPrivateConversation", payload) { args ->
            try {
                val response = args[0] as JSONObject
                val success = response.getBoolean("success")
                
                if (success) {
                    val convJson = response.getJSONObject("conversation").toString()
                    val conversation = gson.fromJson(convJson, Conversation::class.java)
                    
                    // Si la conversation existe déjà, ne pas la dupliquer
                    val alreadyExists = response.optString("message") == "Conversation already exists"
                    
                    if (!alreadyExists) {
                        _conversations.value = listOf(conversation) + _conversations.value
                    }
                    
                    callback(true, conversation, null)
                } else {
                    val error = response.optString("error", "Erreur inconnue")
                    callback(false, null, error)
                }
            } catch (e: Exception) {
                callback(false, null, e.message)
            }
        }
    }
    
    // 🆕 Créer une conversation de groupe
    fun createGroupConversation(
        groupName: String,
        memberUsernames: List<String>,
        callback: (Boolean, Conversation?, String?) -> Unit
    ) {
        val payload = JSONObject().apply {
            put("name", groupName)
            put("memberUsernames", JSONArray(memberUsernames))
        }
        
        socket?.emit("createGroupConversation", payload) { args ->
            try {
                val response = args[0] as JSONObject
                val success = response.getBoolean("success")
                
                if (success) {
                    val convJson = response.getJSONObject("conversation").toString()
                    val conversation = gson.fromJson(convJson, Conversation::class.java)
                    
                    _conversations.value = listOf(conversation) + _conversations.value
                    callback(true, conversation, null)
                } else {
                    val error = response.optString("error", "Erreur inconnue")
                    callback(false, null, error)
                }
            } catch (e: Exception) {
                callback(false, null, e.message)
            }
        }
    }
    
    // 🆕 Envoyer un message dans une conversation
    fun sendMessageToConversation(
        conversationId: Int,
        content: String,
        callback: (Boolean, String?) -> Unit
    ) {
        val payload = JSONObject().apply {
            put("conversationId", conversationId)
            put("content", content)
        }
        
        socket?.emit("sendMessageToConversation", payload) { args ->
            try {
                val response = args[0] as JSONObject
                val success = response.getBoolean("success")
                val error = if (success) null else response.optString("error")
                callback(success, error)
            } catch (e: Exception) {
                callback(false, e.message)
            }
        }
    }
    
    // 🆕 Charger les messages d'une conversation
    fun getConversationMessages(
        conversationId: Int,
        callback: (Boolean, List<ConversationMessage>?) -> Unit
    ) {
        val payload = JSONObject().apply {
            put("conversationId", conversationId)
        }
        
        socket?.emit("getConversationMessages", payload) { args ->
            try {
                val response = args[0] as JSONObject
                val success = response.getBoolean("success")
                
                if (success) {
                    val messagesArray = response.getJSONArray("messages")
                    val messages = mutableListOf<ConversationMessage>()
                    
                    for (i in 0 until messagesArray.length()) {
                        val msgJson = messagesArray.getJSONObject(i).toString()
                        val msg = gson.fromJson(msgJson, ConversationMessage::class.java)
                        messages.add(msg)
                    }
                    
                    callback(true, messages)
                } else {
                    callback(false, null)
                }
            } catch (e: Exception) {
                callback(false, null)
            }
        }
    }
    
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
}
```

---

### Étape 3 : ViewModel (viewmodels/ConversationViewModel.kt)

```kotlin
package com.votreapp.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.votreapp.services.ChatSocketService
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class ConversationViewModel(
    private val chatService: ChatSocketService
) : ViewModel() {
    
    // Les conversations sont automatiquement mises à jour via le StateFlow
    val conversations: StateFlow<List<Conversation>> = chatService.conversations
    val isConnected: StateFlow<Boolean> = chatService.isConnected
    
    // Créer une conversation privée
    fun createPrivateConversation(
        recipientUsername: String,
        onResult: (Boolean, Conversation?, String?) -> Unit
    ) {
        chatService.createPrivateConversation(recipientUsername) { success, conv, error ->
            onResult(success, conv, error)
        }
    }
    
    // Créer un groupe
    fun createGroupConversation(
        groupName: String,
        memberUsernames: List<String>,
        onResult: (Boolean, Conversation?, String?) -> Unit
    ) {
        chatService.createGroupConversation(groupName, memberUsernames) { success, conv, error ->
            onResult(success, conv, error)
        }
    }
    
    // Envoyer un message dans une conversation
    fun sendMessage(conversationId: Int, content: String, onResult: (Boolean, String?) -> Unit) {
        chatService.sendMessageToConversation(conversationId, content) { success, error ->
            onResult(success, error)
        }
    }
}
```

---

### Étape 4 : UI - Liste des Conversations (Jetpack Compose)

```kotlin
package com.votreapp.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun ConversationsScreen(
    viewModel: ConversationViewModel,
    onConversationClick: (Conversation) -> Unit
) {
    // ✨ Observer les conversations en temps réel
    val conversations by viewModel.conversations.collectAsStateWithLifecycle()
    val isConnected by viewModel.isConnected.collectAsStateWithLifecycle()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Conversations") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = if (isConnected) 
                        MaterialTheme.colorScheme.primaryContainer 
                    else 
                        MaterialTheme.colorScheme.errorContainer
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            items(conversations, key = { it.id }) { conversation ->
                ConversationItem(
                    conversation = conversation,
                    onClick = { onConversationClick(conversation) }
                )
            }
        }
    }
}

@Composable
fun ConversationItem(
    conversation: Conversation,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = conversation.name,
                    style = MaterialTheme.typography.titleMedium
                )
                if (conversation.type == "GROUP") {
                    Text(
                        text = "${conversation.memberCount} membres",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.secondary
                    )
                }
            }
            
            conversation.lastMessage?.let { lastMsg ->
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${lastMsg.sender}: ${lastMsg.content}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }
        }
    }
}
```

---

### Étape 5 : Créer une Nouvelle Conversation

```kotlin
@Composable
fun NewConversationDialog(
    viewModel: ConversationViewModel,
    onDismiss: () -> Unit,
    onSuccess: (Conversation) -> Unit
) {
    var recipientUsername by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nouvelle conversation") },
        text = {
            Column {
                TextField(
                    value = recipientUsername,
                    onValueChange = { recipientUsername = it },
                    label = { Text("Nom d'utilisateur") },
                    enabled = !isLoading
                )
                
                errorMessage?.let { error ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    isLoading = true
                    errorMessage = null
                    
                    viewModel.createPrivateConversation(recipientUsername) { success, conv, error ->
                        isLoading = false
                        if (success && conv != null) {
                            onSuccess(conv)
                            onDismiss()
                        } else {
                            errorMessage = error ?: "Erreur inconnue"
                        }
                    }
                },
                enabled = !isLoading && recipientUsername.isNotBlank()
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("Créer")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Annuler")
            }
        }
    )
}
```

---

## 🔄 Flux de Fonctionnement

### Scénario 1 : Alice crée une conversation avec Bob

1. **Alice** clique sur "Nouvelle conversation"
2. **Alice** entre "bob" et valide
3. Le serveur crée la conversation
4. **Alice** reçoit la réponse de création (ajoutée à sa liste)
5. **Bob** (s'il est connecté) reçoit l'événement `newConversation` ✨
6. La conversation apparaît **automatiquement** dans la liste de **Bob**

### Scénario 2 : Alice crée un groupe

1. **Alice** crée un groupe "Équipe" avec Bob et Charlie
2. Le serveur crée le groupe
3. **Bob** et **Charlie** reçoivent `newConversation` en temps réel ✨
4. Le groupe apparaît dans leur liste instantanément

---

## ✨ Avantages de cette Approche

✅ **Temps réel** : Pas besoin de rafraîchir manuellement  
✅ **Automatique** : Les conversations s'affichent dès qu'elles sont créées  
✅ **Performant** : Utilise les WebSockets (pas de polling)  
✅ **Réactif** : StateFlow met à jour l'UI automatiquement  
✅ **Fiable** : Rechargement automatique à la reconnexion  

---

## 🧪 Tester l'Intégration

### Test 1 : Créer une conversation

```kotlin
// Dans votre Activity ou Fragment
viewModel.createPrivateConversation("alice") { success, conversation, error ->
    if (success && conversation != null) {
        println("✅ Conversation créée: ${conversation.id}")
        // Naviguer vers la conversation
        navigateToConversation(conversation.id)
    } else {
        println("❌ Erreur: $error")
    }
}
```

### Test 2 : Observer les conversations

```kotlin
lifecycleScope.launch {
    viewModel.conversations.collect { conversations ->
        println("📋 ${conversations.size} conversations")
        conversations.forEach { conv ->
            println("  - ${conv.name} (${conv.type})")
        }
    }
}
```

### Test 3 : Créer un groupe

```kotlin
viewModel.createGroupConversation(
    groupName = "Mon Groupe",
    memberUsernames = listOf("alice", "bob", "charlie")
) { success, conversation, error ->
    if (success) {
        println("✅ Groupe créé!")
    }
}
```

---

## 📝 Notes Importantes

1. **L'événement `newConversation` est envoyé uniquement aux autres membres**, pas au créateur (il reçoit la réponse de création)

2. **La liste est triée automatiquement** par date du dernier message sur le serveur

3. **Les conversations sont rechargées automatiquement** à chaque connexion WebSocket

4. **Si l'utilisateur est hors ligne**, il recevra ses conversations au prochain chargement (via `getConversations`)

---

## 🔗 Événements WebSocket Disponibles

| Événement | Direction | Description |
|-----------|-----------|-------------|
| `newConversation` | Serveur → Client | Nouvelle conversation créée avec vous |
| `createPrivateConversation` | Client → Serveur | Créer une conversation privée |
| `createGroupConversation` | Client → Serveur | Créer un groupe |
| `getConversations` | Client → Serveur | Charger toutes vos conversations |
| `sendMessageToConversation` | Client → Serveur | Envoyer un message dans une conversation |
| `getConversationMessages` | Client → Serveur | Charger les messages d'une conversation |
| `newConversationMessage` | Serveur → Client | Nouveau message dans une conversation |

---

**Documentation complète** : Voir aussi [GUIDE_KOTLIN.md](GUIDE_KOTLIN.md) pour l'authentification et [KOTLIN_INTEGRATION.md](KOTLIN_INTEGRATION.md) pour plus de détails techniques.
