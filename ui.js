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

export function loadSettings() {
  return {
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

/**
 * Cablea toda la interfaz y devuelve los métodos que necesita el loop.
 *
 * @param {object} opts
 * @param {(id:string)=>void} opts.onStyle       estilo elegido
 * @param {(s:object)=>void}  opts.onSettings    clave o estilo libre guardados
 * @param {string}            opts.styleId       estilo inicial
 * @param {object}            opts.settings      ajustes iniciales
 */
export function createUI({ onStyle, onSettings, styleId, settings }) {
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
  });

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
  };
}
