// tests/run-tests.mjs — pruebas de la lógica pura, en Node, sin dependencias.
//
//   node tests/run-tests.mjs
//
// En el sandbox no hay cámara ni pantalla, así que esto es lo único que se
// puede verificar de verdad: el ordenamiento de esquinas, la histéresis, el
// rechazo de teletransporte, el suavizado, el sostenimiento de dropout, el
// fundido de presencia y el mapeo 16:9 ↔ cuadrado. El efecto visual lo prueba
// la usuaria en GitHub Pages.

import assert from "node:assert/strict";
import {
  computeQuad,
  FrameTracker,
  TRACKING_DEFAULTS,
  polygonArea,
  orderByAngle,
  dist,
  centroid,
  toPixel,
  INDEX_TIP,
  THUMB_TIP,
} from "../tracking.js";
import { squashPoint, unsquashPoint, withAlpha, FpsMeter } from "../composite.js";
import {
  BackendManager,
  demandActive,
  KLEIN_IDLE_TAIL_MS,
  LUCY_IDLE_TAIL_MS,
  PRECIOS_USD,
} from "../backends.js";
import { makeFakeHands } from "../demo.js";
import { STYLES, findStyle, backendFor, promptFor, DEFAULT_STYLE_ID } from "../styles.js";

const W = 1280;
const H = 720;

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
function group(name) {
  console.log(`\n${name}`);
}

// ---------------------------------------------------------------- geometría
group("Geometría del cuadrilátero");

test("polygonArea calcula el área de un rectángulo", () => {
  const r = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ];
  assert.equal(polygonArea(r), 5000);
});

test("un cuadrilátero cruzado tiene área trazada menor que su envolvente", () => {
  const crossed = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  ];
  assert.ok(polygonArea(crossed) < polygonArea(orderByAngle(crossed)));
  assert.equal(polygonArea(orderByAngle(crossed)), 5000);
});

test("las esquinas salen en orden anatómico: índices arriba, pulgares abajo", () => {
  const hands = makeFakeHands(0);
  const quad = computeQuad(hands, { width: W, height: H });
  assert.ok(quad, "debería detectar el marco");
  const [i0, i1, t1, t0] = quad;
  // Los dos índices están por encima de los dos pulgares.
  assert.ok(i0.y < t0.y && i1.y < t1.y, "los índices deben quedar arriba");
  // Índice y pulgar de la misma mano comparten lado de la pantalla.
  assert.ok(i0.x < i1.x, "la primera esquina es la de la mano izquierda");
  assert.ok(Math.abs(i0.x - t0.x) < Math.abs(i0.x - t1.x), "esquinas emparejadas por mano");
});

test("el orden anatómico traza un polígono simple (no se cruza)", () => {
  const quad = computeQuad(makeFakeHands(0), { width: W, height: H });
  // Si no se cruza, el área trazada es igual a la de su envolvente ordenada.
  assert.ok(Math.abs(polygonArea(quad) - polygonArea(orderByAngle(quad))) < 1e-6);
});

test("voltear una mano cruza el marco en moño, y descruzarla lo recupera", () => {
  const crossed = computeQuad(makeFakeHands(0, true), { width: W, height: H, active: true });
  assert.ok(crossed, "el marco cruzado sigue siendo un cuadrilátero");
  assert.ok(
    polygonArea(crossed) < polygonArea(orderByAngle(crossed)) * 0.9,
    "el moño debe tener área trazada mucho menor"
  );
  // El orden no guarda estado: al descruzar, vuelve solo.
  const back = computeQuad(makeFakeHands(0), { width: W, height: H, active: true });
  assert.ok(Math.abs(polygonArea(back) - polygonArea(orderByAngle(back))) < 1e-6);
});

test("el espejo invierte la x y respeta la y", () => {
  const p = toPixel({ x: 0.25, y: 0.5 }, W, H, true);
  assert.equal(p.x, 0.75 * W);
  assert.equal(p.y, 0.5 * H);
  assert.equal(toPixel({ x: 0.25, y: 0.5 }, W, H, false).x, 0.25 * W);
});

