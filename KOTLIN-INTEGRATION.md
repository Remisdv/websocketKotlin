# Guide d'intégration Kotlin - Serveur WebSocket

Ce guide explique comment intégrer le serveur de messagerie WebSocket dans une application Kotlin/Android.

## Dépendances

Ajoutez Socket.IO client dans votre `build.gradle.kts` :

```kotlin
dependencies {
    implementation("io.socket:socket.io-client:2.1.0")
    
    // Pour la gestion JSON
    implementation("com.google.code.gson:gson:2.10.1")
    
    // Coroutines pour async
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
```

Permissions Android (`AndroidManifest.xml`) :

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

## Configuration Socket.IO

### Classe SocketManager

```kotlin
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import org.json.JSONObject
import org.json.JSONArray
import java.net.URISyntaxException

class SocketManager private constructor() {
    
    private var socket: Socket? = null
    private var currentUsername: String? = null
    
    companion object {
        @Volatile
        private var instance: SocketManager? = null
        
        fun getInstance(): SocketManager {
            return instance ?: synchronized(this) {
                instance ?: SocketManager().also { instance = it }
            }
        }
        
        // URL du serveur - À MODIFIER
        private const val SERVER_URL = "http://10.0.2.2:3000" // Émulateur Android
        // private const val SERVER_URL = "http://192.168.1.X:3000" // Appareil physique
        // private const val SERVER_URL = "https://your-server.onrender.com" // Production
    }
    
    // Initialiser la connexion
    fun connect() {
        try {
            val options = IO.Options().apply {
                reconnection = true
                reconnectionDelay = 1000
                reconnectionAttempts = 5
            }
            
            socket = IO.socket(SERVER_URL, options)
            socket?.connect()
            
            setupEventListeners()
        } catch (e: URISyntaxException) {
            e.printStackTrace()
        }
    }
    
    // Déconnexion
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        currentUsername = null
    }
    
    // Vérifier si connecté
    fun isConnected(): Boolean = socket?.connected() ?: false
    
    // Obtenir le socket (pour les listeners custom)
    fun getSocket(): Socket? = socket
    
    // Configuration des listeners de base
    private fun setupEventListeners() {
        socket?.on(Socket.EVENT_CONNECT) {
            println("✅ Connecté au serveur WebSocket")
        }
        
        socket?.on(Socket.EVENT_DISCONNECT) {
            println("❌ Déconnecté du serveur WebSocket")
        }
        
        socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
            println("❌ Erreur de connexion: ${args.firstOrNull()}")
        }
    }
    
    // === AUTHENTIFICATION ===
    
    fun join(username: String, callback: (Boolean, String?) -> Unit) {
        val data = JSONObject().put("username", username)
        
        socket?.emit("join", data) { args ->
            val response = args.firstOrNull() as? JSONObject
            val success = response?.optBoolean("success", false) ?: false
            val error = response?.optString("error")
            
            if (success) {
                currentUsername = username
            }
            
            callback(success, error)
        }
    }
    
    fun getCurrentUsername(): String? = currentUsername
    
    // === RECHERCHE UTILISATEURS ===
    
    fun getAllUsers(callback: (List<User>) -> Unit) {
        socket?.emit("getAllUsers", JSONObject()) { args ->
            val response = args.firstOrNull() as? JSONObject
            val success = response?.optBoolean("success", false) ?: false
            
            if (success) {
                val usersArray = response.getJSONArray("users")
                val users = parseUsers(usersArray)
                callback(users)
            } else {
                callback(emptyList())
            }
        }
    }
    
    fun searchUsers(query: String, callback: (List<User>) -> Unit) {
        val data = JSONObject().put("query", query)
        
        socket?.emit("searchUsers", data) { args ->
            val response = args.firstOrNull() as? JSONObject
            val success = response?.optBoolean("success", false) ?: false
            
            if (success) {
                val usersArray = response.getJSONArray("users")
                val users = parseUsers(usersArray)
                callback(users)
            } else {
                callback(emptyList())
            }
        }
    }
    
    private fun parseUsers(array: JSONArray): List<User> {
        val users = mutableListOf<User>()
        for (i in 0 until array.length()) {
            val userJson = array.getJSONObject(i)
            users.add(
                User(
                    id = userJson.getInt("id"),
                    username = userJson.getString("username"),
                    isOnline = userJson.optBoolean("isOnline", false)
                )
            )
        }
        return users
    }
    
    // === CONVERSATIONS ===
    
    fun createPrivateConversation(
        recipientUsername: String, 
        callback: (Boolean, Conversation?, String?) -> Unit
    ) {
        val data = JSONObject().put("recipientUsername", recipientUsername)
        
        socket?.emit("createPrivateConversation", data) { args ->
            val response = args.firstOrNull() as? JSONObject
            val success = response?.optBoolean("success", false) ?: false
            
            if (success) {
                val convJson = response.getJSONObject("conversation")
                val conversation = parseConversation(convJson)
                callback(true, conversation, null)
            } else {
                val error = response?.optString("error")
                callback(false, null, error)
            }
        }
    }
    
    fun createGroupConversation(
        name: String,
        memberUsernames: List<String>,
        callback: (Boolean, Conversation?, String?) -> Unit
    ) {
        val membersArray = JSONArray(memberUsernames)
        val data = JSONObject()
            .put("name", name)
            .put("memberUsernames", membersArray)
        
        socket?.emit("createGroupConversation", data) { args ->
            val response = args.firstOrNull() as? JSONObject
            val success = response?.optBoolean("success", false) ?: false
            
            if (success) {
                val convJson = response.getJSONObject("conversation")
                val conversation = parseConversation(convJson)
                callback(true, conversation, null)
            } else {
                val error = response?.optString("error")
                callback(false, null, error)
            }
        }
    }
    
    fun getConversations(callback: (List<Conversation>) -> Unit) {
        socket?.emit("getConversations", JSONObject()) { args ->
            val response = args.firstOrNull() as? JSONObject
            val success = response?.optBoolean("success", false) ?: false
            
            if (success) {
                val convsArray = response.getJSONArray("conversations")
                val conversations = mutableListOf<Conversation>()
                
                for (i in 0 until convsArray.length()) {
                    val convJson = convsArray.getJSONObject(i)
                    conversations.add(parseConversation(convJson))
                }
                
                callback(conversations)
            } else {
                callback(emptyList())
            }
        }
    }
    
    private fun parseConversation(json: JSONObject): Conversation {
        val lastMessageJson = json.optJSONObject("lastMessage")
        val lastMessage = lastMessageJson?.let {
            Message(
                id = 0,
                conversationId = json.getInt("id"),
                content = it.getString("content"),
                sender = it.getString("sender"),
                sentAt = it.getString("sentAt")
            )
        }
        
        return Conversation(
            id = json.getInt("id"),
            type = json.getString("type"),
            name = json.getString("name"),
            memberCount = json.optInt("memberCount", 0),
            createdAt = json.getString("createdAt"),
            lastMessage = lastMessage
        )
    }
    
    // === MESSAGES ===
    
    fun sendMessageToConversation(
        conversationId: Int,
        content: String,
        callback: (Boolean, String?) -> Unit
    ) {
        val data = JSONObject()
            .put("conversationId", conversationId)
            .put("content", content)
        
        socket?.emit("sendMessageToConversation", data) { args ->
            val response = args.firstOrNull() as? JSONObject
            val success = response?.optBoolean("success", false) ?: false
            val error = response?.optString("error")
            
            callback(success, error)
        }
    }
    
    fun getConversationMessages(
        conversationId: Int,
        callback: (List<Message>) -> Unit
    ) {
        val data = JSONObject().put("conversationId", conversationId)
        
        socket?.emit("getConversationMessages", data) { args ->
            val response = args.firstOrNull() as? JSONObject
            val success = response?.optBoolean("success", false) ?: false
            
            if (success) {
                val messagesArray = response.getJSONArray("messages")
                val messages = mutableListOf<Message>()
                
                for (i in 0 until messagesArray.length()) {
                    val msgJson = messagesArray.getJSONObject(i)
                    messages.add(
                        Message(
                            id = msgJson.getInt("id"),
                            conversationId = conversationId,
                            content = msgJson.getString("content"),
                            sender = msgJson.getString("sender"),
                            sentAt = msgJson.getString("sentAt")
                        )
                    )
                }
                
                callback(messages)
            } else {
                callback(emptyList())
            }
        }
    }
    
    // === LISTENERS TEMPS RÉEL ===
    
    fun onNewConversationMessage(listener: (Message) -> Unit): Emitter.Listener {
        val emitterListener = Emitter.Listener { args ->
            val msgJson = args.firstOrNull() as? JSONObject
            msgJson?.let {
                val message = Message(
                    id = it.getInt("id"),
                    conversationId = it.getInt("conversationId"),
                    content = it.getString("content"),
                    sender = it.getString("sender"),
                    sentAt = it.getString("sentAt")
                )
                listener(message)
            }
        }
        socket?.on("newConversationMessage", emitterListener)
        return emitterListener
    }
    
    fun removeListener(event: String, listener: Emitter.Listener) {
        socket?.off(event, listener)
    }
}

// === DATA CLASSES ===

data class User(
    val id: Int,
    val username: String,
    val isOnline: Boolean = false
)

data class Conversation(
    val id: Int,
    val type: String, // "private" ou "group"
    val name: String,
    val memberCount: Int = 0,
    val createdAt: String,
    val lastMessage: Message? = null
)

data class Message(
    val id: Int,
    val conversationId: Int,
    val content: String,
    val sender: String,
    val sentAt: String
)
```

