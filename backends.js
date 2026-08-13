// backends.js — los dos clientes realtime de fal y el que decide cuál vive.
//
// Backend A · Decart Lucy 2.5 (decart/lucy-2-5/realtime)
//   Video a video realtime. El WebSocket de fal es SOLO señalización: el
//   medio viaja punto a punto por WebRTC. La cámara sube como pista y vuelve
//   la pista transformada, enganchada a tu movimiento. Cambiar de estilo es
//   un mensaje por el mismo socket, no una reconexión.
//
// Backend B · FLUX.2 [klein] (fal-ai/flux-2-klein-realtime/realtime)
//   Edición de imagen cuadro por cuadro. Sube un JPEG espejado de 768x768
//   cada 125 ms y vuelve el cuadro reinterpretado. output_feedback_strength
//   siembra cada cuadro con parte del anterior, que es lo que da coherencia
//   temporal en vez de un parpadeo psicodélico.
//
// Importante: los modelos reciben el feed COMPLETO de la cámara. Nunca saben
// que existen los dedos; el recorte es 100% local.
//
// La clave de fal solo se usa para que el cliente oficial acuñe tokens de
// sesión de corta duración. Nunca se envía a otro sitio.

const FAL_CLIENT_URL = "https://esm.sh/@fal-ai/client@1";
export const LUCY_ENDPOINT = "decart/lucy-2-5/realtime";
export const KLEIN_ENDPOINT = "fal-ai/flux-2-klein-realtime/realtime";

// Parámetros por cuadro de klein. 768 es la geometría propia del endpoint
// para image_size "square"; el feedback mantiene coherentes los cuadros
// consecutivos (1.0 = sin memoria, más bajo = más latente del cuadro previo).
export const KLEIN_FRAME_SIZE = 768;
export const KLEIN_JPEG_QUALITY = 0.5;
export const KLEIN_SEND_INTERVAL_MS = 125;
export const KLEIN_PARAMS = {
  image_size: "square",
  num_inference_steps: 3,
  seed: 35,
  output_feedback_strength: 0.9,
  schedule_mu: 2.3,
  enable_interpolation: false,
};

const LUCY_CONNECT_TIMEOUT_MS = 20000;
const LUCY_RETRY_START_MS = 5000;
const LUCY_RETRY_MAX_MS = 30000;

// Modo ahorro. La ventana solo enseña el mundo IA cuando el marco está hecho,
// así que todo lo que se genera sin gesto es plata tirada.
//
// Los dos backends se pausan distinto porque se cobran distinto:
//  - klein va por cuadro, y reanudar cuesta un cuadro: se pausa enseguida,
//    con una cola corta para que rehacer el marco se sienta instantáneo.
//  - Lucy va por tiempo conectado, pero reconectar cuesta varios segundos de
//    WebRTC: se aguanta un minuto sin gesto antes de cortar, que es lo que
//    hace falta para no cobrar una pestaña olvidada.
export const KLEIN_IDLE_TAIL_MS = 1500;
export const LUCY_IDLE_TAIL_MS = 60000;

/** ¿Hay que seguir generando? Puro, para poder probarlo. */
export function demandActive(gestureActive, lastActiveAt, now, tailMs) {
  return gestureActive || now - lastActiveAt < tailMs;
}

// El cliente oficial se carga a demanda: así el modo demo y el filtro local
// funcionan aunque el CDN de fal no cargue.
let falPromise = null;
export function loadFal() {
  falPromise ??= import(/* @vite-ignore */ FAL_CLIENT_URL).then((m) => m.fal);
  return falPromise;
}

// ---- Lucy 2.5 ----
let lucySerial = 0;

export class LucySession {
  constructor({ fal, stream, onRemoteStream, onError, onStateChange }) {
    this.fal = fal;
    this.stream = stream;
    this.onRemoteStream = onRemoteStream;
    this.onError = onError;
    this.onStateChange = onStateChange;
    this.connection = null;
    this.pc = null;
    this.disposed = false;
    this.connectTimer = null;
  }

