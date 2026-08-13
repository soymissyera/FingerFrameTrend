// demo.js — modo ?demo: feed sintético y landmarks de mano falsos.
//
// Es el primer sitio donde se prueba todo, porque no necesita cámara, ni
// permisos, ni clave, ni una sola llamada a la API: ejercita el tracking y el
// compositing enteros con manos que se mueven solas.
//
// makeFakeHands() es lógica pura y se usa también en las pruebas de Node.

import { WRIST, THUMB_TIP, INDEX_MCP, INDEX_TIP, MIDDLE_MCP } from "./tracking.js";

// `typeof` y no `location?.search`: en Node el identificador no existe y el
// encadenamiento opcional igual lanzaría, y este módulo se importa en pruebas.
export const DEMO = new URLSearchParams(
  typeof location !== "undefined" ? location.search : ""
).has("demo");

/**
 * Construye los 21 landmarks de una mano. Los que no se especifican se
 * rellenan con la muñeca: al detector le sobran, pero computeQuad solo mira
 * muñeca, nudillo medio, punta del índice y punta del pulgar.
 */
export function makeHand({ wrist, middleMcp, indexTip, thumbTip, indexMcp }) {
  const lm = Array.from({ length: 21 }, () => ({ ...wrist, z: 0 }));
  lm[WRIST] = { ...wrist, z: 0 };
  lm[MIDDLE_MCP] = { ...middleMcp, z: 0 };
  lm[INDEX_TIP] = { ...indexTip, z: 0 };
  lm[THUMB_TIP] = { ...thumbTip, z: 0 };
  lm[INDEX_MCP] = { ...(indexMcp ?? middleMcp), z: 0 };
  return lm;
}

/**
 * Dos manos haciendo el marco de director, a la deriva suavemente con el
 * tiempo t (en segundos). Coordenadas normalizadas de 0 a 1, como MediaPipe.
 *
 * @param {number} t segundos
 * @param {boolean} crossed si true, voltea los dedos de una mano (marco
 *   cruzado): sirve para verificar que el orden anatómico traza el moño.
 */
export function makeFakeHands(t, crossed = false) {
  const ox = Math.sin(t * 0.9) * 0.03;
  const oy = Math.cos(t * 0.7) * 0.025;
  const breathe = Math.sin(t * 0.45) * 0.02;

  const right = makeHand({
    wrist: { x: 0.78 + ox, y: 0.72 + oy },
    middleMcp: { x: 0.77 + ox, y: 0.6 + oy },
    indexTip: { x: 0.74 + ox + breathe, y: 0.24 + oy - breathe },
    thumbTip: { x: 0.82 + ox + breathe, y: 0.56 + oy },
    indexMcp: { x: 0.75 + ox, y: 0.4 + oy },
  });

  const left = makeHand({
    wrist: { x: 0.22 - ox, y: 0.74 - oy },
    middleMcp: { x: 0.23 - ox, y: 0.62 - oy },
    indexTip: { x: 0.26 - ox - breathe, y: 0.26 - oy + breathe },
    thumbTip: { x: 0.18 - ox - breathe, y: 0.58 - oy },
    indexMcp: { x: 0.25 - ox, y: 0.42 - oy },
  });

  if (crossed) {
    // Intercambiar índice y pulgar de una mano es exactamente lo que pasa al
    // voltearla: el ciclo de aristas se cruza en moño.
    const i = left[INDEX_TIP];
    left[INDEX_TIP] = left[THUMB_TIP];
    left[THUMB_TIP] = i;
  }
  return [left, right];
}

/**
 * Feed de video sintético: un canvas animado convertido en MediaStream, con
 * la paleta de la marca. Sustituye a getUserMedia en modo demo.
 */
export function makeDemoStream(width = 1280, height = 720, fps = 30) {
  const demo = document.createElement("canvas");
  demo.width = width;
  demo.height = height;
  const d = demo.getContext("2d");

  function paint() {
    const t = performance.now() / 1000;
    // Paleta fría a propósito: así cualquier ventana teñida de rosa (el
    // respaldo local del Mundo Pollito) se distingue del fondo de un vistazo.
    const g = d.createLinearGradient(0, 0, demo.width, demo.height);
    g.addColorStop(0, "#0e1630");
    g.addColorStop(0.55, "#16204a");
    g.addColorStop(1, "#0b1220");
    d.fillStyle = g;
    d.fillRect(0, 0, demo.width, demo.height);

    for (let i = 0; i < 7; i++) {
      const x = demo.width * (0.12 + 0.13 * i) + Math.sin(t * 0.8 + i) * 70;
      const y = demo.height * 0.5 + Math.cos(t * 0.6 + i * 1.7) * 170;
      d.beginPath();
      d.arc(x, y, 46 + 18 * Math.sin(t + i), 0, Math.PI * 2);
      // El tono oscila dentro de la franja fría en vez de recorrer la rueda
      // entera, para que el fondo nunca compita con el rosa de la ventana.
      const hue = 175 + i * 11 + Math.sin(t * 0.3 + i * 0.4) * 28;
      d.fillStyle = `hsl(${hue}, 68%, ${52 + 6 * Math.sin(t + i)}%)`;
      d.globalAlpha = 0.85;
      d.fill();
      d.globalAlpha = 1;
    }

    // Se dibuja en espejo para que el canvas principal, que voltea la imagen,
    // lo muestre legible.
    d.save();
    d.translate(demo.width, 0);
    d.scale(-1, 1);
    d.fillStyle = "rgba(255,255,255,0.92)";
    d.font = "bold 58px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    d.textAlign = "center";
    d.fillText("FEED DE DEMOSTRACIÓN", demo.width / 2, demo.height / 2 - 10);
    d.font = "500 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    d.fillStyle = "rgba(255,255,255,0.6)";
    d.fillText("sin cámara y sin llamadas a la API", demo.width / 2, demo.height / 2 + 34);
    d.restore();

    requestAnimationFrame(paint);
  }

  paint();
  return demo.captureStream(fps);
}
