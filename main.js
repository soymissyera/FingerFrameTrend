// main.js — orquestación de las tres capas y loop de render.
//
//   1. Tracking   (local, cada cuadro)   → tracking.js
//   2. Generación (fal realtime, async)  → backends.js
//   3. Compositing(local, cada cuadro)   → composite.js
//
// Las tres capas son independientes y se sincronizan aquí, en un único
// requestAnimationFrame. El tracking y el compositing van a la velocidad de
// la pantalla; la generación llega cuando llega, y el último cuadro recibido
// se dibuja tal cual. Por eso el marco nunca se retrasa respecto a los dedos.

import { computeQuad, FrameTracker } from "./tracking.js";
import {
  drawMirrored,
  clipToQuad,
  drawOutline,
  drawQuadMessage,
  applyTint,
  resizeCanvasToVideo,
  FpsMeter,
} from "./composite.js";
import { BackendManager, KLEIN_PARAMS } from "./backends.js";
import { STYLES, DEFAULT_STYLE_ID, findStyle, backendFor, promptFor } from "./styles.js";
import { createHandLandmarker, CAMERA_CONSTRAINTS } from "./hands.js";
import { DEMO, makeDemoStream, makeFakeHands } from "./demo.js";
import { createUI, loadSettings, persistPrompts } from "./ui.js";
import { Grabadora } from "./grabacion.js";
import { Bandada } from "./pollitos.js";

const video = document.getElementById("video");
const lucyVideo = document.getElementById("lucy");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const settings = loadSettings();
let styleId =
  STYLES.some((s) => s.id === settings.styleId) ? settings.styleId : DEFAULT_STYLE_ID;

const tracker = new FrameTracker();
const renderFps = new FpsMeter();
// El pollito de la marca, dibujado en local con su archivo real.
const bandada = new Bandada({ cantidad: 3 });
void bandada.cargar();
let landmarker = null;
let lastVideoTime = -1;
let lastHands = null;
let modelMetrics = { fps: 0, latencyMs: 0 };

const backends = new BackendManager({
  lucyVideo,
  captureSource: video,
  onStatus: (state, text) => ui.setStatus(state, text),
  onMetrics: (m) => (modelMetrics = m),
  economy: settings.economy,
});
backends.setKey(settings.apiKey);
backends.setSteps(Number(localStorage.getItem("fal-klein-steps")) || backends.kleinSteps);
backends.setFeedback(Number(localStorage.getItem("fal-klein-feedback")) || backends.kleinFeedback);

const ui = createUI({
  styleId,
  settings,
  onStyle: (id) => {
    styleId = id;
    syncBackend();
  },
  onSteps: (valor) => {
    // Menos pasos, más se parece a la entrada; más pasos, más estilo.
    const n = backends.setSteps(valor);
    localStorage.setItem("fal-klein-steps", String(n));
    ui.setSteps(n);
    ui.toast(
      `Transformación ${n} de 6 · ${n <= 2 ? "más parecida a ti" : n >= 5 ? "mucho más estilo" : "equilibrado"}`,
      1500
    );
  },
  onGrabar: () => grabadora.toggle(),
  // El prompt del estilo activo lo manda ella: ve el resultado en su cámara y
  // yo no. null restaura el de fábrica.
  onPrompt: (id, texto) => {
    if (texto === null) delete settings.overrides[id];
    else settings.overrides[id] = texto;
    persistPrompts(settings.overrides);
    mostrarPrompt(id);
    syncBackend();
    if (texto === null) ui.toast("Prompt de fábrica restaurado", 1800);
  },
  onPromptMostrar: (id) => mostrarPrompt(id),
  // Las barritas se pueden dejar en una combinación que devuelve papilla, y
  // desde dentro no hay forma de saber cuál fue. Esto siempre vuelve a casa.
  onReset: () => {
    const pasos = backends.setSteps(KLEIN_PARAMS.num_inference_steps);
    const arrastre = backends.setFeedback(KLEIN_PARAMS.output_feedback_strength);
    localStorage.setItem("fal-klein-steps", String(pasos));
    localStorage.setItem("fal-klein-feedback", String(arrastre));
    ui.setSteps(pasos);
    ui.setArrastre(arrastre);
    ui.toast(`Ajustes de fábrica: transformación ${pasos}, arrastre ${arrastre}`, 2200);
  },
  onPollitos: (on) => ui.toast(on ? "Pollitos encendidos" : "Pollitos apagados", 1400),
  onArrastre: (v) => {
    const n = backends.setFeedback(v);
    localStorage.setItem("fal-klein-feedback", String(n));
    ui.setArrastre(n);
    ui.toast(`Arrastre ${n.toFixed(2)}`, 1200);
  },
  onEconomy: (on) => {
    settings.economy = on;
    backends.setEconomy(on);
  },
  onSettings: (next) => {
    settings.apiKey = next.apiKey;
    settings.customPrompt = next.customPrompt;
    settings.customBackend = next.customBackend;
    backends.setKey(next.apiKey);
    // Reiniciar las sesiones para que la clave, el prompt y el backend nuevos
    // tomen efecto de verdad y no queden colgando de la conexión anterior.
    backends.stopAll();
    syncBackend();
  },
});