  start(prompt) {
    if (this.disposed || this.connection) return;
    lucySerial += 1;
    this.onStateChange("connecting");
    this.connection = this.fal.realtime.connect(LUCY_ENDPOINT, {
      // Clave única por sesión: nunca se reutiliza una conexión cacheada que
      // pueda venir autorizada con una clave anterior.
      connectionKey: `lucy-${lucySerial}`,
      // La señalización no se puede estrangular: cada candidato ICE y cada
      // mensaje SDP importa por sí mismo.
      throttleInterval: 0,
      onResult: (message) => void this.handleMessage(message),
      onError: (error) =>
        this.fail(`Error de conexión con Lucy: ${error?.message || error}`),
    });
    this.connectTimer = setTimeout(() => {
      this.fail("Lucy no respondió a tiempo. Revisa tu clave de fal.");
    }, LUCY_CONNECT_TIMEOUT_MS);
    this.connection.send({ prompt, enable_prompt_expansion: true });
  }

  /** Cambio de estilo en vivo: un mensaje, sin reconectar. */
  sendPrompt(prompt) {
    if (this.disposed || !this.connection) return;
    this.connection.send({ prompt, enable_prompt_expansion: true });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.connectTimer);
    this.connectTimer = null;
    this.pc?.close();
    this.pc = null;
    this.connection?.close();
    this.connection = null;
    this.onStateChange("idle");
  }

  fail(message) {
    if (this.disposed) return;
    this.onError(message);
    this.dispose();
  }

  async handleMessage(message) {
    if (this.disposed || !message) return;
    try {
      switch (message.type) {
        case "iceservers":
        case "iceServers": {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
          await this.setupPeer(message);
          break;
        }
        case "answer":
          if (!this.pc || !message.sdp) return;
          await this.pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
          break;
        case "icecandidate":
          if (!this.pc || !message.candidate) return;
          await this.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          break;
        case "error": {
          const detail = `Lucy devolvió un error: ${message.error ?? "desconocido"}`;
          // Antes del arranque WebRTC un error es fatal para la sesión; ya en
          // vivo, los errores de edición son recuperables.
          if (!this.pc) this.fail(detail);
          else this.onError(detail);
          break;
        }
        default:
          // ready / acks / tipos desconocidos: se ignoran a propósito.
          break;
      }
    } catch (err) {
      this.fail(err?.message || String(err));
    }
  }

  async setupPeer(message) {
    if (this.pc) return; // mensaje iceservers duplicado
    // La lista de servidores ICE se ha visto con varias grafías.
    const entries =
      message.iceservers ?? message.iceServers ?? message.ice_servers ?? [];
    const pc = new RTCPeerConnection({
      iceServers: entries.map((s) => ({
        urls: s.urls,
        username: s.username,
        credential: s.credential,
      })),
    });
    this.pc = pc;
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);

    pc.ontrack = (event) => {
      if (this.disposed || this.pc !== pc) return;
      const remote = event.streams[0];
      if (!remote) return;
      this.onStateChange("open");
      this.onRemoteStream(remote);
    };
    pc.onicecandidate = (event) => {
      if (this.disposed || this.pc !== pc || !event.candidate) return;
      this.connection?.send({
        type: "icecandidate",
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        },
      });
    };

    const offer = await pc.createOffer();
    if (this.disposed || this.pc !== pc) return;
    await pc.setLocalDescription(offer);
    if (this.disposed || this.pc !== pc) return;
    this.connection?.send({ type: "offer", sdp: offer.sdp });
  }
}

// ---- FLUX.2 [klein] ----
let kleinSerial = 0;

export class KleinSession {
  constructor({ fal, onFrame, onError, onStateChange }) {
    this.fal = fal;
    this.onFrame = onFrame;
    this.onError = onError;
    this.onStateChange = onStateChange;
    this.connection = null;
    this.disposed = false;
    this.open = false;
    this.lastSentAt = null;
  }

  send(input) {
    if (this.disposed) return;
    if (!this.connection) {
      kleinSerial += 1;
      this.onStateChange("connecting");
      this.connection = this.fal.realtime.connect(KLEIN_ENDPOINT, {
        connectionKey: `klein-${kleinSerial}`,
        throttleInterval: KLEIN_SEND_INTERVAL_MS,
        maxBuffering: 2,
        onResult: (result) => this.handleResult(result),
        onError: (error) => {
          // Soltar la conexión para que el siguiente envío se autentique de
          // cero: cerrar durante la autenticación puede dejar varado un token.
          this.connection?.close();
          this.connection = null;
          this.open = false;
          this.onStateChange("idle");
          this.onError(`Se perdió la conexión con klein (${error?.message || error})`);
        },
      });
    }
    this.lastSentAt = performance.now();
    this.connection.send(input);
  }

