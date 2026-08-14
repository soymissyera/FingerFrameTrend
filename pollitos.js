// pollitos.js — el pollito de la marca, animado dentro del marco.
//
// El dibujo no lo inventa nadie: es el archivo real de la marca
// (pollito-miss-yera.jpg). Viene en JPEG sobre blanco, así que hay que
// recortarle el fondo antes de poder ponerlo encima del video, y de paso se
// recorta al contorno para que posicionarlo y escalarlo sea predecible.
//
// Va en local, a la velocidad de la pantalla y gratis. Pedírselo al modelo no
// funciona: klein a tres pasos devuelve pollitos de plástico distintos en cada
// cuadro, y encima se olvida de la persona por montar el decorado.
//
// La geometría y las gracias son lógica pura y se prueban en Node; el dibujo
// recibe siempre el contexto 2D.

export const SPRITE_URL = "./pollito-miss-yera.jpg?v=15";

/**
 * Punto dentro del cuadrilátero en coordenadas locales (u, v) de 0 a 1.
 * Interpolación bilineal sobre las cuatro esquinas: los pollitos se inclinan
 * con el marco en vez de flotar rectos sobre él.
 */
export function quadPoint(quad, u, v) {
  const [tl, tr, br, bl] = quad;
  const topX = tl.x + (tr.x - tl.x) * u;
  const topY = tl.y + (tr.y - tl.y) * u;
  const botX = bl.x + (br.x - bl.x) * u;
  const botY = bl.y + (br.y - bl.y) * u;
  return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
}

/** Lado corto del marco, para escalar los pollitos con la ventana. */
export function quadScale(quad) {
  const [tl, tr, br, bl] = quad;
  const ancho = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2;
  const alto = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2;
  return Math.min(ancho, alto);
}

/**
 * Tamaño del pollito para un marco dado. Se usa la media geométrica de los
 * lados y no el lado corto: el marco de dedos suele salir como una franja
 * ancha y baja, y escalando por el lado corto los pollitos quedaban diminutos.
 * El tope evita que se coman una franja muy estrecha.
 */
export function tamanoPollito(quad, factor = 0.17) {
  const [tl, tr, br, bl] = quad;
  const ancho = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2;
  const alto = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2;
  return Math.min(Math.sqrt(ancho * alto) * factor, alto * 0.5);
}

// Los pollitos viven en los BORDES del marco, nunca en el centro. En el
// centro está la persona, y un pollito ahí no se lee como decorado del fondo
// sino como una pegatina encima de la cara.
// La mitad central del marco es de la persona. Antes era el 30 % y aun así
// un pollito podía caerle al hombro si ella no estaba centrada.
export const ZONA_LIBRE = 0.5;
// Y además viven en el suelo del marco, nunca a la altura de la cara.
export const SUELO = 0.62;

/** Empuja una posición horizontal fuera de la franja central. */
export function alBorde(u) {
  const medio = 0.5;
  const radio = ZONA_LIBRE / 2;
  if (u >= medio - radio && u <= medio + radio) {
    // Al borde más cercano, conservando de qué lado venía.
    return u < medio ? medio - radio : medio + radio;
  }
  return u;
}

/** Pseudoaleatorio con semilla: las pruebas necesitan repetibilidad. */
export function makeRandom(seed = 1) {
  let s = seed >>> 0 || 1;
  return function random() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Alfa de un píxel según lo blanco que sea. Devuelve 0 para el fondo, 255
 * para la tinta, y un degradado entre medias para que el borde no salga
 * dentado: el JPEG trae los bordes suavizados y comprimidos.
 */
export function alfaPorBlancura(r, g, b, bajo = 226, alto = 249) {
  const claridad = Math.min(r, g, b);
  if (claridad >= alto) return 0;
  if (claridad <= bajo) return 255;
  return Math.round(255 * (1 - (claridad - bajo) / (alto - bajo)));
}

/**
 * Quita el fondo blanco y recorta al contorno del dibujo.
 * @returns {HTMLCanvasElement}
 */
export function recortarSobreBlanco(imagen) {
  const w = imagen.naturalWidth || imagen.width;
  const h = imagen.naturalHeight || imagen.height;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(imagen, 0, 0);

  const datos = ctx.getImageData(0, 0, w, h);
  const p = datos.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = alfaPorBlancura(p[i], p[i + 1], p[i + 2]);
      p[i + 3] = a;
      if (a > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(datos, 0, 0);

  if (maxX < 0) return tmp; // todo blanco: devolver tal cual y no reventar
  const recorte = document.createElement("canvas");
  recorte.width = maxX - minX + 1;
  recorte.height = maxY - minY + 1;
  recorte
    .getContext("2d")
    .drawImage(tmp, minX, minY, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);
  return recorte;
}

/** Carga el sprite una sola vez. */
let spritePromesa = null;
export function cargarPollito(url = SPRITE_URL) {
  spritePromesa ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(recortarSobreBlanco(img));
    img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    img.src = url;
  });
  return spritePromesa;
}

export const GRACIAS = ["brinca", "pasea", "asoma", "voltereta", "duerme"];
const TAU = Math.PI * 2;

