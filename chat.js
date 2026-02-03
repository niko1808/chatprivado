/**********************
 * ESTADO GLOBAL
 **********************/
let pc = null;
let channel = null;
let roomId = null;
let role = null; // "owner" | "joiner"
let roomRef = null;

const ROOM_TTL = 60 * 60 * 1000; // 1 hora

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

/**********************
 * UTILIDADES
 **********************/
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function extractRoomId(v) {
  v = v.trim();
  if (/^\d{6}$/.test(v)) return v;
  return null;
}

function nowTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2, "0") + ":" +
         d.getMinutes().toString().padStart(2, "0");
}

/**********************
 * RENDER MENSAJES (ÚNICO)
 **********************/
let replyTo = null;

function renderMessage({ text = "", img = null, reply = null }, type) {
  const msg = document.createElement("div");
  msg.className = `msg ${type}`;

  let html = `<div class="bubble">`;

  if (reply) {
    html += `<div class="reply-preview">${reply}</div>`;
  }

  if (img) {
    html += `<img src="${img}" class="chat-img">`;
  } else {
    html += text;
  }

  html += `<div class="meta">${nowTime()}${type === "me" ? " ✔✔" : ""}</div>`;
  html += `</div>`;

  msg.innerHTML = html;

  msg.onclick = () => {
    replyTo = img ? "[imagen]" : text;
  };

  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

/**********************
 * PEER CONNECTION
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
      roomRef.collection("candidates")
        .add(e.candidate.toJSON())
        .catch(() => {});
    }
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (["disconnected", "failed", "closed"].includes(s)) {
      cleanupAndExit();
    }
  };
}

/**********************
 * RECEPCIÓN UNIFICADA
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
 * LIMPIEZA CENTRAL
 **********************/
async function cleanupRoom() {
  if (!roomId) return;

  if (role === "owner" && roomRef) {
    await roomRef.delete().catch(() => {});
  }

  if (pc) pc.close();

  pc = null;
  channel = null;
  roomId = null;
  roomRef = null;
}

async function cleanupAndExit() {
  await cleanupRoom();
  location.href = location.pathname;
}

/**********************
 * CREAR CHAT (OWNER)
 **********************/
createBtn.onclick = async () => {
  role = "owner";
  roomId = generateCode();
  roomRef = db.collection("rooms").doc(roomId);

  createBtn.disabled = true;
  destroyBtn.disabled = false;
  copyBtn.disabled = false;

  linkBox.hidden = false;
  roomLinkInput.value = roomId;

  setStatus("⏳ Creando chat...");
  createPeer();

  channel = pc.createDataChannel("chat");
  channel.onopen = enableChat;
  channel.onmessage = handleIncomingMessage;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await roomRef.set({
    offer,
    createdAt: Date.now(),
    owner: true
  });

  roomRef.onSnapshot(async snap => {
    const data = snap.data();
    if (data?.answer && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(data.answer);
    }
  });

  roomRef.collection("candidates").onSnapshot(snap => {
    snap.docChanges().forEach(c => {
      if (c.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(c.doc.data()))
          .catch(() => {});
      }
    });
  });

  setStatus(`🔑 Código del chat: ${roomId}`);
};

/**********************
 * UNIRSE (JOINER)
 **********************/
joinBtn.onclick = () => {
  const id = extractRoomId(joinInput.value);
  if (!id) return setStatus("❌ Código inválido");
  location.href = `${location.pathname}?room=${id}`;
};

pasteBtn?.addEventListener("click", async () => {
  const t = await navigator.clipboard.readText();
  joinInput.value = t;
  joinBtn.click();
});

/**********************
 * AUTO JOIN
 **********************/
(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get("room");
  if (!id) return;

  role = "joiner";
  roomId = id;
  roomRef = db.collection("rooms").doc(roomId);

  setStatus("⏳ Conectando...");
  createPeer();

  const snap = await roomRef.get();
  if (!snap.exists) {
    setStatus("❌ Sala inexistente");
    return;
  }

  const data = snap.data();

  if (Date.now() - data.createdAt > ROOM_TTL) {
    await roomRef.delete();
    setStatus("⌛ Chat expirado");
    return;
  }

  await pc.setRemoteDescription(data.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await roomRef.update({ answer });

  roomRef.collection("candidates").onSnapshot(snap => {
    snap.docChanges().forEach(c => {
      if (c.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(c.doc.data()))
          .catch(() => {});
      }
    });
  });

  destroyBtn.disabled = false;
})();

/**********************
 * COPIAR / ELIMINAR
 **********************/
copyBtn.onclick = async () => {
  await navigator.clipboard.writeText(roomId);
  setStatus("✅ Código copiado");
};

destroyBtn.onclick = cleanupAndExit;

/**********************
 * ENVÍO TEXTO
 **********************/
function sendMessage() {
  const text = input.value.trim();
  if (!text || channel?.readyState !== "open") return;

  const payload = { text, reply: replyTo };
  channel.send(JSON.stringify(payload));
  renderMessage(payload, "me");

  input.value = "";
  replyTo = null;
}

sendBtn.onclick = sendMessage;

input.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

/**********************
 * ENVÍO IMAGEN
 **********************/
const imgBtn = document.createElement("button");
imgBtn.textContent = "📷";
imgBtn.style.minWidth = "44px";
imgBtn.onclick = () => imgInput.click();
document.querySelector(".input").prepend(imgBtn);

imgInput.onchange = () => {
  const file = imgInput.files[0];
  if (!file || channel?.readyState !== "open") return;

  const reader = new FileReader();
  reader.onload = () => {
    const payload = { img: reader.result };
    channel.send(JSON.stringify(payload));
    renderMessage(payload, "me");
  };
  reader.readAsDataURL(file);
};

/**********************
 * LIMPIEZA AL CERRAR
 **********************/
window.addEventListener("beforeunload", () => {
  cleanupRoom();
});
