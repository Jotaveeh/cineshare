// =======================================================
// CineShare - Cliente WebRTC & Interações (v2.0 Estável)
// =======================================================

const socket = io();

// Estado da Aplicação
const state = {
  roomId: null,
  userName: null,
  partnerName: 'Seu par',
  isSharingScreen: false,
  isMicMuted: false,
  peerSocketId: null,
  peerConnection: null,
  candidateQueue: [],
  localMicStream: null,
  localScreenStream: null,
  audioContext: null,
  voiceGainNode: null,
  unreadMessages: 0
};

// Servidores STUN e TURN. Valor padrão; é substituído pela config do servidor (/ice)
let rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// Elementos DOM
const lobbyView = document.getElementById('lobby-view');
const roomView = document.getElementById('room-view');
const joinForm = document.getElementById('join-form');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const btnRandomRoom = document.getElementById('btn-random-room');
const roomNameDisplay = document.getElementById('room-name-display');
const partnerStatus = document.getElementById('partner-status');
const partnerName = document.getElementById('partner-name');
const btnCopyLink = document.getElementById('btn-copy-link');
const btnTips = document.getElementById('btn-tips');
const modalTips = document.getElementById('modal-tips');
const btnCloseTips = document.getElementById('btn-close-tips');
const btnLeaveRoom = document.getElementById('btn-leave-room');
const theaterStage = document.getElementById('theater-stage');
const screenVideo = document.getElementById('screen-video');
const screenAudio = document.getElementById('screen-audio');
const remoteVoiceAudio = document.getElementById('remote-voice-audio');
const btnUnmuteOverlay = document.getElementById('btn-unmute-overlay');
const videoPlaceholder = document.getElementById('video-placeholder');
const sharingBanner = document.getElementById('sharing-banner');
const sharingText = document.getElementById('sharing-text');
const btnShareScreen = document.getElementById('btn-share-screen');
const shareLabel = document.getElementById('share-label');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const micIcon = document.getElementById('mic-icon');
const micLabel = document.getElementById('mic-label');
const btnToggleChat = document.getElementById('btn-toggle-chat');
const chatSidebar = document.getElementById('chat-sidebar');
const btnCloseChat = document.getElementById('btn-close-chat');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatBadge = document.getElementById('chat-badge');
const btnFullscreen = document.getElementById('btn-fullscreen');
const reactionsContainer = document.getElementById('reactions-container');
const reactionButtons = document.querySelectorAll('.reaction-btn');
const volumeMovie = document.getElementById('volume-movie');
const volMovieVal = document.getElementById('vol-movie-val');
const volumeVoice = document.getElementById('volume-voice');
const volVoiceVal = document.getElementById('vol-voice-val');
const toastEl = document.getElementById('toast');

// =======================================================
// INICIALIZAÇÃO & URL
// =======================================================

// Buscar servidores ICE/TURN configurados no servidor
fetch('/ice')
  .then(r => r.json())
  .then(cfg => {
    if (cfg && Array.isArray(cfg.iceServers)) {
      rtcConfig = { iceServers: cfg.iceServers };
    }
  })
  .catch(() => console.warn('Usando servidores ICE padrão'));

// Se a conexão com o servidor cair e voltar, reentrar na sala automaticamente
socket.on('connect', () => {
  if (state.roomId && state.userName) {
    socket.emit('join-room', { roomId: state.roomId, userName: state.userName });
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room');
  if (roomFromUrl) {
    roomInput.value = roomFromUrl.trim();
  }

  const savedName = localStorage.getItem('cineshare_username');
  if (savedName) {
    usernameInput.value = savedName;
  }
});

btnRandomRoom.addEventListener('click', () => {
  const adjectives = ['pipoca', 'cinema', 'sessao', 'filminho', 'amor', 'noite', 'maratona'];
  const numbers = Math.floor(100 + Math.random() * 900);
  const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
  roomInput.value = `${randomAdj}-${numbers}`;
});

let toastTimer = null;
function showToast(message, duration = 3500) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, duration);
}

function setPartnerConnected(name) {
  state.partnerName = name || 'Seu par';
  partnerName.textContent = `${state.partnerName} ❤️`;
  partnerStatus.style.background = 'rgba(16, 185, 129, 0.2)';
  partnerStatus.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  partnerStatus.style.color = '#6ee7b7';
  const icon = partnerStatus.querySelector('.partner-icon');
  if (icon) icon.textContent = '🟢';
}

function setPartnerDisconnected() {
  partnerName.textContent = 'Aguardando seu par entrar...';
  partnerStatus.style.background = 'rgba(139, 92, 246, 0.15)';
  partnerStatus.style.borderColor = 'rgba(139, 92, 246, 0.3)';
  partnerStatus.style.color = '#c4b5fd';
  const icon = partnerStatus.querySelector('.partner-icon');
  if (icon) icon.textContent = '⏳';
}

