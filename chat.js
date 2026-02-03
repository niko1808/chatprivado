let pc = null;
let channel = null;
let isCreator = false;

const status = document.getElementById("status");
const guide = document.getElementById("guide");
const createBtn = document.getElementById("create");
const joinBtn = document.getElementById("join");
const copyBtn = document.getElementById("copy");
const pasteBtn = document.getElementById("paste");
const closeGuide = document.getElementById("closeGuide");
const signalBox = document.getElementById("signal");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("send");
const messages = document.getElementById("messages");

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

/* ===== NUMERIC ENCODER ===== */

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function encodeNumeric(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return [...b64].map(c =>
    alphabet.indexOf(c).toString().padStart(2, "0")
  ).join("");
}

function decodeNumeric(num) {
  const chars = num.match(/.{1,2}/g).map(n => alphabet[+n]).join("");
  return decodeURIComponent(escape(atob(chars)));
}

/* ===== UI ===== */

function setStatus(text) {
  status.textContent = text;
}

function logMessage(text, type) {
  const msg = document.createElement("div");
  msg.className = `msg ${type}`;
  msg.innerHTML = `<div class="bubble">${text}</div>`;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

function enableChat() {
  input.disabled = false;
  sendBtn.disabled = false;
  setStatus("🟢 Conectado");
}

/* ===== WEBRTC ===== */

function createPC() {
  pc = new RTCPeerConnection(config);

  pc.onicecandidate = () => {
    if (pc.localDescription) {
      signalBox.value = encodeNumeric(JSON.stringify(pc.localDescription));
    }
  };

  pc.ondatachannel = e => {
    channel = e.channel;
    channel.onmessage = ev => logMessage(ev.data, "other");
    channel.onopen = enableChat;

    if (channel.readyState === "open") {
      enableChat();
    }
  };
}

createBtn.onclick = async () => {
  isCreator = true;
  createPC();

  channel = pc.createDataChannel("chat");
  channel.onmessage = e => logMessage(e.data, "other");
  channel.onopen = enableChat;

  if (channel.readyState === "open") {
    enableChat();
  }

  await pc.setLocalDescription(await pc.createOffer());
  setStatus("📋 Código creado");
};

joinBtn.onclick = async () => {
  try {
    const data = JSON.parse(decodeNumeric(signalBox.value.trim()));

    if (data.type === "offer") {
      createPC();
      await pc.setRemoteDescription(data);
      await pc.setLocalDescription(await pc.createAnswer());
      setStatus("📋 Devolvé el código");
    }

    if (data.type === "answer" && isCreator && pc) {
      await pc.setRemoteDescription(data);
    }
  } catch {
    setStatus("❌ Código inválido");
  }
};

/* ===== CHAT ===== */

function sendMessage() {
  const t = input.value.trim();
  if (!t || !channel || channel.readyState !== "open") return;
  channel.send(t);
  logMessage(t, "me");
  input.value = "";
}

sendBtn.onclick = sendMessage;

input.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

/* ===== EXTRA ===== */

copyBtn.onclick = () => navigator.clipboard.writeText(signalBox.value);
pasteBtn.onclick = async () => signalBox.value = await navigator.clipboard.readText();
closeGuide.onclick = () => guide.style.display = "none";
