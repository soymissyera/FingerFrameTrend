// styles.js — definición de los estilos y sus prompts.
//
// Cada estilo elige uno de los dos backends realtime de fal:
//
//  - "lucy"  → Decart Lucy 2.5, video a video por WebRTC. Está enganchado a tu
//    movimiento (motion-locked): parpadeas y la ventana parpadea. Los prompts
//    siguen las plantillas de Decart: "Change the style of the video to ..."
//    con detalles visuales concretos.
//  - "klein" → FLUX.2 [klein] realtime, edición de imagen cuadro por cuadro.
//    La geometría es más libre y soñadora. Los prompts se escriben como una
//    instrucción de edición de imagen: "Turn this into ...".
//
// Los prompts van en inglés porque es el idioma con el que estos modelos
// responden mejor; la interfaz que ve la usuaria está en español.
//
// `filter` es el filtro CSS del modo local (sin clave de fal): cada estilo
// tiene su propio color para poder probar tracking y compositing gratis.

export const STYLES = [
  {
    id: "anime",
    label: "Anime",
    backend: "lucy",
    prompt:
      "Change the style of the video to hand-drawn anime: clean black line " +
      "art, flat cel shading, vibrant saturated colors, large expressive " +
      "eyes, soft painted anime background.",
    filter: "saturate(1.8) contrast(1.25) brightness(1.05)",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    backend: "lucy",
    prompt:
      "Change the style of the video to neon cyberpunk: glowing magenta and " +
      "cyan neon light on the person and the walls, rain-slick reflective " +
      "surfaces, holographic signs in the background, deep night tones.",
    filter: "hue-rotate(195deg) saturate(2) contrast(1.2)",
  },
  {
    id: "personaje3d",
    label: "Personaje 3D",
    backend: "lucy",
    prompt:
      "Change the style of the video to a 3D animated movie: stylized CGI " +
      "animation, the person as an animated character with expressive big " +
      "eyes and smooth skin, soft cinematic lighting, shallow depth of field.",
    filter: "saturate(1.35) contrast(1.15) brightness(1.08)",
  },
  {
    id: "oleo",
    label: "Óleo vivo",
    backend: "klein",
    prompt:
      "Turn this into a living oil painting: thick visible brushstrokes, " +
      "melting gold and sapphire pigments, impasto texture, museum canvas.",
    filter: "sepia(0.35) saturate(1.7) contrast(1.15)",
  },
  {
    id: "dreamworld",
    label: "Dreamworld",
    backend: "klein",
    prompt:
      "Turn this into a surreal ethereal dreamworld: floating islands, " +
      "bioluminescent plants, an aurora sky, soft glowing mist, weightless " +
      "particles of light.",
    filter: "hue-rotate(230deg) saturate(1.6) brightness(1.12)",
  },
  {
    id: "tinta",
    label: "Boceto a tinta",
    backend: "klein",
    prompt:
      "Turn this into a loose ink and watercolor sketch on textured paper, " +
      "expressive black linework, visible pen hatching, splashes of vivid " +
      "color bleeding outside the lines.",
    filter: "grayscale(0.85) contrast(1.7) brightness(1.12)",
  },
  {
    // El estilo propio de la marca Miss Yera. Este es el diferencial.
    //
    // El prompt está calcado de las referencias de la marca: contorno marrón
    // oscuro y grueso, color plano de cómic, trama de medios tonos, pollitos
    // amarillo mantequilla con mofletes rosas, y el pueblo de casas huevo con
    // techos rosas. A la persona la convierte en personaje de dibujo con la
    // capucha de pollito, conservando el pelo rojo oscuro.
    id: "pollito",
    label: "Mundo Pollito",
    backend: "klein",
    prompt:
      "Turn this into the Mundo Pollito cartoon world: bold dark brown " +
      "outlines on everything, flat cel-shaded colors, halftone dot shading, " +
      "clean sticker linework. Make the person a cute cartoon character with " +
      "big glossy eyes, pink blushed cheeks and dark red wavy hair, wearing a " +
      "butter-yellow baby chick hoodie with a small orange beak and dot eyes " +
      "on the hood. Behind, a village of egg-shaped houses with pink domed " +
      "roofs, pink and yellow triangle bunting across a bright blue sky, " +
      "fluffy white clouds, and chubby yellow baby chicks with rosy cheeks.",
    // El respaldo local se tiñe de rosa con una mezcla, no con un giro de
    // tono: así sale rosa pase lo que pase delante de la cámara.
    filter: "saturate(0.3) brightness(1.2) contrast(1.05)",
    tint: { color: "#ff2e88", mode: "color", alpha: 0.85 },
  },
  {
    // El mismo mundo de la marca, pero por Lucy: video a video enganchado al
    // movimiento. Parpadeas y el personaje parpadea. Mismas señas visuales,
    // fraseadas con la plantilla de Decart.
    //
    // Ojo: Lucy se cobra por tiempo conectado, no por cuadro. Por eso el
    // estilo por defecto sigue siendo el de klein.
    id: "pollito-lucy",
    label: "Pollito animado",
    backend: "lucy",
    prompt:
      "Change the style of the video to the Mundo Pollito cartoon world: " +
      "bold dark brown outlines on everything, flat cel-shaded colors and " +
      "halftone dot shading; the person becomes a cute cartoon character " +
      "with big glossy eyes, pink blushed cheeks and dark red wavy hair, " +
      "wearing a butter-yellow baby chick hoodie with a small orange beak " +
      "and dot eyes on the hood; behind them a village of egg-shaped houses " +
      "with pink domed roofs, pink and yellow triangle bunting and a bright " +
      "blue sky with fluffy white clouds.",
    filter: "saturate(0.35) brightness(1.18) contrast(1.08)",
    tint: { color: "#ffcf3d", mode: "color", alpha: 0.7 },
  },
  {
    // Estilo libre: prompt y backend se eligen en el panel de la clave.
    id: "custom",
    label: "Personalizado",
    backend: null,
    prompt: null,
    filter: "hue-rotate(140deg) saturate(1.6) contrast(1.1)",
  },
];

export const DEFAULT_STYLE_ID = "pollito";

export function findStyle(id) {
  return STYLES.find((s) => s.id === id) || STYLES[0];
}

/** Backend efectivo de un estilo (el personalizado hereda el elegido en el panel). */
export function backendFor(style, customBackend = "klein") {
  return style.backend ?? customBackend;
}

/** Prompt efectivo. El personalizado cae a un texto sensato si está vacío. */
export function promptFor(style, { customPrompt = "", customBackend = "klein" } = {}) {
  if (style.prompt) return style.prompt;
  if (customPrompt.trim()) return customPrompt.trim();
  return customBackend === "lucy"
    ? "Change the style of the video to a 3D animated movie."
    : "Turn this into a living oil painting.";
}

/** Etiqueta corta del backend para la interfaz. */
export function backendLabel(backend) {
  return backend === "lucy" ? "LUCY" : "KLEIN";
}
