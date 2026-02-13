# Guide d'Intégration Kotlin/Android  

## 📱 Migration vers l'Authentification JWT

Ce guide vous permet d'ajouter l'authentification JWT à votre application Kotlin/Android pour se connecter au serveur WebSocket sécurisé.

---

## 🔧 Étape 1 : Dépendances Gradle

Ajoutez ces dépendances dans votre `build.gradle.kts` (module app) :

```kotlin
dependencies {
    // WebSocket
    implementation("io.socket:socket.io-client:2.1.0")
    
    // HTTP pour REST API
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.11.0")
    
    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    
    // ViewModel & LiveData
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.6.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
}
```

Sync votre projet après ajout.

---

## 📝 Étape 2 : Modèles de Données

### Créez `models/AuthModels.kt` :

```kotlin
package com.votreapp.models

data class LoginRequest(
    val username: String,
    val password: String
)

data class RegisterRequest(
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

---

## 🔐 Étape 3 : API d'Authentification

### Créez `api/AuthApi.kt` :

```kotlin
package com.votreapp.api

import com.votreapp.models.AuthResponse
import com.votreapp.models.LoginRequest
import com.votreapp.models.RegisterRequest
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

### Créez `services/AuthService.kt` :

```kotlin
package com.votreapp.services

import com.google.gson.GsonBuilder
import com.votreapp.api.AuthApi
import com.votreapp.models.LoginRequest
import com.votreapp.models.RegisterRequest
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class AuthService(baseUrl: String) {
    private val authApi: AuthApi
    
    init {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        
        val client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .build()
        
        val gson = GsonBuilder().setLenient().create()
        
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

---

## 🔌 Étape 4 : WebSocket avec JWT

### Modifiez `services/ChatSocketService.kt` :

**Changement clé** : Ajouter le token JWT lors de la connexion

```kotlin
package com.votreapp.services

import io.socket.client.IO
import io.socket.client.Socket
import android.util.Log

class ChatSocketService(private val serverUrl: String) {
    private var socket: Socket? = null
    
