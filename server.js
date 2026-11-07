const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Health check (usado pela nuvem e pelo app desktop para saber se o servidor acordou)
app.get('/health', (req, res) => res.json({ ok: true }));

// Servidores ICE (STUN/TURN). Credenciais TURN vêm de variáveis de ambiente
// para não ficarem expostas no código. Configure na nuvem:
//   TURN_URLS="turn:a.relay.metered.ca:80,turn:a.relay.metered.ca:443?transport=tcp"
//   TURN_USERNAME="..."   TURN_CREDENTIAL="..."
app.get('/ice', (req, res) => {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }
  ];

  if (process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URLS.split(',').map(u => u.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  } else {
    // Fallback público (sem garantia de funcionamento)
    iceServers.push({
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    });
  }

  res.json({ iceServers });
});

// Gerenciamento de conexões e salas
io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;

  socket.on('join-room', ({ roomId, userName }) => {
    currentRoom = roomId;
    currentUser = userName || 'Convidado';
    socket.data.userName = currentUser;
    socket.data.roomId = roomId;
    socket.join(roomId);

    console.log(`[+] ${currentUser} (${socket.id}) entrou na sala: ${roomId}`);

    // Notifica os outros usuários na sala
    socket.to(roomId).emit('user-connected', {
      socketId: socket.id,
      userName: currentUser
    });

    // Pega a lista de outros participantes na sala com seus nomes
    const otherUsers = Array.from(io.sockets.adapter.rooms.get(roomId) || [])
      .filter(id => id !== socket.id)
      .map(id => {
        const s = io.sockets.sockets.get(id);
        return {
          socketId: id,
          userName: (s && s.data && s.data.userName) ? s.data.userName : 'Seu amor'
        };
      });

    socket.emit('room-users', otherUsers);
  });

  // Sinalização WebRTC (offers, answers, ICE candidates)
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', {
      from: socket.id,
      userName: currentUser,
      data
    });
  });

  // Reações de emojis flutuantes (coração, pipoca, risadas, etc)
  socket.on('send-reaction', ({ roomId, emoji }) => {
    io.to(roomId).emit('new-reaction', {
      sender: currentUser,
      emoji
    });
  });

  // Mensagens do chat de texto
  socket.on('send-chat', ({ roomId, message }) => {
    io.to(roomId).emit('new-chat', {
      sender: currentUser,
      message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Status de compartilhamento de tela
  socket.on('share-state-change', ({ roomId, isSharing }) => {
    socket.to(roomId).emit('peer-share-state', {
      sender: currentUser,
      isSharing
    });
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      console.log(`[-] ${currentUser} (${socket.id}) saiu da sala: ${currentRoom}`);
      socket.to(currentRoom).emit('user-disconnected', {
        socketId: socket.id,
        userName: currentUser
      });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 CineShare rodando com sucesso!`);
  console.log(`> Porta: ${PORT}`);
});
