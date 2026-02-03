let pc = null;
let channel = null;
let roomId = null;
let role = null;
let roomRef = null;

const ROOM_TTL = 60 * 60 * 1000;

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

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function setStatus(t) { status.textContent = t; }

function logMessage(text, type) {
  const d = document.createElement("div");
  d.className = `msg ${type}`;
  d.innerHTML = `<div class="bubble">${text}</div>`;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

function enableChat() {
  input.disabled = false;
  sendBtn.disabled = false;
  setStatus("🟢 Conectado");
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createPeer() {
  pc = new RTCPeerConnection(config);

  pc.ondatachannel = e => {
    channel = e.channel;
    channel.onopen = enableChat;
    channel.onmessage = ev => logMessage(ev.data, "other");
  };

  pc.onicecandidate = e => {
    if (e.candidate && roomRef) {
      roomRef.collection("candidates").add(e.candidate.toJSON()).catch(()=>{});
    }
  };

  pc.onconnectionstatechange = () => {
    if (["disconnected","failed","closed"].includes(pc.connectionState)) {
      cleanupAndExit();
    }
  };
}

async function cleanupRoom() {
  if (role === "owner" && roomRef) await roomRef.delete().catch(()=>{});
  if (pc) pc.close();
  pc = channel = roomRef = roomId = null;
}

async function cleanupAndExit() {
  await cleanupRoom();
  location.href = location.pathname;
}

createBtn.onclick = async () => {
  role = "owner";
  roomId = generateCode();
  roomRef = db.collection("rooms").doc(roomId);

  createBtn.disabled = false;
  destroyBtn.disabled = false;
  copyBtn.disabled = false;

  linkBox.hidden = false;
  roomLinkInput.value = roomId;

  createPeer();

  channel = pc.createDataChannel("chat");
  channel.onopen = enableChat;
  channel.onmessage = e => logMessage(e.data,"other");

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await roomRef.set({ offer, createdAt: Date.now() });

  roomRef.onSnapshot(async s => {
    const d = s.data();
    if (d?.answer && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(d.answer);
    }
  });

  roomRef.collection("candidates").onSnapshot(s => {
    s.docChanges().forEach(c => {
      if (c.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(()=>{});
      }
    });
  });

  setStatus(`🔑 Código del chat: ${roomId}`);
};

joinBtn.onclick = () => {
  if (/^\d{6}$/.test(joinInput.value))
    location.href = `${location.pathname}?room=${joinInput.value}`;
};

pasteBtn.onclick = async () => {
  joinInput.value = await navigator.clipboard.readText();
};

(async () => {
  const id = new URLSearchParams(location.search).get("room");
  if (!id) return;

  role = "joiner";
  roomId = id;
  roomRef = db.collection("rooms").doc(roomId);
  createPeer();

  const snap = await roomRef.get();
  if (!snap.exists) return setStatus("❌ Sala inexistente");

  const d = snap.data();
  if (Date.now() - d.createdAt > ROOM_TTL) {
    await roomRef.delete();
    return setStatus("⌛ Chat expirado");
  }

  await pc.setRemoteDescription(d.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await roomRef.update({ answer });

  roomRef.collection("candidates").onSnapshot(s => {
    s.docChanges().forEach(c => {
      if (c.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(()=>{});
      }
    });
  });

  destroyBtn.disabled = false;
})();

copyBtn.onclick = async () => {
  await navigator.clipboard.writeText(roomId);
  setStatus("✅ Código copiado");
};

destroyBtn.onclick = cleanupAndExit;

sendBtn.onclick = () => {
  if (channel?.readyState === "open" && input.value.trim()) {
    channel.send(input.value);
    logMessage(input.value,"me");
    input.value = "";
  }
};

input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendBtn.click();
});

window.addEventListener("beforeunload", cleanupRoom);