test("computeQuad exige exactamente dos manos", () => {
  const hands = makeFakeHands(0);
  assert.equal(computeQuad(null, { width: W, height: H }), null);
  assert.equal(computeQuad([hands[0]], { width: W, height: H }), null);
  assert.equal(computeQuad([...hands, hands[0]], { width: W, height: H }), null);
});

// ---------------------------------------------------------------- histéresis
group("Histéresis de los gates");

/** Acerca el pulgar al índice de las dos manos por un factor 0..1. */
function pinch(hands, factor) {
  return hands.map((lm) => {
    const copy = lm.map((p) => ({ ...p }));
    const i = copy[INDEX_TIP];
    const t = copy[THUMB_TIP];
    copy[THUMB_TIP] = {
      x: i.x + (t.x - i.x) * factor,
      y: i.y + (t.y - i.y) * factor,
      z: 0,
    };
    return copy;
  });
}

test("cuesta más entrar que salir: hay una zona que solo pasa estando activo", () => {
  // Buscamos un apretón donde el gate de entrada rechace y el de salida acepte.
  // 0.15 de la separación completa cae dentro de la banda de histéresis:
  // por encima del umbral de salida (0.2 del tamaño de mano) y por debajo
  // del de entrada (0.75).
  const partly = pinch(makeFakeHands(0), 0.15);
  assert.equal(
    computeQuad(partly, { width: W, height: H, active: false }),
    null,
    "sin marco activo, este gesto no debería encender el efecto"
  );
  assert.ok(
    computeQuad(partly, { width: W, height: H, active: true }),
    "con el marco activo, el mismo gesto debe mantenerlo"
  );
});

test("dedos totalmente juntos apagan el efecto aunque esté activo", () => {
  const closed = pinch(makeFakeHands(0), 0.02);
  assert.equal(computeQuad(closed, { width: W, height: H, active: true }), null);
});

test("el gate de área también tiene dos umbrales", () => {
  assert.ok(TRACKING_DEFAULTS.areaEnter > TRACKING_DEFAULTS.areaExit);
  // Un marco diminuto: manos juntas al centro, dedos bien abiertos.
  const tiny = makeFakeHands(0).map((lm, handIdx) =>
    lm.map((p) => ({
      x: 0.5 + (p.x - 0.5) * 0.1 + (handIdx ? 0.012 : -0.012),
      y: 0.5 + (p.y - 0.5) * 0.1,
      z: 0,
    }))
  );
  assert.equal(
    computeQuad(tiny, { width: W, height: H, active: false }),
    null,
    "un marco minúsculo no debe encender el efecto"
  );
  assert.ok(
    computeQuad(tiny, { width: W, height: H, active: true }),
    "pero sí puede sostenerlo si ya estaba encendido"
  );
});

// ------------------------------------------------------------------ tracker
group("Pipeline de robustez (FrameTracker)");

const quadAt = (x, y, w = 300, h = 200) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

test("engancha el primer cuadrilátero sin suavizar", () => {
  const t = new FrameTracker();
  const q = quadAt(100, 100);
  t.update(q, W);
  assert.deepEqual(t.corners, q);
  assert.ok(t.active);
  assert.ok(t.presence > 0);
});

test("la presencia sube y baja con fundido, nunca de golpe", () => {
  const t = new FrameTracker();
  const q = quadAt(100, 100);
  t.update(q, W);
  assert.ok(t.presence < 1, "no aparece a plena opacidad en un cuadro");
  for (let i = 0; i < 20; i++) t.update(q, W);
  assert.equal(t.presence, 1);

  // Se pierde el gesto: primero se sostiene, después se desvanece.
  for (let i = 0; i < TRACKING_DEFAULTS.maxLostFrames; i++) t.update(null, W);
  assert.equal(t.presence, 1, "los dropouts cortos sostienen el marco");
  assert.ok(t.corners, "y conservan las esquinas");

  t.update(null, W);
  assert.ok(t.presence < 1 && t.presence > 0, "después empieza a desvanecerse");
  for (let i = 0; i < 40; i++) t.update(null, W);
  assert.equal(t.presence, 0);
  assert.equal(t.corners, null);
  assert.equal(t.active, false);
});

