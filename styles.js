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
    // La clave está en lo que NO cambia. En las ilustraciones de la marca ella
    // sale siendo ella (su cara, su melena roja, su ropa, su pose) solo que
    // dibujada, y el pollito es un personaje aparte que la acompaña, nunca un
    // disfraz. Así que el prompt pide un cambio de trazo, no de persona, y lo
    // dice explícitamente porque si no el modelo se toma libertades.
    //
    // Es corto a propósito: klein va a tres pasos de difusión y un prompt con
    // muchas exigencias compitiendo se le vuelve papilla.
    id: "pollito",
    label: "Mundo Pollito",
    backend: "klein",
    prompt:
      "Turn this into a cartoon illustration of THIS EXACT WOMAN: same face, " +
      "same facial features, same expression, same long red wavy hair, same " +
      "clothes, same pose. Only the drawing style changes. Bold dark brown " +
      "outlines, flat cel shading, big brown eyes with long lashes, full " +
      "glossy lips, smooth skin. Background: bright bubblegum pink filled " +
      "with cute round yellow baby chicks with brown outlines and rosy cheeks.",
    // El respaldo local se tiñe de rosa con una mezcla, no con un giro de
    // tono: así sale rosa pase lo que pase delante de la cámara.
    filter: "saturate(0.3) brightness(1.2) contrast(1.05)",
    tint: { color: "#fb8cd4", mode: "color", alpha: 0.85 },
  },
  {
    // El mismo mundo en versión película animada, y también por klein: Lucy
    // se cobra por tiempo conectado y sale carísima, así que los dos estilos
    // de la marca van por el barato. La diferencia entre el 7 y el 8 es el
    // acabado, plano de ilustración contra volumen de película.
    id: "pollito-3d",
    label: "Pollito animado",
    backend: "klein",
    prompt:
      "Turn this into a 3D animated movie character of THIS EXACT WOMAN: " +
      "same face, same facial features, same expression, same long red wavy " +
      "hair, same clothes. Soft rounded 3D shading, big glossy eyes, smooth " +
      "skin, warm cinematic light. Background: bright bubblegum pink with " +
      "fluffy round yellow baby chicks bouncing around her.",
    filter: "saturate(0.45) brightness(1.16) contrast(1.06)",
    tint: { color: "#ffcf3d", mode: "color", alpha: 0.55 },
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