  handleResult(result) {
    if (this.disposed) return;
    if (!this.open) {
      this.open = true;
      this.onStateChange("open");
    }
    const image = result?.images?.[result.images.length - 1];
    const content = image?.content;
    if (content == null) return;

    let bytes;
    if (content instanceof Uint8Array) bytes = content;
    else if (content instanceof ArrayBuffer) bytes = new Uint8Array(content);
    else if (typeof content === "string" && content.length > 0) {
      const bin = atob(content);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else return;

    const latency =
      this.lastSentAt != null ? performance.now() - this.lastSentAt : 0;
    this.onFrame(bytes, image.content_type || "image/jpeg", Math.round(latency));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.connection?.close();
    this.connection = null;
    this.onStateChange("idle");
  }
}

/**
 * Reconcilia las sesiones vivas con el estilo elegido: exactamente un backend
 * conectado a la vez, y ninguno si no hay clave.
 *
 * Regla de costo, no negociable: Lucy se cobra por tiempo conectado, así que
 * jamás se queda una sesión Lucy abierta de fondo. Al pasar a un estilo klein
 * o al cerrar la pestaña, se desconecta.
 */
export class BackendManager {
  constructor({
    lucyVideo,
    captureSource,
    onStatus = () => {},
    onMetrics = () => {},
    economy = true,
    clock = () => performance.now(),
  }) {
    this.lucyVideo = lucyVideo;
    this.captureSource = captureSource;
    this.onStatus = onStatus;
    this.onMetrics = onMetrics;
    /** Modo ahorro: pausar la generación cuando no hay marco. */
    this.economy = economy;
    this.clock = clock;

    /** ¿Hay marco hecho ahora mismo? Lo actualiza el loop cada cuadro. */
    this.gestureActive = false;
    this.lastActiveAt = -Infinity;
    this.kleinPaused = false;
    this.lucyPausedByIdle = false;

    this.apiKey = "";
    this.cameraStream = null;
    this.backend = null;
    this.prompt = "";

    this.lucySession = null;
    this.lucyLive = false;
    this.lucyRetryTimer = null;
    this.lucyRetryDelayMs = LUCY_RETRY_START_MS;

    this.kleinSession = null;
    this.kleinBitmap = null;
    this.kleinDecoding = false;
    this.kleinTimer = null;
    this.kleinCanvas = null;
    this.kleinLatencyMs = 0;
    this.kleinFrameTimes = [];
  }

  setKey(key) {
    this.apiKey = (key || "").trim();
  }

  /**
   * Lo llama el loop en cada cuadro con el estado real del gesto. Es el único
   * sitio donde se decide pausar o reanudar la generación.
   */
  setDemand(gestureActive) {
    const now = this.clock();
    this.gestureActive = gestureActive;
    if (gestureActive) this.lastActiveAt = now;
    if (!this.economy || !this.apiKey) return;

    if (this.backend === "klein" && this.kleinSession) {
      const wanted = demandActive(gestureActive, this.lastActiveAt, now, KLEIN_IDLE_TAIL_MS);
      if (!wanted && !this.kleinPaused) {
        this.kleinPaused = true;
        this.onStatus("paused", "KLEIN EN PAUSA · AHORRO");
      } else if (wanted && this.kleinPaused) {
        this.kleinPaused = false;
        this.onStatus("live", "KLEIN · GENERANDO…");
      }
      return;
    }

    if (this.backend === "lucy") {
      const wanted = demandActive(gestureActive, this.lastActiveAt, now, LUCY_IDLE_TAIL_MS);
      if (!wanted && this.lucySession) {
        this.stopLucy();
        this.lucyPausedByIdle = true;
        this.onStatus("paused", "LUCY EN PAUSA · AHORRO");
      } else if (wanted && this.lucyPausedByIdle) {
        this.lucyPausedByIdle = false;
        void this.resumeLucy();
      }
    }
  }

