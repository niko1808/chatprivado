/**********************
 * ESTADO GLOBAL
 **********************/
let pc = null;
let channel = null;
let roomId = null;
let role = null;
let roomRef = null;

const ROOM_TTL = 60 * 60 * 1000;
const MAX_IMAGE_SIZE = 300 * 1024; // 300 KB

/**********************
 * ELEMENTOS UI
 **********************/
const status = document.getElementById("status");
const createBtn = document.getElementById("create");
const copyBtn = document.getElementById("copy");
const destroyBtn = document.getElementById("destroy");
const joinInput = document.getElementById("joinInput");
const joinBtn = document.getElementById("joinBtn");
const pasteBtn = document.getElementById("pasteBtn");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("send");
const messages = document.getElementById("messages");
const linkBox = document.getElementById("linkBox");
const roomLinkInput = document.getElementById("roomLink");
const imgInput = document.getElementById("imgInput");

/**********************
 * WEBRTC CONFIG
 **********************/
const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

/**********************
 * UI HELPERS
 **********************/
function setStatus(text) {
  status.textContent = text;
}

function enableChat() {
  input.disabled = false;
  sendBtn.disabled = false;
  setStatus("🟢 Conectado");
}

function nowTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2,"0") + ":" +
         d.getMinutes().toString().padStart(2,"0");
}

/**********************
 * MENSAJES
 **********************/
let replyTo = null;

function renderMessage({ text="", img=null, reply=null }, type) {
  const msg = document.createElement("div");
  msg.className = `msg ${type}`;

  let html = `<div class="bubble">`;
  if (reply) html += `<div class="reply-preview">${reply}</div>`;
  if (img) html += `<img src="${img}" class="chat-img">`;
  else html += text;

  html += `<div class="meta">${nowTime()}${type==="me"?" ✔✔":""}</div>`;
  html += `</div>`;

  msg.innerHTML = html;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

/**********************
 * PEER
 **********************/
function createPeer() {
  pc = new RTCPeerConnection(config);

  pc.ondatachannel = e => {
    channel = e.channel;
    channel.onopen = enableChat;
    channel.onmessage = handleIncomingMessage;
  };

  pc.onicecandidate = e => {
    if (e.candidate && roomRef) {
      roomRef.collection("candidates").add(e.candidate.toJSON()).catch(()=>{});
    }
  };
}

/**********************
 * RECEPCIÓN
 **********************/
function handleIncomingMessage(ev) {
  try {
    const data = JSON.parse(ev.data);
    renderMessage(data, "other");
  } catch {
    renderMessage({ text: ev.data }, "other");
  }
}

/**********************
 * CREAR CHAT
 **********************/
createBtn.onclick = async () => {
  role = "owner";
  roomId = Math.floor(100000 + Math.random() * 900000).toString();
  roomRef = db.collection("rooms").doc(roomId);

  createPeer();

  channel = pc.createDataChannel("chat", {
    ordered: true,
    maxRetransmits: null
  });

  channel.onopen = enableChat;
  channel.onmessage = handleIncomingMessage;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await roomRef.set({ offer, createdAt: Date.now() });

  roomRef.onSnapshot(async snap => {
    const d = snap.data();
    if (d?.answer && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(d.answer);
    }
  });
};

/**********************
 * ENVÍO TEXTO
 **********************/
function sendMessage() {
  const text = input.value.trim();
  if (!text || channel?.readyState !== "open") return;

  const payload = { text };
  channel.send(JSON.stringify(payload));
  renderMessage(payload, "me");

  input.value = "";
}

sendBtn.onclick = sendMessage;

/**********************
 * ENVÍO IMAGEN (SEGURO)
 **********************/
const imgBtn = document.createElement("button");
imgBtn.textContent = "📷";
imgBtn.onclick = () => imgInput.click();
document.querySelector(".input").prepend(imgBtn);

imgInput.addEventListener("click", () => {
  setTimeout(enableChat, 500);
});

imgInput.onchange = () => {
  const file = imgInput.files[0];
  if (!file) return;

  if (file.size > MAX_IMAGE_SIZE) {
    alert("Imagen demasiado grande (máx 300 KB)");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const payload = { img: reader.result };
    channel.send(JSON.stringify(payload));
    renderMessage(payload, "me");
    enableChat();
  };
  reader.readAsDataURL(file);
};
