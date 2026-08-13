// ui.js — interfaz: selector de estilos, panel de la clave, indicadores.
//
// La clave de fal vive en el navegador de la usuaria y en ningún otro sitio.
// Solo se guarda en localStorage si marca "recordar"; si no, se queda en
// sessionStorage y muere al cerrar la pestaña.

import { STYLES, backendFor, backendLabel } from "./styles.js";

const KEY_STORAGE = "fal-key";
const CUSTOM_PROMPT_STORAGE = "fal-custom-prompt";
const CUSTOM_BACKEND_STORAGE = "fal-custom-backend";
const STYLE_STORAGE = "fft-style";
const ECONOMY_STORAGE = "fal-economy";

export function loadSettings() {
  return {
    // El ahorro viene puesto salvo que se haya apagado a propósito.
    economy: localStorage.getItem(ECONOMY_STORAGE) !== "0",
    apiKey:
      localStorage.getItem(KEY_STORAGE) || sessionStorage.getItem(KEY_STORAGE) || "",
    remember: !!localStorage.getItem(KEY_STORAGE),
    customPrompt: localStorage.getItem(CUSTOM_PROMPT_STORAGE) || "",
    customBackend: localStorage.getItem(CUSTOM_BACKEND_STORAGE) || "klein",
    styleId: localStorage.getItem(STYLE_STORAGE) || "",
  };
}

export function persistKey(apiKey, remember) {
  localStorage.removeItem(KEY_STORAGE);
  sessionStorage.removeItem(KEY_STORAGE);
  if (apiKey) {
    (remember ? localStorage : sessionStorage).setItem(KEY_STORAGE, apiKey);
  }
}

export function persistCustom(prompt, backend) {
  localStorage.setItem(CUSTOM_PROMPT_STORAGE, prompt);
  localStorage.setItem(CUSTOM_BACKEND_STORAGE, backend);
}

export function persistStyle(id) {
  localStorage.setItem(STYLE_STORAGE, id);
}

export function persistEconomy(on) {
  localStorage.setItem(ECONOMY_STORAGE, on ? "1" : "0");
}

/**
 * Cablea toda la interfaz y devuelve los métodos que necesita el loop.
 *
 * @param {object} opts
 * @param {(id:string)=>void} opts.onStyle       estilo elegido
 * @param {(s:object)=>void}  opts.onSettings    clave o estilo libre guardados
 * @param {string}            opts.styleId       estilo inicial
 * @param {object}            opts.settings      ajustes iniciales
 */