test("suavizado adaptativo: quieta suaviza mucho, rápida sigue de cerca", () => {
  const slow = new FrameTracker();
  slow.update(quadAt(100, 100), W);
  slow.update(quadAt(103, 100), W); // 3 px: casi quieta
  const slowGain = (slow.corners[0].x - 100) / 3;

  const fast = new FrameTracker();
  fast.update(quadAt(100, 100), W);
  fast.update(quadAt(300, 100), W); // 200 px: movimiento franco
  const fastGain = (fast.corners[0].x - 100) / 200;

  assert.ok(Math.abs(slowGain - TRACKING_DEFAULTS.smoothMin) < 1e-9, "mínimo estando quieta");
  assert.ok(Math.abs(fastGain - TRACKING_DEFAULTS.smoothMax) < 1e-9, "máximo moviéndose");
  assert.ok(slowGain < fastGain);
});

test("el suavizado nunca sobrepasa el objetivo ni se queda clavado", () => {
  const t = new FrameTracker();
  t.update(quadAt(0, 0), W);
  const target = quadAt(500, 300);
  for (let i = 0; i < 60; i++) t.update(target, W);
  assert.ok(dist(t.corners[0], target[0]) < 0.5, "converge al objetivo");
});

test("rechaza un teletransporte aislado y acepta el reposicionamiento sostenido", () => {
  const t = new FrameTracker();
  const home = quadAt(100, 100);
  t.update(home, W);
  const before = { ...t.corners[0] };

  const far = quadAt(100 + W * 0.6, 100);
  t.update(far, W);
  assert.deepEqual(t.corners[0], before, "un salto de un cuadro se ignora");

  // Si el salto persiste, es una recolocación real de las manos.
  t.update(far, W);
  assert.ok(t.corners[0].x > before.x + 100, "el salto sostenido sí se acepta");
});

test("el rechazo de saltos no apaga el efecto por sí solo", () => {
  const t = new FrameTracker();
  t.update(quadAt(100, 100), W);
  for (let i = 0; i < 10; i++) t.update(quadAt(100, 100), W);
  const p = t.presence;
  // Saltos alternos: siempre rechazados, nunca dos seguidos.
  for (let i = 0; i < 10; i++) {
    t.update(quadAt(100 + W * 0.5, 100), W);
    t.update(quadAt(100, 100), W);
  }
  assert.ok(t.presence >= p * 0.9, "la presencia se mantiene");
  assert.ok(t.active);
});

test("reset deja el tracker como recién creado", () => {
  const t = new FrameTracker();
  t.update(quadAt(10, 10), W);
  t.reset();
  assert.equal(t.corners, null);
  assert.equal(t.presence, 0);
  assert.equal(t.active, false);
  assert.equal(t.visible, false);
});

test("el tracker sigue el marco de demostración cuadro a cuadro", () => {
  const t = new FrameTracker();
  let seen = 0;
  for (let f = 0; f < 120; f++) {
    const hands = makeFakeHands(f / 30);
    t.update(computeQuad(hands, { width: W, height: H, active: t.active }), W);
    if (t.visible) seen++;
  }
  assert.ok(seen > 100, `el marco debe estar visible casi siempre (fue ${seen}/120)`);
  assert.equal(t.presence, 1);
  // Y el cuadrilátero suavizado sigue siendo grande y centrado.
  const c = centroid(t.corners);
  assert.ok(c.x > W * 0.3 && c.x < W * 0.7, "centrado en horizontal");
  assert.ok(polygonArea(t.corners) > W * H * 0.05, "con área de marco de verdad");
});

// ------------------------------------------------------- mapeo 16:9 ↔ cuadro
group("Mapeo 16:9 ↔ cuadrado (backend klein)");

test("aplastar y estirar de vuelta devuelve el mismo punto", () => {
  const SIZE = 768;
  for (const p of [
    { x: 0, y: 0 },
    { x: W, y: H },
    { x: 640, y: 360 },
    { x: 1279, y: 12 },
  ]) {
    const sq = squashPoint(p, W, H, SIZE);
    const back = unsquashPoint(sq, SIZE, W, H);
    assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  }
});