// Grabar el canvas, no la pantalla: el archivo sale sin interfaz ni puntero.
const grabadora = new Grabadora({
  canvas,
  encuadre: () => ({ vertical: ui.vertical, zoom: ui.zoom }),
  // El mismo degradado de marca que el telón del formato vertical.
  fondo: (ctx, lienzo) => {
    const g = ctx.createLinearGradient(0, 0, lienzo.w * 0.4, lienzo.h);
    g.addColorStop(0, "#fb8cd4");
    g.addColorStop(0.52, "#ff9ede");
    g.addColorStop(1, "#ffd9f0");
    return g;
  },
  onEstado: (estado, datos = {}) => {
    if (estado === "grabando") {
      ui.toast(
        datos.vertical
          ? "Grabando en 9:16 · R o el botón para parar"
          : "Grabando en horizontal · pulsa V antes si lo quieres vertical",
        2400
      );
    } else if (estado === "guardado") {
      ui.toast(`Descargado ${datos.nombre} · ${datos.megas.toFixed(1)} MB`, 4000);
    } else if (estado === "error") {
      ui.toast(datos.mensaje, 4000);
    }
    ui.setGrabando(grabadora.grabando, grabadora.segundos);
  },
});

// La barrita arranca mostrando lo que de verdad tiene el backend.
ui.setSteps(backends.kleinSteps);
mostrarPrompt(styleId);

/** Refresca el cuadro del prompt y su etiqueta de "esto lo escribiste tú". */
function mostrarPrompt(id) {
  const propio = !!(settings.overrides[id] || "").trim();
  ui.setPrompt(promptFor(findStyle(id), settings), propio);
}
ui.setArrastre(backends.kleinFeedback);

function currentStyle() {
  return findStyle(styleId);
}

/** Reconcilia el backend vivo con el estilo elegido. */
function syncBackend() {
  const style = currentStyle();
  // En modo demo jamás se llama a la API: es un banco de pruebas gratuito.
  if (DEMO) {
    ui.setStatus("local", "MODO DEMO · FILTRO LOCAL");
    return;
  }
  if (!settings.apiKey) {
    backends.stopAll();
    ui.setStatus("local", "SIN CLAVE · FILTRO LOCAL");
    return;
  }
  void backends.apply({
    backend: backendFor(style, settings.customBackend),
    prompt: promptFor(style, settings),
  });
}

async function init() {
  let stream;
  if (DEMO) {
    stream = makeDemoStream();
  } else {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Este navegador no da acceso a la cámara aquí. Hace falta https o " +
          "localhost: abre la página publicada en vez del archivo local."
      );
    }
    ui.setLoading("Cargando el detector de manos…");
    landmarker = await createHandLandmarker();
    ui.setLoading("Pidiendo acceso a la cámara…");
    stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    backends.setCamera(stream);
  }

  video.srcObject = stream;
  await new Promise((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.onloadedmetadata = resolve;
  });
  await video.play();
  resizeCanvasToVideo(canvas, video);

  ui.hideLoading();
  syncBackend();

  // Lucy se cobra por tiempo conectado: al irse de la página, se corta.
  window.addEventListener("pagehide", () => backends.stopAll());

  requestAnimationFrame(loop);
}

