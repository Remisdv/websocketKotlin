# Intégration Kotlin/Android avec WebSocket NestJS

## Configuration Gradle

Ajoutez ces dépendances dans votre `build.gradle.kts` :

```kotlin
dependencies {
    // WebSocket
    implementation("io.socket:socket.io-client:2.1.0")
    
    // HTTP pour l'authentification
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.11.0")
    
    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    
    // Lifecycle
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.6.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
}
```

## Modèles de données

### AuthModels.kt
```kotlin
package com.example.chat.models

data class RegisterRequest(
    val username: String,
    val password: String
)

data class LoginRequest(
    val username: String,
    val password: String
)

data class AuthResponse(
    val access_token: String,
    val user: UserInfo
)

data class UserInfo(
    val id: Int,
    val username: String
)
```

### MessageModels.kt
```kotlin
package com.example.chat.models

data class Message(
    val id: Int? = null,
    val content: String,
    val sender: String,
    val sentAt: String
)

data class SendMessagePayload(
    val content: String
)

data class ConversationMessage(
    val id: Int? = null,
    val conversationId: Int,
    val content: String,
    val sender: String,
    val sentAt: String
)

data class Conversation(
    val id: Int,
    val type: String,
    val name: String,
    val createdAt: String,
    val memberCount: Int? = null,
    val lastMessage: LastMessage? = null
)

data class LastMessage(
    val content: String,
    val sender: String,
    val sentAt: String
)
```

## Service d'authentification

### AuthApi.kt
```kotlin
package com.example.chat.api

import com.example.chat.models.AuthResponse
import com.example.chat.models.LoginRequest
import com.example.chat.models.RegisterRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface AuthApi {
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<AuthResponse>
    
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>
}
```

### AuthService.kt
```kotlin
package com.example.chat.services

import com.example.chat.api.AuthApi
import com.example.chat.models.LoginRequest
import com.example.chat.models.RegisterRequest
import com.google.gson.GsonBuilder
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class AuthService(private val baseUrl: String) {
    private val authApi: AuthApi
    
    init {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        
        val client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .build()
        
        val gson = GsonBuilder()
            .setLenient()
            .create()
        
        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
        
        authApi = retrofit.create(AuthApi::class.java)
    }
    
    suspend fun register(username: String, password: String) =
        authApi.register(RegisterRequest(username, password))
    
    suspend fun login(username: String, password: String) =
        authApi.login(LoginRequest(username, password))
}
```

## Service WebSocket