export function createUI({ onStyle, onSettings, onEconomy, styleId, settings }) {
  const el = (id) => document.getElementById(id);
  const toolbar = el("toolbar");
  const panel = el("key-panel");
  const keyInput = el("key-input");
  const remember = el("key-remember");
  const customPrompt = el("style-custom");
  const backendRadios = [...document.querySelectorAll('input[name="custom-backend"]')];
  const pill = el("live-pill");
  const pillText = el("live-text");
  const statsEl = el("stats");
  const hint = el("hint");
  const statusEl = el("status");
  const statusText = el("status-text");

  let current = styleId;

  // ---- selector de estilos ----
  STYLES.forEach((style, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = style.id;
    const backend = backendFor(style, settings.customBackend);
    btn.innerHTML =
      `<span class="key">${i + 1}</span>${style.label}` +
      `<span class="badge">${style.backend ? backendLabel(backend) : "LIBRE"}</span>`;
    if (style.id === current) btn.classList.add("active");
    btn.addEventListener("click", () => select(style.id));
    toolbar.appendChild(btn);
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.target instanceof HTMLInputElement) return;
    if (ev.target instanceof HTMLTextAreaElement) return;
    const idx = parseInt(ev.key, 10) - 1;
    if (idx >= 0 && idx < STYLES.length) select(STYLES[idx].id);
    if (ev.key === "Escape") panel.classList.add("hidden");
    if (ev.key.toLowerCase() === "o") toggleClean();
    if (ev.key.toLowerCase() === "v") toggleVertical();
    if (ev.key === "+" || ev.key === "=") setZoom(zoom + 0.1);
    if (ev.key === "-" || ev.key === "_") setZoom(zoom - 0.1);
  });

  // Modo grabación: fuera todo menos el video y el marco. El aviso se
  // desvanece solo, para que no salga en la toma si esperas un segundo.
  function toggleClean() {
    const clean = document.body.classList.toggle("limpio");
    if (clean) toast("Interfaz oculta · pulsa O para recuperarla");
    else hideToast();
  }

  // Formato vertical 9:16, listo para subir sin reencuadrar.
  const stage = el("stage");
  let zoom = 1;
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 2.4;

  function toggleVertical() {
    const vertical = document.body.classList.toggle("vertical");
    toast(
      vertical
        ? "Vertical 9:16 · + y − para acercar · V para volver"
        : "Formato horizontal"
    );
  }

  function setZoom(next) {
    if (!document.body.classList.contains("vertical")) return;
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 20) / 20));
    stage.style.setProperty("--zoom", zoom);
    toast(
      zoom === ZOOM_MIN
        ? "Encuadre completo, sin recortar"
        : `Zoom ${zoom.toFixed(2)}× · recorta ${Math.round((1 - 1 / zoom) * 100)} % de los lados`,
      1600
    );
  }

  let toastTimer = null;
  const toastEl = el("toast");
  function toast(text, ms = 2600) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, ms);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.classList.remove("show");
  }

  function select(id) {
    current = id;
    toolbar.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.id === id);
    });
    persistStyle(id);
    // El estilo libre sin prompt no puede hacer nada: abrir el panel.
    if (id === "custom" && !customPrompt.value.trim()) {
      panel.classList.remove("hidden");
      customPrompt.focus();
    }
    onStyle(id);
  }

  // ---- panel de la clave ----
  keyInput.value = settings.apiKey;
  remember.checked = settings.remember;
  customPrompt.value = settings.customPrompt;
  backendRadios.forEach((r) => (r.checked = r.value === settings.customBackend));

  // El ahorro se aplica al instante, sin esperar a guardar: es dinero.
  const economy = el("economy");
  economy.checked = settings.economy;
  economy.addEventListener("change", () => {
    persistEconomy(economy.checked);
    onEconomy(economy.checked);
  });

  el("key-btn").addEventListener("click", () => panel.classList.toggle("hidden"));
  el("key-close").addEventListener("click", () => panel.classList.add("hidden"));

  el("key-save").addEventListener("click", () => {
    const apiKey = keyInput.value.trim();
    const backend = backendRadios.find((r) => r.checked)?.value || "klein";
    persistKey(apiKey, remember.checked);
    persistCustom(customPrompt.value, backend);
    panel.classList.add("hidden");
    onSettings({ apiKey, customPrompt: customPrompt.value, customBackend: backend });
  });

  el("key-clear").addEventListener("click", () => {
    keyInput.value = "";
    persistKey("", false);
    onSettings({
      apiKey: "",
      customPrompt: customPrompt.value,
      customBackend: backendRadios.find((r) => r.checked)?.value || "klein",
    });
  });

  return {
    get styleId() {
      return current;
    },
    /** @param {"idle"|"connecting"|"live"|"error"|"local"} state */
    setStatus(state, text) {
      pill.className = state && state !== "idle" ? `on ${state}` : "";
      pillText.textContent = text || "";
    },
    setStats(text) {
      statsEl.textContent = text;
    },
    showHint(show) {
      hint.classList.toggle("hidden", !show);
    },
    setLoading(text) {
      statusEl.classList.remove("hidden");
      statusText.textContent = text;
    },
    hideLoading() {
      statusEl.classList.add("hidden");
    },
    fatal(text) {
      statusEl.classList.remove("hidden");
      statusEl.querySelector(".spinner")?.remove();
      statusText.textContent = text;
    },
    openKeyPanel() {
      panel.classList.remove("hidden");
    },
    toast,
    toggleClean,
    toggleVertical,
  };
}