    // ⚠️ Changement important : Connexion avec token
    fun connect(jwtToken: String) {
        try {
            val options = IO.Options().apply {
                // 🔑 Passer le token JWT ici
                auth = mapOf("token" to jwtToken)
                reconnection = true
                reconnectionDelay = 1000
                reconnectionAttempts = 5
            }
            
            socket = IO.socket(serverUrl, options)
            
            socket?.on(Socket.EVENT_CONNECT) {
                Log.d("ChatSocket", "Connected with JWT")
            }
            
            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.e("ChatSocket", "Connection error: ${args[0]}")
            }
            
            // Les événements existants restent les mêmes
            socket?.on("messageHistory") { /* ... */ }
            socket?.on("newMessage") { /* ... */ }
            socket?.on("userJoined") { /* ... */ }
            socket?.on("userLeft") { /* ... */ }
            
            socket?.connect()
        } catch (e: Exception) {
            Log.e("ChatSocket", "Error", e)
        }
    }
    
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
    
    // Plus besoin de l'événement 'join' - authentification automatique via JWT
}
```

---

## 🎯 Étape 5 : ViewModel

### Créez/Modifiez `viewmodels/ChatViewModel.kt` :

```kotlin
package com.votreapp.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.votreapp.services.AuthService
import com.votreapp.services.ChatSocketService
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
    
    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated
    
    // 🆕 Inscription
    fun register(username: String, password: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val response = authService.register(username, password)
                if (response.isSuccessful && response.body() != null) {
                    val authResponse = response.body()!!
                    _authToken.value = authResponse.access_token
                    _username.value = authResponse.user.username
                    _isAuthenticated.value = true
                    
                    // Connecter le WebSocket avec le token
                    chatService.connect(authResponse.access_token)
                    onResult(true, null)
                } else {
                    onResult(false, "Erreur: ${response.code()}")
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }
    
    // 🆕 Connexion
    fun login(username: String, password: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val response = authService.login(username, password)
                if (response.isSuccessful && response.body() != null) {
                    val authResponse = response.body()!!
                    _authToken.value = authResponse.access_token
                    _username.value = authResponse.user.username
                    _isAuthenticated.value = true
                    
                    // Connecter le WebSocket avec le token
                    chatService.connect(authResponse.access_token)
                    onResult(true, null)
                } else {
                    onResult(false, "Erreur: ${response.code()}")
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }
    
    // 🆕 Déconnexion
    fun logout() {
        chatService.disconnect()
        _authToken.value = null
        _username.value = null
        _isAuthenticated.value = false
    }
    
    override fun onCleared() {
        super.onCleared()
        chatService.disconnect()
    }
}
```

---

## 🖼️ Étape 6 : UI (Activity/Composable)

### Exemple avec Activity :

```kotlin
package com.votreapp

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    
    // Configuration de l'URL du serveur
    private val SERVER_URL = "http://10.0.2.2:3000" // Émulateur
    // private val SERVER_URL = "http://192.168.1.X:3000" // Appareil physique
    
    private val authService by lazy { AuthService(SERVER_URL) }
    private val chatService by lazy { ChatSocketService(SERVER_URL) }
    
    private val viewModel: ChatViewModel by viewModels {
        ChatViewModelFactory(authService, chatService)
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Observer l'état d'authentification
        lifecycleScope.launch {
            viewModel.isAuthenticated.collect { isAuth ->
                if (isAuth) {
                    // Naviguer vers l'écran de chat
                    showChatScreen()
                } else {
                    // Afficher l'écran de connexion
                    showLoginScreen()
                }
            }
        }
    }
    
    private fun handleLogin(username: String, password: String) {
        viewModel.login(username, password) { success, error ->
            if (success) {
                Toast.makeText(this, "Connexion réussie!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, error ?: "Erreur", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun handleRegister(username: String, password: String) {
        viewModel.register(username, password) { success, error ->
            if (success) {
                Toast.makeText(this, "Inscription réussie!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, error ?: "Erreur", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        viewModel.logout()
    }
}
```

---

## ⚙️ Étape 7 : Permissions (AndroidManifest.xml)

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

---

## 🔄 Changements principaux par rapport à l'ancienne version

| Avant (sans JWT) | Après (avec JWT) |
|-----------------|------------------|
| `socket.emit('join', { username })` | Authentification automatique via token |
| Connexion immédiate au WebSocket | 1. Login/Register → 2. Obtenir token → 3. Connecter WebSocket |
| Pas de sécurité | Mot de passe hashé + JWT sécurisé |
| Pas de vérification utilisateur | Authentification requise |

---

## 🧪 Tester l'Intégration

### 1. Inscription d'un nouvel utilisateur :

```kotlin
viewModel.register("alice", "motdepasse123") { success, error ->
    if (success) {
        println("Inscrit et connecté!")
    }
}
```

### 2. Connexion utilisateur existant :

```kotlin
viewModel.login("alice", "motdepasse123") { success, error ->
    if (success) {
        println("Connecté!")
    }
}
```

### 3. Le WebSocket se connecte automatiquement après login réussi

---

## 🌐 URLs selon l'environnement

```kotlin
// Développement local
const val SERVER_URL_EMULATOR = "http://10.0.2.2:3000"
const val SERVER_URL_PHYSICAL = "http://192.168.1.100:3000" // IP de votre PC

// Production
const val SERVER_URL_PROD = "https://votre-serveur.com"
```

---

## ❗ Points Importants

1. **Le token JWT expire après 7 jours** - gérez le renouvellement si nécessaire
2. **Stockez le token de manière sécurisée** - utilisez `EncryptedSharedPreferences` pour le stockage persistant
3. **En production, utilisez HTTPS/WSS** - pas de HTTP en clair
4. **Testez la gestion des erreurs** - token invalide, expiré, connexion perdue

---

## 🔒 Stockage Sécurisé du Token (Optionnel)

Pour sauvegarder le token entre les sessions :

```kotlin
// Dépendance
implementation("androidx.security:security-crypto:1.1.0-alpha06")

// Utilisation
class TokenManager(context: Context) {
    private val sharedPrefs = EncryptedSharedPreferences.create(
        "auth_prefs",
        MasterKey.DEFAULT_MASTER_KEY_ALIAS,
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    fun saveToken(token: String) {
        sharedPrefs.edit().putString("jwt_token", token).apply()
    }
    
    fun getToken(): String? {
        return sharedPrefs.getString("jwt_token", null)
    }
    
    fun clearToken() {
        sharedPrefs.edit().remove("jwt_token").apply()
    }
}
```

---

## 📚 Documentation Complète

Pour plus de détails techniques, consultez [KOTLIN_INTEGRATION.md](KOTLIN_INTEGRATION.md).

---

## ✅ Checklist de Migration

- [ ] Ajouter les dépendances Gradle
- [ ] Créer les modèles AuthModels.kt
- [ ] Créer AuthApi.kt et AuthService.kt
- [ ] Modifier ChatSocketService pour accepter le token JWT
- [ ] Mettre à jour le ViewModel avec login/register
- [ ] Créer l'écran de connexion/inscription
- [ ] Ajouter les permissions dans AndroidManifest.xml
- [ ] Tester l'inscription
- [ ] Tester la connexion
- [ ] Tester l'envoi de messages

---

**Besoin d'aide ?** Consultez les logs avec `adb logcat | grep ChatSocket`
