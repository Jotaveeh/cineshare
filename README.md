# 🍿 CineShare - Cinema Privado a Dois

Aplicativo WebRTC moderno e completo feito sob medida para compartilhar tela em alta qualidade, assistir a filmes e séries juntos e conversar por voz em tempo real.

---

## ✨ Funcionalidades Principais

* 🖥️ **Compartilhamento de Tela 60 FPS:** Otimizado com captura de áudio direto da aba ou do sistema sem cancelamento destrutivo do som original do filme.
* 🎙️ **Chat de Voz em Tempo Real:** Fale enquanto assistem sem precisar de Discord ou chamadas externas paralelas.
* 🔊 **Mixer de Áudio Independente:**
  * Controle de Volume do Filme (0% a 100%).
  * Controle de Volume da Voz da Namorada com ganho amplificado de até **200%** (para o filme não abafar a voz dela nas cenas de ação).
* ❤️ **Reações Rápidas Flutuantes:** Emojis interativos (❤️, 🍿, 🤣, 😭, 😱, 🔥) que sobem pela tela do filme estilo cinema ao vivo.
* 💬 **Bate-papo Integrado:** Chat de texto com contador de mensagens não lidas.
* ⛶ **Modo Cinema / Fullscreen:** Player imersivo em tela cheia com visual dark glassmorphism.
* 🔗 **Links com 1 Clique:** Copie o link da sala diretamente para enviar pelo WhatsApp.

---

## 🚀 Como Iniciar

1. Abra o terminal na pasta do projeto:
   ```powershell
   cd C:\Users\jvpla\.gemini\antigravity\scratch\cineshare
   ```

2. Inicie o servidor:
   ```powershell
   node server.js
   ```

3. Abra o navegador em: [http://localhost:3000](http://localhost:3000)

---

## 🌐 Como Conectar com a sua Namorada (Internet)

Para ela acessar do computador ou celular dela mesmo estando em outra casa, você pode usar uma dessas soluções gratuitas e instantâneas:

### Opção 1: Cloudflare Tunnel ou Localtunnel (Sem criar conta)
Em outro terminal, execute:
```powershell
npx localtunnel --port 3000
```
O terminal gerará um link público HTTPS (ex: `https://cutes-cinema-share.loca.lt`) que você envia para ela. Como o WebRTC exige HTTPS para microfone/compartilhamento na internet, o Localtunnel já fornece HTTPS automático!

### Opção 2: Ngrok
```powershell
ngrok http 3000
```

### Opção 3: Deploy gratuito no Render / Railway
Basta subir o código no GitHub e conectar ao [Render.com](https://render.com) (Web Service gratuito com Node.js). Ficará online 24h por dia para sempre.

---

## 💡 Dica de Ouro: Como Evitar Tela Preta na Netflix/Prime/Disney

Serviços de streaming usam DRM que bloqueia captura de vídeo. Para resolver:
1. No Chrome ou Edge: Vá em **Configurações > Sistema**.
2. Desmarque a opção **"Usar aceleração de hardware / aceleração gráfica quando disponível"**.
3. Reinicie o navegador.
4. Agora você pode transmitir qualquer streaming sem tela preta!
*(Dica extra: Assistir pelo player do Stremio ou VLC também transmite perfeitamente sem bloqueios).*