  /** Enciende o apaga el ahorro en caliente, sin perder la sesión. */
  setEconomy(on) {
    this.economy = !!on;
    if (this.economy) return;
    // Al apagarlo, deshacer cualquier pausa que siguiera puesta.
    this.kleinPaused = false;
    if (this.lucyPausedByIdle) {
      this.lucyPausedByIdle = false;
      void this.resumeLucy();
    }
  }

  async resumeLucy() {
    if (this.backend !== "lucy" || !this.apiKey || this.lucySession) return;
    try {
      this.startLucy(await loadFal());
    } catch (err) {
      this.onStatus("error", `No se pudo reanudar Lucy: ${err?.message || err}`);
    }
  }

  setCamera(stream) {
    this.cameraStream = stream;
  }

  get hasKey() {
    return !!this.apiKey;
  }

  /** ¿Hay salida IA lista para dibujar en la ventana? */
  get ready() {
    if (this.backend === "lucy") {
      return this.lucyLive && this.lucyVideo.readyState >= 2;
    }
    if (this.backend === "klein") return !!this.kleinBitmap;
    return false;
  }

  /**
   * Pide el estado deseado. Si el backend no cambia y solo cambia el prompt,
   * Lucy lo recibe en vivo por el socket.
   */
  async apply({ backend, prompt }) {
    const backendChanged = backend !== this.backend;
    this.backend = backend;
    this.prompt = prompt;

    if (!backend || !this.apiKey) {
      this.stopAll();
      return;
    }

    let fal;
    try {
      fal = await loadFal();
      fal.config({ credentials: this.apiKey });
    } catch (err) {
      this.onStatus("error", `No se pudo cargar el cliente de fal: ${err?.message || err}`);
      return;
    }
    // Mientras se cargaba el cliente la usuaria pudo cambiar de estilo.
    if (this.backend !== backend) return;

    if (backend === "lucy") {
      this.stopKlein();
      if (this.lucySession) this.lucySession.sendPrompt(prompt);
      else if (!this.lucyPausedByIdle) this.startLucy(fal);
    } else {
      this.lucyPausedByIdle = false;
      this.stopLucy();
      if (!this.kleinSession) this.startKlein(fal);
      else if (backendChanged) this.onStatus("connecting", "KLEIN · CONECTANDO…");
    }
  }

  stopAll() {
    this.lucyPausedByIdle = false;
    this.stopLucy();
    this.stopKlein();
    this.onStatus("idle", "");
  }

  // ---- Lucy ----
  startLucy(fal) {
    if (this.lucySession || !this.apiKey || !this.cameraStream) return;
    this.onStatus("connecting", "LUCY · CONECTANDO…");
    const session = new LucySession({
      fal,
      stream: this.cameraStream,
      onRemoteStream: (stream) => {
        this.lucyVideo.srcObject = stream;
        this.lucyVideo.play().catch(() => {});
        this.lucyLive = true;
        this.lucyRetryDelayMs = LUCY_RETRY_START_MS;
        this.onStatus("live", "EN VIVO · LUCY 2.5");
      },
      onError: (message) => {
        console.error(message);
        if (!this.lucyLive) this.onStatus("error", "IA FUERA DE LÍNEA: " + message);
      },
      onStateChange: (state) => {
        if (state !== "idle") return;
        this.lucyLive = false;
        // Sigue siendo la sesión actual → se murió sola (capacidad, timeout,
        // cierre del upstream) y no por stopLucy. Reintentar con backoff.
        if (this.lucySession === session) {
          this.lucySession = null;
          this.lucyVideo.srcObject = null;
          this.scheduleLucyRetry();
        }
      },
    });
    this.lucySession = session;
    session.start(this.prompt);
  }

  scheduleLucyRetry() {
    if (this.lucyRetryTimer || this.backend !== "lucy" || !this.apiKey) return;
    const secs = Math.round(this.lucyRetryDelayMs / 1000);
    this.onStatus("connecting", `LUCY OCUPADO · REINTENTO EN ${secs} S`);
    this.lucyRetryTimer = setTimeout(async () => {
      this.lucyRetryTimer = null;
      if (this.backend !== "lucy" || this.lucySession) return;
      try {
        this.startLucy(await loadFal());
      } catch (err) {
        this.onStatus("error", `No se pudo reconectar: ${err?.message || err}`);
      }
    }, this.lucyRetryDelayMs);
    this.lucyRetryDelayMs = Math.min(this.lucyRetryDelayMs * 1.6, LUCY_RETRY_MAX_MS);
  }