## Utilisation dans une Activity/Fragment

### Exemple complet

```kotlin
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ChatActivity : AppCompatActivity() {
    
    private val socketManager = SocketManager.getInstance()
    private var messageListener: Emitter.Listener? = null
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chat)
        
        // Connexion au serveur
        socketManager.connect()
        
        // Rejoindre avec un username
        joinChat("MonUsername")
        
        // Écouter les nouveaux messages
        setupMessageListener()
    }
    
    private fun joinChat(username: String) {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                socketManager.join(username) { success, error ->
                    runOnUiThread {
                        if (success) {
                            println("✅ Connecté en tant que $username")
                            loadConversations()
                        } else {
                            println("❌ Erreur: $error")
                        }
                    }
                }
            }
        }
    }
    
    private fun loadConversations() {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                socketManager.getConversations { conversations ->
                    runOnUiThread {
                        // Mettre à jour l'UI avec les conversations
                        println("📋 ${conversations.size} conversations")
                        conversations.forEach { conv ->
                            println("  - ${conv.name} (${conv.type})")
                        }
                    }
                }
            }
        }
    }
    
    private fun setupMessageListener() {
        messageListener = socketManager.onNewConversationMessage { message ->
            runOnUiThread {
                // Nouveau message reçu
                println("💬 [${message.sender}] ${message.content}")
                // Mettre à jour l'UI
                addMessageToUI(message)
            }
        }
    }
    
    private fun addMessageToUI(message: Message) {
        // Ajouter le message à votre RecyclerView ou autre
    }
    
    // Rechercher des utilisateurs
    private fun searchUsers(query: String) {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                socketManager.searchUsers(query) { users ->
                    runOnUiThread {
                        println("🔍 ${users.size} utilisateurs trouvés")
                        users.forEach { user ->
                            val status = if (user.isOnline) "🟢" else "⚫"
                            println("  $status ${user.username}")
                        }
                        // Mettre à jour votre liste d'utilisateurs
                    }
                }
            }
        }
    }
    
    // Créer une conversation privée
    private fun startPrivateConversation(recipientUsername: String) {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                socketManager.createPrivateConversation(recipientUsername) { success, conversation, error ->
                    runOnUiThread {
                        if (success && conversation != null) {
                            println("✅ Conversation créée avec $recipientUsername")
                            openConversation(conversation.id)
                        } else {
                            println("❌ Erreur: $error")
                        }
                    }
                }
            }
        }
    }
    
    // Créer un groupe
    private fun createGroup(name: String, members: List<String>) {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                socketManager.createGroupConversation(name, members) { success, conversation, error ->
                    runOnUiThread {
                        if (success && conversation != null) {
                            println("✅ Groupe '$name' créé avec ${conversation.memberCount} membres")
                            openConversation(conversation.id)
                        } else {
                            println("❌ Erreur: $error")
                        }
                    }
                }
            }
        }
    }
    
    // Ouvrir une conversation
    private fun openConversation(conversationId: Int) {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                socketManager.getConversationMessages(conversationId) { messages ->
                    runOnUiThread {
                        println("📨 ${messages.size} messages chargés")
                        // Afficher les messages dans l'UI
                        messages.forEach { msg ->
                            println("  [${msg.sender}] ${msg.content}")
                        }
                    }
                }
            }
        }
    }
    
    // Envoyer un message
    private fun sendMessage(conversationId: Int, content: String) {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                socketManager.sendMessageToConversation(conversationId, content) { success, error ->
                    runOnUiThread {
                        if (success) {
                            println("✅ Message envoyé")
                            // Effacer le champ de saisie
                        } else {
                            println("❌ Erreur: $error")
                        }
                    }
                }
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Nettoyer les listeners
        messageListener?.let {
            socketManager.removeListener("newConversationMessage", it)
        }
        // Déconnexion
        socketManager.disconnect()
    }
}
```