// =======================================================
// ENTRAR NA SALA
// =======================================================
joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userName = usernameInput.value.trim();
  const roomId = roomInput.value.trim().toLowerCase();

  if (!userName || !roomId) return;

  state.userName = userName;
  state.roomId = roomId;
  localStorage.setItem('cineshare_username', userName);

  // Microfone local
  try {
    state.localMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
  } catch (err) {
    console.warn('Microfone não ativado:', err);
  }

  lobbyView.classList.remove('view-active');
  roomView.classList.add('view-active');
  roomNameDisplay.textContent = `Sala: ${roomId}`;

  const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  window.history.pushState({ path: newUrl }, '', newUrl);

  socket.emit('join-room', { roomId, userName });
});

btnLeaveRoom.addEventListener('click', () => {
  if (confirm('Deseja realmente sair da sessão de cinema?')) {
    window.location.href = window.location.pathname;
  }
});

btnCopyLink.addEventListener('click', () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${state.roomId}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('Link do cinema copiado! Envie para o seu par ❤️');
  }).catch(() => {
    prompt('Copie o link abaixo para enviar:', shareUrl);
  });
});

// =======================================================
// CRIAÇÃO E CONTROLE WEBRTC
// =======================================================

function createPeerConnection(targetSocketId) {
  if (state.peerConnection) {
    try {
      state.peerConnection.close();
    } catch (e) {}
    state.peerConnection = null;
  }

  state.candidateQueue = [];
  const pc = new RTCPeerConnection(rtcConfig);
  state.peerConnection = pc;

  pc.onicecandidate = (event) => {
    if (event.candidate && targetSocketId) {
      socket.emit('signal', {
        to: targetSocketId,
        data: { candidate: event.candidate }
      });
    }
  };

  pc.ontrack = (event) => {
    console.log('[WebRTC ontrack] Recebida faixa:', event.track.kind);
    const track = event.track;
    const stream = event.streams[0] || new MediaStream([track]);

    if (track.kind === 'video') {
      console.log('Vídeo da tela recebido!');
      screenVideo.srcObject = stream;
      screenVideo.muted = false;
      screenVideo.volume = parseFloat(volumeMovie.value);
      videoPlaceholder.classList.add('hidden');
      sharingBanner.classList.remove('hidden');
      sharingText.textContent = `${state.partnerName} está transmitindo`;

      screenVideo.play().catch(err => {
        console.warn('Autoplay bloqueado pelo navegador:', err);
        btnUnmuteOverlay.classList.remove('hidden');
      });

      track.onended = () => {
        stopRemoteScreen();
      };
    } else if (track.kind === 'audio') {
      // Se a faixa pertencer a uma transmissão de tela
      if (stream.getVideoTracks().length > 0) {
        console.log('Áudio do filme recebido!');
        screenAudio.srcObject = stream;
        screenAudio.muted = false;
        screenAudio.volume = parseFloat(volumeMovie.value);
        screenAudio.play().catch(err => {
          btnUnmuteOverlay.classList.remove('hidden');
        });
      } else {
        // Áudio de voz (microfone)
        console.log('Áudio de voz recebido!');
        setupRemoteVoiceAudio(stream);
      }
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[WebRTC state]:', pc.connectionState);
    if (pc.connectionState === 'connected') {
      showToast('Conectados com sucesso! 🎬');
    }
  };

  return pc;
}

// Iniciar WebRTC como Chamador (Caller)
async function sendOffer(targetSocketId) {
  state.peerSocketId = targetSocketId;
  const pc = createPeerConnection(targetSocketId);

  // Adicionar microfone
  if (state.localMicStream) {
    state.localMicStream.getTracks().forEach(track => {
      pc.addTrack(track, state.localMicStream);
    });
  }

  // Adicionar tela se já estiver compartilhando
  if (state.localScreenStream) {
    state.localScreenStream.getTracks().forEach(track => {
      pc.addTrack(track, state.localScreenStream);
    });
  }

  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await pc.setLocalDescription(offer);
    socket.emit('signal', { to: targetSocketId, data: offer });
  } catch (err) {
    console.error('Erro ao criar oferta WebRTC:', err);
  }
}

// =======================================================
// FLUXO DE EVENTOS SOCKET.IO
// =======================================================

// Quando entramos na sala e já há alguém lá:
// Marcamos o par como conectado e esperamos a oferta do anfitrião
socket.on('room-users', (users) => {
  if (users.length > 0) {
    const partner = users[0];
    state.peerSocketId = partner.socketId;
    setPartnerConnected(partner.userName);
    showToast(`${partner.userName} está na sala! Conectando...`);
    // O anfitrião (usuário já existente) nos enviará a oferta automaticamente
  }
});