  stopLucy() {
    clearTimeout(this.lucyRetryTimer);
    this.lucyRetryTimer = null;
    this.lucyRetryDelayMs = LUCY_RETRY_START_MS;
    // Limpiar la referencia ANTES de disponer, para que el callback "idle" de
    // la sesión distinga una parada deliberada de una caída del upstream.
    const session = this.lucySession;
    this.lucySession = null;
    session?.dispose();
    this.lucyLive = false;
    if (this.lucyVideo) this.lucyVideo.srcObject = null;
  }

  // ---- klein ----
  startKlein(fal) {
    if (this.kleinSession || !this.apiKey) return;
    this.onStatus("connecting", "KLEIN · CONECTANDO…");
    this.kleinFrameTimes = [];
    this.kleinSession = new KleinSession({
      fal,
      onFrame: (bytes, contentType, latencyMs) =>
        void this.handleKleinFrame(bytes, contentType, latencyMs),
      onError: (message) => {
        console.error(message);
        if (!this.kleinBitmap) this.onStatus("error", "IA FUERA DE LÍNEA: " + message);
      },
      onStateChange: () => {},
    });
    this.kleinCanvas ??= document.createElement("canvas");
    this.kleinCanvas.width = KLEIN_FRAME_SIZE;
    this.kleinCanvas.height = KLEIN_FRAME_SIZE;
    this.kleinTimer = setInterval(() => this.sendKleinFrame(), KLEIN_SEND_INTERVAL_MS);
  }

  async handleKleinFrame(bytes, contentType, latencyMs) {
    this.kleinLatencyMs = latencyMs;
    const now = performance.now();
    this.kleinFrameTimes.push(now);
    while (this.kleinFrameTimes.length && now - this.kleinFrameTimes[0] > 2000) {
      this.kleinFrameTimes.shift();
    }
    // Si el cuadro anterior sigue decodificando, este se descarta: más vale
    // saltarse un cuadro que acumular cola y latencia.
    if (this.kleinDecoding) return;
    this.kleinDecoding = true;
    try {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: contentType }));
      if (this.kleinSession) {
        this.kleinBitmap?.close?.();
        this.kleinBitmap = bitmap;
        const fps = this.kleinFrameTimes.length / 2;
        this.onStatus("live", `EN VIVO · KLEIN · ${fps.toFixed(1)} fps · ${this.kleinLatencyMs} ms`);
        this.onMetrics({ fps, latencyMs: this.kleinLatencyMs });
      } else {
        bitmap.close?.();
      }
    } catch (err) {
      console.error("No se pudo decodificar el cuadro de klein:", err);
    } finally {
      this.kleinDecoding = false;
    }
  }

  sendKleinFrame() {
    const src = this.captureSource;
    if (!this.kleinSession || !src || src.readyState < 2) return;
    // Modo ahorro: sin marco no se genera nada. Se conserva el último cuadro
    // recibido, así que al rehacer el gesto la ventana no parpadea a filtro.
    if (this.economy && this.kleinPaused) return;
    const c = this.kleinCanvas.getContext("2d");
    // Se captura en espejo, igual que el canvas en pantalla, para que el
    // cuadro que vuelve se dibuje directo sin otro volteo.
    c.save();
    c.translate(KLEIN_FRAME_SIZE, 0);
    c.scale(-1, 1);
    c.drawImage(src, 0, 0, KLEIN_FRAME_SIZE, KLEIN_FRAME_SIZE);
    c.restore();
    const dataUri = this.kleinCanvas.toDataURL("image/jpeg", KLEIN_JPEG_QUALITY);
    this.kleinSession.send({
      prompt: this.prompt,
      image_url: dataUri,
      ...KLEIN_PARAMS,
    });
  }

  stopKlein() {
    clearInterval(this.kleinTimer);
    this.kleinTimer = null;
    this.kleinPaused = false;
    this.kleinSession?.dispose();
    this.kleinSession = null;
    this.kleinBitmap?.close?.();
    this.kleinBitmap = null;
    this.kleinFrameTimes = [];
    this.kleinLatencyMs = 0;
  }
}