test("aplastar cubre todo el encuadre, no recorta el centro", () => {
  const SIZE = 768;
  const corner = squashPoint({ x: W, y: H }, W, H, SIZE);
  assert.deepEqual(corner, { x: SIZE, y: SIZE });
  // La esquina extrema del 16:9 sigue dentro del cuadro: el marco de dedos
  // puede estar en cualquier parte y siempre hay mundo IA detrás.
  const edge = squashPoint({ x: W, y: 0 }, W, H, SIZE);
  assert.ok(edge.x <= SIZE && edge.y >= 0);
});

test("la deformación es la esperada: horizontal comprimida, vertical estirada", () => {
  const SIZE = 768;
  const a = squashPoint({ x: 0, y: 0 }, W, H, SIZE);
  const b = squashPoint({ x: 100, y: 100 }, W, H, SIZE);
  assert.ok(b.x - a.x < 100, "100 px horizontales ocupan menos en el cuadrado");
  assert.ok(b.y - a.y > 100, "100 px verticales ocupan más");
  // Y el producto de las dos escalas conserva el área relativa del cuadro.
  const ratio = ((b.x - a.x) / 100) * ((b.y - a.y) / 100);
  assert.ok(Math.abs(ratio - (SIZE * SIZE) / (W * H)) < 1e-9);
});

// ------------------------------------------------------------------ estilos
group("Estilos");

test("hay ocho estilos con tecla más el personalizado", () => {
  assert.equal(STYLES.length, 9);
  assert.equal(STYLES[8].id, "custom", "el personalizado va al final");
  assert.equal(new Set(STYLES.map((s) => s.id)).size, 9, "sin identificadores repetidos");
});

test("cada estilo con backend trae prompt del fraseo correcto", () => {
  for (const s of STYLES.slice(0, 8)) {
    assert.ok(s.prompt, `${s.id} necesita prompt`);
    assert.ok(s.filter, `${s.id} necesita filtro local de respaldo`);
    if (s.backend === "lucy") {
      assert.ok(
        s.prompt.startsWith("Change the style of the video to"),
        `${s.id} debe seguir la plantilla de Decart`
      );
    } else {
      assert.ok(s.prompt.startsWith("Turn this into"), `${s.id} debe usar fraseo de edición`);
    }
  }
});

// Lo que comparten los dos estilos de la marca: es ELLA, no una chica
// cualquiera, sobre el rosa de la marca y con pollitos alrededor.
const SENAS_POLLITO = [
  "this exact woman",
  "same face",
  "red wavy hair",
  "bubblegum pink",
  "chick",
];

test("los dos estilos de la marca son de klein, que es el barato", () => {
  for (const id of ["pollito", "pollito-3d"]) {
    assert.equal(findStyle(id).backend, "klein", `${id} no puede ir por Lucy`);
  }
  assert.equal(DEFAULT_STYLE_ID, "pollito");
  // Ningún estilo de la marca debe colarse a Lucy, que cuesta 20 veces más.
  const caros = STYLES.filter((s) => s.backend === "lucy").map((s) => s.id);
  assert.deepEqual(caros, ["anime", "cyberpunk", "personaje3d"]);
});

test("los dos piden que siga siendo ella, con su mundo detrás", () => {
  for (const id of ["pollito", "pollito-3d"]) {
    const p = findStyle(id).prompt.toLowerCase();
    for (const word of SENAS_POLLITO) {
      assert.ok(p.includes(word), `a ${id} le falta «${word}»`);
    }
  }
});

test("el 7 y el 8 se diferencian en el acabado, plano contra volumen", () => {
  const plano = findStyle("pollito").prompt.toLowerCase();
  const volumen = findStyle("pollito-3d").prompt.toLowerCase();
  assert.ok(plano.includes("flat cel") && plano.includes("brown outline"));
  assert.ok(volumen.includes("3d") && !volumen.includes("flat cel"));
});

test("el estilo personalizado hereda backend y prompt del panel", () => {
  const custom = findStyle("custom");
  assert.equal(backendFor(custom, "lucy"), "lucy");
  assert.equal(backendFor(custom, "klein"), "klein");
  assert.equal(
    promptFor(custom, { customPrompt: "  Turn this into lava  ", customBackend: "klein" }),
    "Turn this into lava"
  );
  // Sin prompt libre, cae a un texto sensato según el backend.
  assert.ok(promptFor(custom, { customPrompt: "", customBackend: "lucy" }).startsWith("Change"));
  assert.ok(promptFor(custom, { customPrompt: "", customBackend: "klein" }).startsWith("Turn"));
});