## Architecture recommandée avec ViewModel

### ChatViewModel.kt

```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ChatViewModel : ViewModel() {
    
    private val socketManager = SocketManager.getInstance()
    
    private val _conversations = MutableStateFlow<List<Conversation>>(emptyList())
    val conversations: StateFlow<List<Conversation>> = _conversations
    
    private val _currentMessages = MutableStateFlow<List<Message>>(emptyList())
    val currentMessages: StateFlow<List<Message>> = _currentMessages
    
    private val _users = MutableStateFlow<List<User>>(emptyList())
    val users: StateFlow<List<User>> = _users
    
    init {
        socketManager.connect()
        setupMessageListener()
    }
    
    private fun setupMessageListener() {
        socketManager.onNewConversationMessage { message ->
            // Ajouter le nouveau message
            _currentMessages.value = _currentMessages.value + message
            
            // Rafraîchir les conversations
            loadConversations()
        }
    }
    
    fun join(username: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            socketManager.join(username) { success, error ->
                viewModelScope.launch(Dispatchers.Main) {
                    if (success) {
                        loadConversations()
                    }
                    onResult(success, error)
                }
            }
        }
    }
    
    fun loadConversations() {
        viewModelScope.launch(Dispatchers.IO) {
            socketManager.getConversations { convs ->
                viewModelScope.launch(Dispatchers.Main) {
                    _conversations.value = convs
                }
            }
        }
    }
    
    fun searchUsers(query: String) {
        viewModelScope.launch(Dispatchers.IO) {
            socketManager.searchUsers(query) { users ->
                viewModelScope.launch(Dispatchers.Main) {
                    _users.value = users
                }
            }
        }
    }
    
    fun createPrivateConversation(username: String, onResult: (Boolean, Int?) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            socketManager.createPrivateConversation(username) { success, conv, error ->
                viewModelScope.launch(Dispatchers.Main) {
                    if (success) {
                        loadConversations()
                    }
                    onResult(success, conv?.id)
                }
            }
        }
    }
    
    fun createGroup(name: String, members: List<String>, onResult: (Boolean, Int?) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            socketManager.createGroupConversation(name, members) { success, conv, error ->
                viewModelScope.launch(Dispatchers.Main) {
                    if (success) {
                        loadConversations()
                    }
                    onResult(success, conv?.id)
                }
            }
        }
    }
    
    fun loadMessages(conversationId: Int) {
        viewModelScope.launch(Dispatchers.IO) {
            socketManager.getConversationMessages(conversationId) { messages ->
                viewModelScope.launch(Dispatchers.Main) {
                    _currentMessages.value = messages
                }
            }
        }
    }
    
    fun sendMessage(conversationId: Int, content: String) {
        viewModelScope.launch(Dispatchers.IO) {
            socketManager.sendMessageToConversation(conversationId, content) { success, error ->
                if (!success) {
                    println("❌ Erreur envoi: $error")
                }
            }
        }
    }
    
    override fun onCleared() {
        super.onCleared()
        socketManager.disconnect()
    }
}
```

