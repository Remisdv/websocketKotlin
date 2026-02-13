const { io } = require('socket.io-client');

const socket = io('http://localhost:3000');

console.log('🔌 Connexion au serveur WebSocket...');

socket.on('connect', () => {
  console.log('✅ Connecté au serveur!');
  
  // Rejoindre avec un nom
  socket.emit('join', { username: 'TestBot' }, (response) => {
    console.log('📝 Réponse join:', response);
    
    // Attendre un peu puis envoyer un message
    setTimeout(() => {
      socket.emit('sendMessage', { content: 'Ceci est un message de test!' }, (response) => {
        console.log('📤 Réponse sendMessage:', response);
        
        // Demander la liste des utilisateurs
        socket.emit('getUsers', {}, (response) => {
          console.log('👥 Utilisateurs connectés:', response);
          
          setTimeout(() => {
            console.log('🔌 Déconnexion...');
            socket.disconnect();
            process.exit(0);
          }, 1000);
        });
      });
    }, 500);
  });
});

socket.on('messageHistory', (messages) => {
  console.log('📜 Historique des messages:', messages.length, 'messages');
  messages.forEach(msg => {
    console.log(`   [${msg.sender}] ${msg.content} (${msg.sentAt})`);
  });
});

socket.on('newMessage', (msg) => {
  console.log(`💬 Nouveau message: [${msg.sender}] ${msg.content} (${msg.sentAt})`);
});

socket.on('userJoined', (data) => {
  console.log(`🟢 ${data.username} a rejoint le chat`);
});

socket.on('userLeft', (data) => {
  console.log(`🔴 ${data.username} a quitté le chat`);
});

socket.on('disconnect', () => {
  console.log('❌ Déconnecté du serveur');
});

socket.on('connect_error', (error) => {
  console.error('❌ Erreur de connexion:', error.message);
  process.exit(1);
});