test("findStyle no explota con un identificador desconocido", () => {
  assert.equal(findStyle("no-existe").id, STYLES[0].id);
});

// ------------------------------------------------------------- modo ahorro
group("Modo ahorro (no generar sin marco)");

/** Manager con reloj falso y sesiones de mentira: no toca red ni DOM. */
function fakeManager({ backend, economy = true } = {}) {
  let t = 0;
  const status = [];
  const m = new BackendManager({
    lucyVideo: {},
    captureSource: null,
    onStatus: (state, text) => status.push([state, text]),
    economy,
    clock: () => t,
  });
  m.apiKey = "clave-de-mentira";
  m.backend = backend;
  if (backend === "klein") m.kleinSession = { send() {} };
  if (backend === "lucy") m.lucySession = { dispose() {} };
  m.resumed = 0;
  m.resumeLucy = async () => {
    m.resumed++;
    m.lucySession = { dispose() {} };
  };
  return { m, status, advance: (ms) => (t += ms) };
}

test("demandActive sostiene la generación durante la cola y luego la suelta", () => {
  assert.equal(demandActive(true, 0, 99999, 1500), true, "con gesto, siempre");
  assert.equal(demandActive(false, 1000, 2000, 1500), true, "dentro de la cola");
  assert.equal(demandActive(false, 1000, 3000, 1500), false, "pasada la cola");
});

test("klein se pausa al soltar el marco y reanuda al rehacerlo", () => {
  const { m, advance } = fakeManager({ backend: "klein" });
  m.setDemand(true);
  assert.equal(m.kleinPaused, false);

  m.setDemand(false);
  assert.equal(m.kleinPaused, false, "una cola corta evita parpadeos por dropout");
  advance(KLEIN_IDLE_TAIL_MS + 1);
  m.setDemand(false);
  assert.equal(m.kleinPaused, true, "sin marco de verdad, se pausa");

  m.setDemand(true);
  assert.equal(m.kleinPaused, false, "y reanuda en el mismo cuadro");
});

test("en pausa no se manda ni un cuadro, y el último se conserva", () => {
  const { m } = fakeManager({ backend: "klein" });
  let sent = 0;
  m.kleinSession = { send: () => sent++ };
  m.captureSource = { readyState: 4 };
  m.kleinCanvas = null; // si intentara capturar, reventaría: no debe intentarlo
  m.kleinPaused = true;
  m.sendKleinFrame();
  assert.equal(sent, 0, "pausado no manda nada");
  m.kleinBitmap = "cuadro-previo";
  m.sendKleinFrame();
  assert.equal(m.kleinBitmap, "cuadro-previo", "y no descarta el último cuadro");
});

test("Lucy aguanta un rato sin gesto antes de cortar, y vuelve sola", () => {
  const { m, advance, status } = fakeManager({ backend: "lucy" });
  m.setDemand(true);
  advance(LUCY_IDLE_TAIL_MS / 2);
  m.setDemand(false);
  assert.ok(m.lucySession, "un hueco corto no corta: reconectar cuesta segundos");

  advance(LUCY_IDLE_TAIL_MS);
  m.setDemand(false);
  assert.equal(m.lucySession, null, "pasado el minuto, corta");
  assert.equal(m.lucyPausedByIdle, true);
  assert.ok(status.some(([s]) => s === "paused"));

  m.setDemand(true);
  assert.equal(m.resumed, 1, "y se reanuda al volver a hacer el marco");
  assert.equal(m.lucyPausedByIdle, false);
});

test("con el ahorro apagado no se pausa nunca", () => {
  const { m, advance } = fakeManager({ backend: "klein", economy: false });
  m.setDemand(true);
  advance(60 * 60 * 1000);
  m.setDemand(false);
  assert.equal(m.kleinPaused, false);
});

test("apagar el ahorro en caliente deshace la pausa y reconecta Lucy", () => {
  const { m, advance } = fakeManager({ backend: "lucy" });
  m.setDemand(true);
  advance(LUCY_IDLE_TAIL_MS + 1);
  m.setDemand(false);
  assert.equal(m.lucyPausedByIdle, true);

  m.setEconomy(false);
  assert.equal(m.lucyPausedByIdle, false);
  assert.equal(m.resumed, 1);
});

