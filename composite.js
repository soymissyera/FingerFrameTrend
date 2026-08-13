// composite.js — canvas, recorte del marco, contorno e indicadores.
//
// Todo lo de aquí corre en local, a la velocidad de la pantalla. Por eso el
// marco sigue los dedos con latencia cero aunque el modelo vaya más lento:
// el recorte no espera a nadie.
//
// El módulo no toca el DOM al importarse (recibe siempre el contexto 2D como
// argumento), así que las funciones de geometría se pueden probar en Node.

import { centroid } from "./tracking.js";

// Paleta de la marca Miss Yera, del manual. El rosa y el cian son los que
// salen en el video (contorno del marco y puntos de las esquinas), así que
// van exactos, no "un rosa parecido".
export const ROSA = "#fb8cd4";
export const CIAN = "#38c6f4";
export const PINK = ROSA;

/** Dibuja una fuente en espejo llenando w x h. */
export function drawMirrored(ctx, w, h, src) {
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0, w, h);
  ctx.restore();
}

/** Traza el camino del cuadrilátero (sin pintar). */
export function quadPath(ctx, quad) {
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
  ctx.closePath();
}

/**
 * Abre la ventana: recorta al cuadrilátero, aplica la opacidad de presencia y
 * llama a draw() para que pinte el mundo IA alineado a pantalla completa.
 */
export function clipToQuad(ctx, quad, presence, draw) {
  ctx.save();
  quadPath(ctx, quad);
  ctx.clip();
  ctx.globalAlpha = presence;
  draw(ctx);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Contorno punteado animado (hormigas marchando) y puntos pulsantes. */
export function drawOutline(ctx, quad, { presence = 1, timeSec = 0, accent = PINK } = {}) {
  ctx.save();
  ctx.globalAlpha = presence;

  quadPath(ctx, quad);
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -timeSec * 40;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 6;
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.shadowBlur = 0;

  quad.forEach((p, i) => {
    const r = 7 + Math.sin(timeSec * 3 + i * 1.5) * 1.5;
    // Halo rosa que se expande y se desvanece, desfasado por esquina.
    const halo = (timeSec * 0.8 + i * 0.25) % 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + halo * 14, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(accent, 0.55 * (1 - halo) * presence);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(accent, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * Tiñe lo ya pintado dentro del recorte. Con el modo "color" se conserva la
 * luminosidad de la imagen y se le impone el tono del color: así el respaldo
 * local del Mundo Pollito sale rosa siempre, mire lo que mire la cámara,
 * cosa que un giro de tono no puede garantizar.
 */
export function applyTint(ctx, w, h, { color, mode = "color", alpha = 0.8 }) {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = ctx.globalAlpha * alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Mensaje centrado dentro del marco (por ejemplo, "pon tu clave"). */
export function drawQuadMessage(ctx, quad, text, width) {
  const c = centroid(quad);
  ctx.save();
  ctx.font = `600 ${Math.round(width / 55)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(text, c.x, c.y);
  ctx.restore();
}

/** "#rrggbb" + alfa → rgba(). Deja pasar cualquier otra notación tal cual. */
export function withAlpha(color, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
  }
  return color;
}

// ---- Mapeo 16:9 ↔ cuadrado (lo que envía y recibe el backend klein) ----
//
// El cuadro 16:9 se APLASTA a cuadrado al enviarlo y se ESTIRA de vuelta al
// mostrarlo, así la distorsión se cancela. Frente a recortar el centro, esto
// tiene una ventaja concreta: el marco de dedos puede estar en cualquier
// parte del encuadre y siempre hay mundo IA detrás.

/** Punto del canvas → punto del cuadro cuadrado que se manda al modelo. */
export function squashPoint(p, width, height, size) {
  return { x: (p.x / width) * size, y: (p.y / height) * size };
}

/** Punto del cuadro cuadrado devuelto → punto del canvas. */
export function unsquashPoint(p, size, width, height) {
  return { x: (p.x / size) * width, y: (p.y / size) * height };
}

/** Ajusta el canvas al tamaño real del video. Devuelve true si cambió. */
export function resizeCanvasToVideo(canvas, video) {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w;
  canvas.height = h;
  return true;
}

/** Contador de fps por ventana deslizante de 2 segundos. */
export class FpsMeter {
  constructor(windowMs = 2000) {
    this.windowMs = windowMs;
    this.stamps = [];
  }
  tick(now) {
    this.stamps.push(now);
    while (this.stamps.length && now - this.stamps[0] > this.windowMs) {
      this.stamps.shift();
    }
    return this.fps;
  }
  get fps() {
    if (this.stamps.length < 2) return 0;
    const span = this.stamps[this.stamps.length - 1] - this.stamps[0];
    return span > 0 ? ((this.stamps.length - 1) / span) * 1000 : 0;
  }
  reset() {
    this.stamps = [];
  }
}