### ChatSocketService.kt
```kotlin
package com.example.chat.services

import android.util.Log
import com.example.chat.models.Message
import com.example.chat.models.SendMessagePayload
import com.google.gson.Gson
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.net.URISyntaxException

class ChatSocketService(private val serverUrl: String) {
    private var socket: Socket? = null
    private val gson = Gson()
    
    private val _connectionState = MutableStateFlow(false)
    val connectionState: StateFlow<Boolean> = _connectionState.asStateFlow()
    
    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()
    
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    
    fun connect(token: String) {
        try {
            val options = IO.Options().apply {
                auth = mapOf("token" to token)
                reconnection = true
                reconnectionDelay = 1000
                reconnectionAttempts = 5
            }
            
            socket = IO.socket(serverUrl, options)
            
            socket?.on(Socket.EVENT_CONNECT) {
                Log.d("ChatSocket", "Connected")
                _connectionState.value = true
            }
            
            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d("ChatSocket", "Disconnected")
                _connectionState.value = false
            }
            
            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.e("ChatSocket", "Connection error: ${args[0]}")
                _error.value = "Erreur de connexion: ${args[0]}"
            }
            
            socket?.on("messageHistory") { args ->
                try {
                    val messagesJson = args[0].toString()
                    val messagesList = gson.fromJson(messagesJson, Array<Message>::class.java).toList()
                    _messages.value = messagesList
                    Log.d("ChatSocket", "Received ${messagesList.size} messages from history")
                } catch (e: Exception) {
                    Log.e("ChatSocket", "Error parsing message history", e)
                }
            }
            
            socket?.on("newMessage") { args ->
                try {
                    val messageJson = args[0].toString()
                    val message = gson.fromJson(messageJson, Message::class.java)
                    _messages.value = _messages.value + message
                    Log.d("ChatSocket", "New message: ${message.content}")
                } catch (e: Exception) {
                    Log.e("ChatSocket", "Error parsing new message", e)
                }
            }
            
            socket?.on("userJoined") { args ->
                try {
                    val data = args[0] as JSONObject
                    val username = data.getString("username")
                    Log.d("ChatSocket", "User joined: $username")
                } catch (e: Exception) {
                    Log.e("ChatSocket", "Error parsing userJoined", e)
                }
            }
            
            socket?.on("userLeft") { args ->
                try {
                    val data = args[0] as JSONObject
                    val username = data.getString("username")
                    Log.d("ChatSocket", "User left: $username")
                } catch (e: Exception) {
                    Log.e("ChatSocket", "Error parsing userLeft", e)
                }
            }
            
            socket?.connect()
        } catch (e: URISyntaxException) {
            Log.e("ChatSocket", "Invalid URI", e)
            _error.value = "URL invalide"
        }
    }
    
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
    
    fun sendMessage(content: String, callback: ((Boolean, String?) -> Unit)? = null) {
        val payload = JSONObject().apply {
            put("content", content)
        }
        
        socket?.emit("sendMessage", payload) { args ->
            try {
                val response = args[0] as JSONObject
                val success = response.getBoolean("success")
                val error = if (response.has("error")) response.getString("error") else null
                callback?.invoke(success, error)
            } catch (e: Exception) {
                Log.e("ChatSocket", "Error in sendMessage callback", e)
                callback?.invoke(false, e.message)
            }
        }
    }
    
    fun createPrivateConversation(recipientUsername: String, callback: ((Boolean, JSONObject?) -> Unit)? = null) {
        val payload = JSONObject().apply {
            put("recipientUsername", recipientUsername)
        }
        
        socket?.emit("createPrivateConversation", payload) { args ->
            try {
                val response = args[0] as JSONObject
                val success = response.getBoolean("success")
                callback?.invoke(success, response)
            } catch (e: Exception) {
                Log.e("ChatSocket", "Error in createPrivateConversation", e)
                callback?.invoke(false, null)
            }
        }
    }
    
    fun sendMessageToConversation(conversationId: Int, content: String, callback: ((Boolean, String?) -> Unit)? = null) {
        val payload = JSONObject().apply {
            put("conversationId", conversationId)
            put("content", content)
        }
        
        socket?.emit("sendMessageToConversation", payload) { args ->
            try {
                val response = args[0] as JSONObject
                val success = response.getBoolean("success")
                val error = if (response.has("error")) response.getString("error") else null
                callback?.invoke(success, error)
            } catch (e: Exception) {
                Log.e("ChatSocket", "Error in sendMessageToConversation", e)
                callback?.invoke(false, e.message)
            }
        }
    }
}
```

## ViewModel

### ChatViewModel.kt
```kotlin
package com.example.chat.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.chat.services.AuthService
import com.example.chat.services.ChatSocketService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class ChatViewModel(
    private val authService: AuthService,
    private val chatService: ChatSocketService
) : ViewModel() {
    
    private val _authToken = MutableStateFlow<String?>(null)
    val authToken: StateFlow<String?> = _authToken
    
    private val _username = MutableStateFlow<String?>(null)
    val username: StateFlow<String?> = _username
    
    val messages = chatService.messages
    val isConnected = chatService.connectionState
    
    fun register(username: String, password: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val response = authService.register(username, password)
                if (response.isSuccessful && response.body() != null) {
                    val authResponse = response.body()!!
                    _authToken.value = authResponse.access_token
                    _username.value = authResponse.user.username
                    chatService.connect(authResponse.access_token)
                    onResult(true, null)
                } else {
                    onResult(false, "Erreur d'inscription: ${response.code()}")
                }
            } catch (e: Exception) {
                onResult(false, "Erreur: ${e.message}")
            }
        }
    }
    
    fun login(username: String, password: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val response = authService.login(username, password)
                if (response.isSuccessful && response.body() != null) {
                    val authResponse = response.body()!!
                    _authToken.value = authResponse.access_token
                    _username.value = authResponse.user.username
                    chatService.connect(authResponse.access_token)
                    onResult(true, null)
                } else {
                    onResult(false, "Erreur de connexion: ${response.code()}")
                }
            } catch (e: Exception) {
                onResult(false, "Erreur: ${e.message}")
            }
        }
    }
    
    fun sendMessage(content: String) {
        chatService.sendMessage(content) { success, error ->
            if (!success) {
                // Gérer l'erreur
            }
        }
    }
    
    fun disconnect() {
        chatService.disconnect()
        _authToken.value = null
        _username.value = null
    }
    
    override fun onCleared() {
        super.onCleared()
        chatService.disconnect()
    }
}
```