// Quando um novo usuário entra na nossa sala:
// Como anfitriões, nós enviamos a oferta (Caller) com nossas faixas!
socket.on('user-connected', ({ socketId, userName }) => {
  state.peerSocketId = socketId;
  setPartnerConnected(userName);
  showToast(`${userName} entrou no cinema! 🍿`);

  // Enviamos a oferta com microfone e tela (se estiver compartilhando)
  sendOffer(socketId);
});

socket.on('user-disconnected', ({ userName }) => {
  setPartnerDisconnected();
  showToast(`${userName || 'Seu par'} saiu da sala.`);
  if (state.peerConnection) {
    try {
      state.peerConnection.close();
    } catch (e) {}
    state.peerConnection = null;
  }
  stopRemoteScreen();
});

// Recepção de sinais
socket.on('signal', async ({ from, data }) => {
  state.peerSocketId = from;

  try {
    if (data.type === 'offer') {
      const pc = createPeerConnection(from);

      // Adicionar nossas faixas locais antes de responder
      if (state.localMicStream) {
        state.localMicStream.getTracks().forEach(track => {
          pc.addTrack(track, state.localMicStream);
        });
      }
      if (state.localScreenStream) {
        state.localScreenStream.getTracks().forEach(track => {
          pc.addTrack(track, state.localScreenStream);
        });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data));

      while (state.candidateQueue.length > 0) {
        const cand = state.candidateQueue.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, data: answer });

    } else if (data.type === 'answer') {
      if (state.peerConnection) {
        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        while (state.candidateQueue.length > 0) {
          const cand = state.candidateQueue.shift();
          await state.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        }
      }
    } else if (data.candidate) {
      if (state.peerConnection && state.peerConnection.remoteDescription && state.peerConnection.remoteDescription.type) {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        state.candidateQueue.push(data.candidate);
      }
    }
  } catch (err) {
    console.error('Erro ao processar sinal WebRTC:', err);
  }
});

function stopRemoteScreen() {
  screenVideo.srcObject = null;
  screenAudio.srcObject = null;
  videoPlaceholder.classList.remove('hidden');
  sharingBanner.classList.add('hidden');
  btnUnmuteOverlay.classList.add('hidden');
}

function setupRemoteVoiceAudio(stream) {
  remoteVoiceAudio.srcObject = stream;
  try {
    if (!state.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioCtx();
    }
    if (state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    const source = state.audioContext.createMediaStreamSource(stream);
    state.voiceGainNode = state.audioContext.createGain();
    state.voiceGainNode.gain.value = parseFloat(volumeVoice.value);
    source.connect(state.voiceGainNode);
    state.voiceGainNode.connect(state.audioContext.destination);
  } catch (e) {
    console.log('Web Audio Gain fallback:', e);
  }
}

// =======================================================
// COMPARTILHAR TELA
// =======================================================

btnShareScreen.addEventListener('click', async () => {
  if (state.isSharingScreen) {
    stopLocalScreenShare();
  } else {
    startLocalScreenShare();
  }
});

async function startLocalScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        frameRate: { ideal: 60, max: 60 }
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // Tenta excluir o áudio do próprio CineShare (voz do parceiro) da captura,
        // evitando que ele ouça o próprio eco. Ignorado se não suportado.
        restrictOwnAudio: true,
        suppressLocalAudioPlayback: false
      },
      systemAudio: 'include'
    });

    state.localScreenStream = stream;
    state.isSharingScreen = true;

    // Verificar se capturou áudio
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      alert("⚠️ AVISO DE ÁUDIO:\n\nNenhum áudio foi capturado da tela!\nPara que ela escute o filme:\n1. Clique em 'Parar Transmissão'.\n2. Clique em 'Compartilhar Tela' novamente.\n3. NÃO escolha 'Janela'.\n4. Escolha 'Aba do Navegador' ou 'Tela Inteira'.\n5. Marque a caixinha 'Compartilhar áudio' no canto inferior!");
    } else {
      showToast('🔊 Som do filme capturado com sucesso!');
    }

    btnShareScreen.classList.add('sharing-active');
    shareLabel.textContent = 'Parar Transmissão';
    videoPlaceholder.classList.add('hidden');
    sharingBanner.classList.remove('hidden');
    sharingText.textContent = 'Você está transmitindo';

    // Preview local mudo para você não ouvir eco
    screenVideo.srcObject = stream;
    screenVideo.muted = true;

    // Se o parceiro já estiver na sala, enviamos uma nova oferta com a tela
    if (state.peerSocketId) {
      sendOffer(state.peerSocketId);
    }

    socket.emit('share-state-change', { roomId: state.roomId, isSharing: true });

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        stopLocalScreenShare();
      };
    }

  } catch (err) {
    console.error('Erro ao compartilhar tela:', err);
    if (err.name !== 'NotAllowedError') {
      alert('Não foi possível iniciar o compartilhamento de tela: ' + err.message);
    }
  }
}

