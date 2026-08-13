// grabacion.js — grabar el efecto a un archivo, sin grabar la pantalla.
//
// Grabar la pantalla obliga a esconder la interfaz, a encuadrar a mano y se
// lleva el puntero de regalo. Aquí se graba el CANVAS, que es exactamente el
// video con el efecto y nada más: la interfaz puede quedarse a la vista
// mientras grabas porque no existe para el archivo.
//
// Y ya que se compone un cuadro aparte, se compone en 9:16 con el rosa de la
// marca arriba y abajo, así el archivo sale listo para subir sin reencuadrar.
//
// encuadreExport() es lógica pura y se prueba en Node.

export const EXPORT_VERTICAL = { w: 1080, h: 1920 };
export const EXPORT_HORIZONTAL = { w: 1920, h: 1080 };

/**
 * Dónde va el video dentro del cuadro que se exporta.
 * @returns {{lienzo:{w,h}, dx:number, dy:number, dw:number, dh:number}}
 */
export function encuadreExport({ vertical, zoom = 1, srcW, srcH }) {
  const lienzo = vertical ? EXPORT_VERTICAL : EXPORT_HORIZONTAL;
  const relacion = srcH / srcW;
  let dw, dh;
  if (vertical) {
    // A lo ancho del lienzo, con el zoom que se esté usando en pantalla.
    dw = lienzo.w * zoom;
    dh = dw * relacion;
  } else {
    // Encajar entero conservando la proporción de la cámara.
    dw = lienzo.w;
    dh = dw * relacion;
    if (dh > lienzo.h) {
      dh = lienzo.h;
      dw = dh / relacion;
    }
  }
  return {
    lienzo,
    dw,
    dh,
    dx: (lienzo.w - dw) / 2,
    dy: (lienzo.h - dh) / 2,
  };
}

/** El mejor contenedor que sepa grabar este navegador. */
export function mejorFormato(soporta = (t) => MediaRecorder.isTypeSupported(t)) {
  // Siempre con el codec explícito. "video/mp4" a secas se declara soportado
  // en navegadores que no traen codificador H.264, y devuelve un archivo con
  // contenedor pero sin video: pesa, se descarga y no lo abre nadie.
  const candidatos = [
    // mp4 primero: es lo que tragan Instagram y TikTok sin convertir.
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4;codecs=avc1.4D401E",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
  ];
  return candidatos.find((t) => soporta(t)) || "";
}

export function extensionDe(mime) {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

/** Nombre de archivo con fecha, para que no se pisen entre tomas. */
export function nombreArchivo(fecha, mime) {
  const dosDigitos = (n) => String(n).padStart(2, "0");
  const sello =
    `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}` +
    `-${dosDigitos(fecha.getHours())}${dosDigitos(fecha.getMinutes())}${dosDigitos(fecha.getSeconds())}`;
  return `mundo-pollito-${sello}.${extensionDe(mime)}`;
}

export class Grabadora {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvas  el canvas del efecto
   * @param {()=>({vertical:boolean, zoom:number})} opts.encuadre  estado actual
   * @param {(estado:string, datos?:object)=>void} opts.onEstado
   */
  constructor({ canvas, encuadre, onEstado = () => {}, fondo }) {
    this.canvas = canvas;
    this.encuadre = encuadre;
    this.onEstado = onEstado;
    this.fondo = fondo;
    this.grabando = false;
    this.inicio = 0;
    this.rec = null;
    this.trozos = [];
    this.raf = null;
    this.export = null;
  }

  get segundos() {
    return this.grabando ? (performance.now() - this.inicio) / 1000 : 0;
  }

  start() {
    if (this.grabando) return;
    if (typeof MediaRecorder === "undefined") {
      this.onEstado("error", { mensaje: "Este navegador no sabe grabar video." });
      return;
    }
    const mime = mejorFormato();
    if (!mime) {
      this.onEstado("error", { mensaje: "Este navegador no ofrece ningún formato de video." });
      return;
    }

    const { vertical, zoom } = this.encuadre();
    const plan = encuadreExport({
      vertical,
      zoom,
      srcW: this.canvas.width,
      srcH: this.canvas.height,
    });

    this.export = document.createElement("canvas");
    this.export.width = plan.lienzo.w;
    this.export.height = plan.lienzo.h;
    const ctx = this.export.getContext("2d");

    const pintar = () => {
      // Fondo de marca detrás del video, que es lo que llena el 9:16.
      ctx.fillStyle = this.fondo(ctx, plan.lienzo);
      ctx.fillRect(0, 0, plan.lienzo.w, plan.lienzo.h);
      ctx.drawImage(this.canvas, plan.dx, plan.dy, plan.dw, plan.dh);
      this.raf = requestAnimationFrame(pintar);
    };
    pintar();

    this.trozos = [];
    this.rec = new MediaRecorder(this.export.captureStream(30), {
      mimeType: mime,
      videoBitsPerSecond: 8_000_000,
    });
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.trozos.push(e.data);
    };
    this.rec.onstop = () => this.guardar(mime);
    this.rec.start();
    this.grabando = true;
    this.inicio = performance.now();
    this.onEstado("grabando", { vertical });
  }

  stop() {
    if (!this.grabando) return;
    this.grabando = false;
    cancelAnimationFrame(this.raf);
    this.raf = null;
    try {
      this.rec.stop();
    } catch (err) {
      this.onEstado("error", { mensaje: String(err?.message || err) });
    }
  }

  toggle() {
    this.grabando ? this.stop() : this.start();
  }

  guardar(mime) {
    const blob = new Blob(this.trozos, { type: mime });
    this.trozos = [];
    const nombre = nombreArchivo(new Date(), mime);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    // Soltar la memoria del video, que un minuto en 1080p no es poca.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.onEstado("guardado", { nombre, megas: blob.size / 1e6 });
  }
}
