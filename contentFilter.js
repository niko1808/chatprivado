/*************************
 * CONTENT FILTER
 *************************/

let keywordMap = null;

// Cargar keywords
async function loadKeywords() {
  if (keywordMap) return keywordMap;

  const res = await fetch("./data/keywords.json");
  keywordMap = await res.json();
  return keywordMap;
}

// Analizar texto
async function analyzeMessage(text) {
  const map = await loadKeywords();
  const found = [];

  const normalized = text.toLowerCase();

  for (const category in map) {
    for (const word of map[category]) {
      if (normalized.includes(word)) {
        found.push({ category, word });
      }
    }
  }

  return found;
}

// Modal dinámico
function showWarningModal(found, onSend, onEdit) {
  const modal = document.createElement("div");
  modal.className = "legal-modal show";

  modal.innerHTML = `
    <div class="modal-box">
      <h3>⚠ Advertencia</h3>
      <p>
        Este mensaje podría estar infringiendo las reglas de la aplicación
        relacionadas con:
        <strong>${[...new Set(found.map(f => f.category))].join(", ")}</strong>
      </p>
      <p>¿Qué querés hacer?</p>
      <div class="modal-actions">
        <button id="sendAnyway">Enviar igual</button>
        <button id="editMsg">Volver a editar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  modal.querySelector("#sendAnyway").onclick = () => {
    modal.remove();
    document.body.style.overflow = "";
    onSend();
  };

  modal.querySelector("#editMsg").onclick = () => {
    modal.remove();
    document.body.style.overflow = "";
    onEdit();
  };
}

// Función pública
async function safeSend(text, realSendFn) {
  const matches = await analyzeMessage(text);

  if (matches.length === 0) {
    realSendFn();
    return;
  }

  showWarningModal(
    matches,
    () => realSendFn(),
    () => {}
  );
}