## Exemple d'utilisation dans une Activity

### MainActivity.kt
```kotlin
package com.example.chat

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import com.example.chat.services.AuthService
import com.example.chat.services.ChatSocketService
import com.example.chat.viewmodels.ChatViewModel
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    
    // Remplacez par l'URL de votre serveur
    private val SERVER_URL = "http://10.0.2.2:3000" // Pour émulateur Android
    // private val SERVER_URL = "http://192.168.1.X:3000" // Pour appareil physique
    
    private val authService by lazy { AuthService(SERVER_URL) }
    private val chatService by lazy { ChatSocketService(SERVER_URL) }
    
    private val viewModel: ChatViewModel by viewModels {
        ChatViewModelFactory(authService, chatService)
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Observer la connexion
        lifecycleScope.launch {
            viewModel.isConnected.collect { isConnected ->
                if (isConnected) {
                    Toast.makeText(this@MainActivity, "Connecté au serveur", Toast.LENGTH_SHORT).show()
                }
            }
        }
        
        // Observer les messages
        lifecycleScope.launch {
            viewModel.messages.collect { messages ->
                // Mettre à jour l'UI avec les messages
            }
        }
        
        // Exemple: S'inscrire
        viewModel.register("testuser", "password123") { success, error ->
            if (success) {
                Toast.makeText(this, "Inscription réussie!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, error ?: "Erreur d'inscription", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        viewModel.disconnect()
    }
}

// Factory pour créer le ViewModel
class ChatViewModelFactory(
    private val authService: AuthService,
    private val chatService: ChatSocketService
) : androidx.lifecycle.ViewModelProvider.Factory {
    override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ChatViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return ChatViewModel(authService, chatService) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
```

## Permissions AndroidManifest.xml

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <application
        android:usesCleartextTraffic="true"
        ...>
        ...
    </application>
</manifest>
```

## Configuration réseau (network_security_config.xml)

Créez `res/xml/network_security_config.xml` :

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

Et ajoutez dans AndroidManifest.xml :

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

## Flux d'authentification

1. **Inscription/Connexion** : L'utilisateur s'inscrit ou se connecte via les endpoints REST `/auth/register` ou `/auth/login`
2. **Récupération du JWT** : Le serveur retourne un token JWT
3. **Connexion WebSocket** : Le client se connecte au WebSocket en passant le token dans l'authentification
4. **Communication sécurisée** : Tous les messages WebSocket sont automatiquement authentifiés via le JWT

## Sécurité

- Les mots de passe sont hashés avec bcrypt (10 rounds de salting)
- Les tokens JWT expirent après 7 jours
- La connexion WebSocket est refusée sans token valide
- Changez `JWT_SECRET` en production via une variable d'environnement

## Notes importantes

- Pour tester avec l'émulateur Android : utilisez `http://10.0.2.2:3000`
- Pour tester avec un appareil physique : utilisez l'IP locale de votre machine (ex: `http://192.168.1.X:3000`)
- Assurez-vous que le serveur NestJS est accessible depuis le réseau (pas seulement localhost)
- En production, utilisez HTTPS/WSS au lieu de HTTP/WS