## Flux d'utilisation typique

### 1. Démarrage de l'application

```kotlin
// Dans MainActivity
val viewModel: ChatViewModel by viewModels()

override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Rejoindre avec le username
    viewModel.join("MonUsername") { success, error ->
        if (success) {
            // Naviguer vers l'écran de chat
            navigateToChatScreen()
        }
    }
}
```

### 2. Recherche d'utilisateurs

```kotlin
// Dans un Fragment ou Composable
searchView.setOnQueryTextListener(object : SearchView.OnQueryTextListener {
    override fun onQueryTextChange(newText: String): Boolean {
        if (newText.length >= 2) {
            viewModel.searchUsers(newText)
        }
        return true
    }
    
    override fun onQueryTextSubmit(query: String) = false
})

// Observer les résultats
lifecycleScope.launch {
    viewModel.users.collect { users ->
        userAdapter.submitList(users)
    }
}
```

### 3. Créer une conversation privée

```kotlin
// Au clic sur un utilisateur
fun onUserClick(user: User) {
    viewModel.createPrivateConversation(user.username) { success, conversationId ->
        if (success && conversationId != null) {
            openConversation(conversationId)
        }
    }
}
```

### 4. Afficher et envoyer des messages

```kotlin
// Charger les messages
viewModel.loadMessages(conversationId)

// Observer les messages
lifecycleScope.launch {
    viewModel.currentMessages.collect { messages ->
        messageAdapter.submitList(messages)
        scrollToBottom()
    }
}

// Envoyer un message
sendButton.setOnClickListener {
    val content = messageEditText.text.toString()
    if (content.isNotBlank()) {
        viewModel.sendMessage(conversationId, content)
        messageEditText.text.clear()
    }
}
```