function stopLocalScreenShare() {
  if (state.localScreenStream) {
    state.localScreenStream.getTracks().forEach(track => track.stop());
    state.localScreenStream = null;
  }

  state.isSharingScreen = false;
  btnShareScreen.classList.remove('sharing-active');
  shareLabel.textContent = 'Compartilhar Tela';
  screenVideo.srcObject = null;
  screenVideo.muted = false;
  videoPlaceholder.classList.remove('hidden');
  sharingBanner.classList.add('hidden');

  // Reenviar oferta sem a tela
  if (state.peerSocketId) {
    sendOffer(state.peerSocketId);
  }

  socket.emit('share-state-change', { roomId: state.roomId, isSharing: false });
  showToast('Transmissão finalizada.');
}

// =======================================================
// MICROFONE
// =======================================================

btnToggleMic.addEventListener('click', () => {
  if (!state.localMicStream) return;

  state.isMicMuted = !state.isMicMuted;
  state.localMicStream.getAudioTracks().forEach(track => {
    track.enabled = !state.isMicMuted;
  });

  if (state.isMicMuted) {
    btnToggleMic.classList.add('muted');
    micIcon.textContent = '🔇';
    micLabel.textContent = 'Mutado';
    showToast('Microfone mutado');
  } else {
    btnToggleMic.classList.remove('muted');
    micIcon.textContent = '🎙️';
    micLabel.textContent = 'Voz Ativa';
    showToast('Microfone ativado');
  }
});

// =======================================================
// VOLUMES
// =======================================================

volumeMovie.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (!state.isSharingScreen) {
    screenVideo.volume = val;
    if (screenAudio) {
      screenAudio.volume = val;
    }
  }
  volMovieVal.textContent = `${Math.round(val * 100)}%`;
});

volumeVoice.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (state.voiceGainNode) {
    state.voiceGainNode.gain.value = val;
  } else {
    remoteVoiceAudio.volume = Math.min(val, 1);
  }
  volVoiceVal.textContent = `${Math.round(val * 100)}%`;
});

if (btnUnmuteOverlay) {
  btnUnmuteOverlay.addEventListener('click', () => {
    screenVideo.muted = false;
    screenAudio.muted = false;
    screenVideo.play();
    screenAudio.play();
    remoteVoiceAudio.play();
    if (state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    btnUnmuteOverlay.classList.add('hidden');
    showToast('🔊 Áudio ativado!');
  });
}

// =======================================================
// REAÇÕES
// =======================================================

reactionButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.getAttribute('data-emoji');
    socket.emit('send-reaction', { roomId: state.roomId, emoji });
  });
});

socket.on('new-reaction', ({ emoji }) => {
  spawnFloatingEmoji(emoji);
});

function spawnFloatingEmoji(emoji) {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;

  const leftPercent = 15 + Math.random() * 70;
  el.style.left = `${leftPercent}%`;

  reactionsContainer.appendChild(el);

  el.addEventListener('animationend', () => {
    el.remove();
  });
}

// =======================================================
// CHAT
// =======================================================

btnToggleChat.addEventListener('click', () => {
  chatSidebar.classList.toggle('hidden');
  if (!chatSidebar.classList.contains('hidden')) {
    state.unreadMessages = 0;
    chatBadge.classList.add('hidden');
    chatInput.focus();
  }
});

btnCloseChat.addEventListener('click', () => {
  chatSidebar.classList.add('hidden');
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  socket.emit('send-chat', { roomId: state.roomId, message: text });
  chatInput.value = '';
});

socket.on('new-chat', ({ sender, message, time }) => {
  const isMine = sender === state.userName;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isMine ? 'mine' : 'theirs'}`;

  bubble.innerHTML = `
    <div class="bubble-sender">${escapeHtml(sender)}</div>
    <div class="bubble-text">${escapeHtml(message)}</div>
    <div class="bubble-time">${time}</div>
  `;

  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (chatSidebar.classList.contains('hidden') && !isMine) {
    state.unreadMessages++;
    chatBadge.classList.remove('hidden');
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =======================================================
// FULLSCREEN & DICAS
// =======================================================

btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    theaterStage.requestFullscreen().catch(err => {
      console.error('Erro tela cheia:', err);
    });
  } else {
    document.exitFullscreen();
  }
});

btnTips.addEventListener('click', () => {
  modalTips.classList.remove('hidden');
});

btnCloseTips.addEventListener('click', () => {
  modalTips.classList.add('hidden');
});

modalTips.addEventListener('click', (e) => {
  if (e.target === modalTips) {
    modalTips.classList.add('hidden');
  }
});