/** Un pollito con su gracia actual. update() es determinista dado el reloj. */
export class Pollito {
  constructor(random) {
    this.random = random;
    // Repartidos entre el borde izquierdo y el derecho, nunca en el centro.
    this.u = random() < 0.5 ? 0.06 + random() * 0.14 : 0.8 + random() * 0.14;
    this.v = SUELO + random() * 0.28;
    this.escala = 0.85 + random() * 0.45;
    this.mirandoIzquierda = random() < 0.5;
    this.inicio = 0;
    this.nuevaGracia(0);
  }

  nuevaGracia(ahora) {
    // "duerme" es el remate, no el estado normal.
    const pool = this.random() < 0.14 ? ["duerme"] : GRACIAS.filter((g) => g !== "duerme");
    this.gracia = pool[Math.floor(this.random() * pool.length)];
    this.inicio = ahora;
    this.duracion =
      this.gracia === "pasea" ? 3.5 + this.random() * 2.5 :
      this.gracia === "duerme" ? 3 + this.random() * 3 :
      1.6 + this.random() * 1.6;
    this.mirandoIzquierda = this.random() < 0.5;
    if (this.gracia === "pasea" || this.gracia === "voltereta") {
      // Pasean por su lado del marco, sin cruzar por delante de la persona.
      const derecha = this.random() < 0.5;
      this.uDesde = derecha ? 0.76 : 0.24;
      this.uHasta = derecha ? 0.95 : 0.05;
      this.mirandoIzquierda = !derecha;
      this.v = SUELO + this.random() * 0.26;
    }
    if (this.gracia === "asoma") {
      this.v = 1.12; // empieza fuera, por debajo del borde
      this.u = this.random() < 0.5 ? 0.06 + this.random() * 0.16 : 0.78 + this.random() * 0.16;
    }
  }

  update(ahora) {
    if (ahora - this.inicio >= this.duracion) this.nuevaGracia(ahora);
    const t = ahora - this.inicio;
    const p = Math.min(1, t / this.duracion);

    this.salto = 0;
    this.giro = 0;
    this.aplasta = 1;

    switch (this.gracia) {
      case "brinca": {
        const fase = (t * 2.2) % 1;
        this.salto = Math.sin(fase * Math.PI) * 0.9;
        this.aplasta = 1 - Math.sin(fase * Math.PI) * 0.16;
        break;
      }
      case "pasea": {
        this.u = this.uDesde + (this.uHasta - this.uDesde) * p;
        this.salto = Math.abs(Math.sin(t * 6.5)) * 0.26;
        this.mirandoIzquierda = this.uHasta < this.uDesde;
        break;
      }
      case "asoma": {
        const sube = p < 0.3 ? p / 0.3 : p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
        this.v = 1.12 - sube * 0.38;
        this.giro = Math.sin(t * 3) * 0.1;
        break;
      }
      case "voltereta": {
        if (p < 0.5) {
          this.u = this.uDesde + (this.uHasta - this.uDesde) * (p / 0.5) * 0.7;
          this.salto = Math.abs(Math.sin(t * 8)) * 0.28;
        } else {
          const q = (p - 0.5) / 0.5;
          this.giro = q * TAU * (this.mirandoIzquierda ? -1 : 1);
          this.salto = Math.sin(q * Math.PI) * 1.15;
        }
        break;
      }
      case "duerme": {
        this.aplasta = 1 + Math.sin(t * 1.5) * 0.05;
        break;
      }
    }
    this.u = alBorde(Math.min(0.95, Math.max(0.05, this.u)));
    // Nunca por encima de la mitad del marco: ahí está la cara.
    this.v = Math.max(SUELO - 0.06, this.v);
    return this;
  }
}

export class Bandada {
  constructor({ cantidad = 3, seed = 7 } = {}) {
    const random = makeRandom(seed);
    this.pollitos = Array.from({ length: cantidad }, () => new Pollito(random));
    // Desfasados, para que no hagan todos lo mismo a la vez.
    this.pollitos.forEach((p, i) => (p.inicio = -i * 0.9));
    this.sprite = null;
  }

  /**
   * Carga el sprite. Va aparte del constructor a propósito: así la bandada se
   * puede crear y simular sin navegador, que es como se prueba.
   */
  async cargar(url) {
    try {
      this.sprite = await cargarPollito(url);
    } catch (err) {
      console.error("Pollito:", err.message);
    }
    return this;
  }

  update(ahora) {
    for (const p of this.pollitos) p.update(ahora);
    return this;
  }

  draw(ctx, quad, { presence = 1, tamano = 0.17 } = {}) {
    if (!this.sprite) return; // aún cargando: no dibujar nada
    const base = tamanoPollito(quad, tamano);
    const relacion = this.sprite.height / this.sprite.width;
    for (const p of this.pollitos) {
      const pos = quadPoint(quad, p.u, p.v - p.salto * 0.12);
      const w = base * p.escala;
      const h = w * relacion;
      ctx.save();
      ctx.globalAlpha *= presence;
      ctx.translate(pos.x, pos.y);
      ctx.rotate(p.giro);
      ctx.scale(p.mirandoIzquierda ? -1 : 1, 1);
      ctx.scale(1 / p.aplasta, p.aplasta);
      // Anclado por los pies, que es lo que hace que el salto se lea.
      ctx.drawImage(this.sprite, -w / 2, -h, w, h);
      ctx.restore();
    }
  }
}