## Configuration réseau

### Émulateur Android
```kotlin
private const val SERVER_URL = "http://10.0.2.2:3000"
```

### Appareil physique (même réseau local)
```kotlin
private const val SERVER_URL = "http://192.168.1.100:3000"
```
Trouvez votre IP locale :
- Windows: `ipconfig`
- Mac/Linux: `ifconfig` ou `ip addr`

### Production (Render, Heroku, etc.)
```kotlin
private const val SERVER_URL = "https://your-app.onrender.com"
```

## Résumé des événements disponibles

| Événement | Paramètres | Réponse | Description |
|-----------|-----------|---------|-------------|
| `join` | `{ username }` | `{ success, username }` | Se connecter au chat |
| `getAllUsers` | `{}` | `{ success, users[] }` | Liste tous les utilisateurs |
| `searchUsers` | `{ query }` | `{ success, users[] }` | Rechercher des utilisateurs |
| `createPrivateConversation` | `{ recipientUsername }` | `{ success, conversation }` | Créer conversation 1-à-1 |
| `createGroupConversation` | `{ name, memberUsernames[] }` | `{ success, conversation }` | Créer un groupe |
| `getConversations` | `{}` | `{ success, conversations[] }` | Lister ses conversations |
| `getConversationMessages` | `{ conversationId }` | `{ success, messages[] }` | Historique messages |
| `sendMessageToConversation` | `{ conversationId, content }` | `{ success, messageId }` | Envoyer un message |

### Événements reçus en temps réel

| Événement | Données | Description |
|-----------|---------|-------------|
| `newConversationMessage` | `{ id, conversationId, content, sender, sentAt }` | Nouveau message dans une conversation |

## Gestion des erreurs

Toutes les réponses incluent `success: Boolean`. Si `false`, un champ `error` contient le message d'erreur.

```kotlin
socketManager.createPrivateConversation(username) { success, conv, error ->
    if (!success) {
        when (error) {
            "User not authenticated. Please join first." -> showLoginScreen()
            "Recipient not found." -> showError("Utilisateur introuvable")
            else -> showError(error ?: "Erreur inconnue")
        }
    }
}
```

## Bonnes pratiques

1. **Singleton Pattern** : Utilisez `SocketManager.getInstance()` pour partager la connexion
2. **Lifecycle** : Déconnectez-vous dans `onDestroy()` ou `onCleared()`
3. **Coroutines** : Utilisez `viewModelScope` ou `lifecycleScope` pour les opérations async
4. **StateFlow** : Exposez les données via StateFlow pour l'UI réactive
5. **Error Handling** : Vérifiez toujours `success` dans les callbacks
6. **Reconnexion** : Socket.IO se reconnecte automatiquement
7. **Listeners** : Nettoyez les listeners pour éviter les fuites mémoire

## Tests

Testez la connexion avec :

```kotlin
class SocketTest {
    private val socketManager = SocketManager.getInstance()
    
    fun testConnection() {
        socketManager.connect()
        
        Thread.sleep(2000) // Attendre la connexion
        
        socketManager.join("TestUser") { success, error ->
            println("Join: success=$success, error=$error")
            
            socketManager.searchUsers("test") { users ->
                println("Found ${users.size} users")
                users.forEach { println("  - ${it.username}") }
            }
        }
    }
}
```