function loop() {
  const w = canvas.width;
  const h = canvas.height;

  // Capa base: la cámara real, en espejo.
  drawMirrored(ctx, w, h, video);

  // Detección: una vez por cuadro nuevo de video, no una por cuadro de pantalla.
  if (DEMO) {
    lastHands = makeFakeHands(performance.now() / 1000);
  } else if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    lastHands = landmarker.detectForVideo(video, performance.now())?.landmarks ?? null;
  }

  const target = computeQuad(lastHands, {
    width: w,
    height: h,
    active: tracker.active,
  });
  tracker.update(target, w);
  // El backend necesita saber si de verdad hay marco: sin gesto, la ventana
  // no enseña nada del modelo, así que generar sería tirar el dinero.
  backends.setDemand(tracker.visible);

  if (tracker.visible) {
    drawWindow(tracker.corners, w, h);
    drawOutline(ctx, tracker.corners, {
      presence: tracker.presence,
      timeSec: performance.now() / 1000,
    });
  }

  ui.showHint(tracker.presence <= 0.5 && !grabadora.grabando);
  if (grabadora.grabando) ui.setGrabando(true, grabadora.segundos);
  updateStats();
  requestAnimationFrame(loop);
}

/** Pinta el mundo IA y lo revela solo a través del cuadrilátero. */
function drawWindow(quad, w, h) {
  const style = currentStyle();
  clipToQuad(ctx, quad, tracker.presence, () => {
    if (backends.backend === "lucy" && backends.ready) {
      // La salida de Lucy es una transformación del mismo encuadre completo:
      // se dibuja en espejo y alineada a pantalla, así el marco es de verdad
      // una ventana y sigue registrada cuando las manos se mueven.
      drawMirrored(ctx, w, h, lucyVideo);
    } else if (backends.backend === "klein" && backends.ready) {
      // El cuadro de klein se capturó espejado y aplastado a cuadrado: se
      // estira sobre todo el canvas y la deformación se cancela.
      ctx.drawImage(backends.kleinBitmap, 0, 0, w, h);
    } else {
      // Sin clave, en demo o mientras conecta: filtro local por estilo, para
      // poder probar tracking y compositing sin gastar un centavo.
      ctx.filter = style.filter;
      drawMirrored(ctx, w, h, video);
      ctx.filter = "none";
      if (style.tint) applyTint(ctx, w, h, style.tint);
      if (!DEMO && !settings.apiKey) {
        drawQuadMessage(ctx, quad, "Pon tu clave de fal (arriba a la derecha)", w);
      }
    }
    // El pollito va encima de todo, dentro de la ventana.
    if (style.bandada && ui.pollitos) {
      bandada.update(performance.now() / 1000).draw(ctx, quad, { presence: 1 });
    }
  });
}

function updateStats() {
  const fps = renderFps.tick(performance.now());
  const parts = [`${fps.toFixed(0)} fps de pantalla`];
  if (backends.ready && backends.backend === "klein" && modelMetrics.fps) {
    parts.push(`modelo ${modelMetrics.fps.toFixed(1)} fps`);
    parts.push(`${modelMetrics.latencyMs} ms`);
  } else if (backends.ready && backends.backend === "lucy") {
    parts.push("Lucy en vivo por WebRTC");
  }
  // Gasto estimado de la sesión, para no enterarse por la factura.
  const { usd } = backends.spend;
  if (usd > 0) parts.push(`~$${usd.toFixed(usd < 1 ? 3 : 2)} en esta sesión`);
  ui.setStats(parts.join(" · "));
}

init().catch((err) => {
  console.error(err);
  ui.fatal(explainStartupError(err));
});

/** Mensajes de arranque que dicen qué hacer, no solo qué falló. */
function explainStartupError(err) {
  const message = String(err?.message || err);
  if (err?.name === "NotAllowedError") {
    return "Se denegó el permiso de cámara. Permite el acceso en el candado de la barra de direcciones y recarga la página.";
  }
  if (err?.name === "NotFoundError" || err?.name === "OverconstrainedError") {
    return "No se encontró ninguna cámara conectada. Conecta una y recarga la página.";
  }
  if (err?.name === "NotReadableError") {
    return "La cámara está ocupada por otra aplicación. Ciérrala y recarga la página.";
  }
  if (/dynamically imported module|Failed to fetch|NetworkError/i.test(message)) {
    return "No se pudo cargar el detector de manos desde el CDN. Revisa tu conexión y recarga. Mientras tanto, añade ?demo a la URL: el modo demostración funciona sin CDN y sin cámara.";
  }
  return `No se pudo iniciar: ${message}`;
}