test("sin clave el ahorro no toca nada", () => {
  const { m, advance } = fakeManager({ backend: "klein" });
  m.apiKey = "";
  m.setDemand(true);
  advance(9999);
  m.setDemand(false);
  assert.equal(m.kleinPaused, false);
});

// ------------------------------------------------------ contador de gasto
group("Contador de gasto");

test("los precios son los de las fichas de fal", () => {
  assert.equal(PRECIOS_USD.lucy, 0.04, "por segundo conectado");
  assert.equal(PRECIOS_USD.klein, 0.00194, "por segundo de cómputo");
  // Lo que justifica que klein sea el estilo por defecto.
  assert.ok(PRECIOS_USD.lucy > PRECIOS_USD.klein * 15, "Lucy es un orden de magnitud más cara");
});

test("un minuto de Lucy cuesta 2,40 y uno de klein 12 centavos", () => {
  const lucy = fakeManager({ backend: "lucy" });
  lucy.m.openLucyClock();
  lucy.advance(60000);
  assert.ok(Math.abs(lucy.m.spend.usd - 2.4) < 1e-9, `fue ${lucy.m.spend.usd}`);

  const klein = fakeManager({ backend: "klein" });
  klein.m.openKleinClock();
  klein.advance(60000);
  assert.ok(Math.abs(klein.m.spend.usd - 0.1164) < 1e-9, `fue ${klein.m.spend.usd}`);
});

test("en pausa el contador no corre: eso es lo que ahorra el modo ahorro", () => {
  const { m, advance } = fakeManager({ backend: "klein" });
  m.openKleinClock();
  advance(10000); // 10 s generando
  advance(0);
  m.setDemand(false);
  advance(KLEIN_IDLE_TAIL_MS + 1);
  m.setDemand(false); // aquí se pausa y se cierra el reloj
  const alPausar = m.spend.usd;
  advance(600000); // diez minutos con la pestaña abierta y sin gesto
  assert.equal(m.spend.usd, alPausar, "sin marco no se gasta nada");

  m.setDemand(true); // vuelve el marco
  advance(10000);
  assert.ok(m.spend.usd > alPausar, "y al volver, vuelve a contar");
});

test("el reloj acumula tramos y no cuenta dos veces al abrirlo repetido", () => {
  const { m, advance } = fakeManager({ backend: "lucy" });
  m.openLucyClock();
  advance(5000);
  m.openLucyClock(); // abrir de nuevo no debe reiniciar ni duplicar
  advance(5000);
  m.closeLucyClock();
  advance(90000); // cerrado: no corre
  assert.ok(Math.abs(m.spend.lucySeconds - 10) < 1e-9, `fueron ${m.spend.lucySeconds} s`);
  m.closeLucyClock(); // cerrar dos veces tampoco suma
  assert.ok(Math.abs(m.spend.lucySeconds - 10) < 1e-9);
});

// -------------------------------------------------------------- indicadores
group("Indicadores");

test("FpsMeter mide sobre una ventana deslizante", () => {
  const m = new FpsMeter(2000);
  for (let i = 0; i <= 120; i++) m.tick(i * (1000 / 60)); // 60 fps durante 2 s
  assert.ok(Math.abs(m.fps - 60) < 1, `debería rondar 60, fue ${m.fps.toFixed(2)}`);
  m.reset();
  assert.equal(m.fps, 0);
});

test("withAlpha convierte hexadecimal a rgba", () => {
  assert.equal(withAlpha("#ff2e88", 0.5), "rgba(255, 46, 136, 0.500)");
  assert.equal(withAlpha("#ff2e88", 2), "rgba(255, 46, 136, 1.000)");
  assert.equal(withAlpha("rgba(0,0,0,0.2)", 0.5), "rgba(0,0,0,0.2)");
});

// ------------------------------------------------------------------ resumen
console.log(
  `\n${failures.length ? "✗" : "✓"} ${passed} prueba(s) bien, ${failures.length} mal.`
);
if (failures.length) {
  for (const f of failures) console.error(`\n${f.name}:\n${f.err.stack}`);
  process.exit(1);
}
