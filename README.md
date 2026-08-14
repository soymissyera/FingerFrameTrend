# Finger Frame IA en tiempo real · Miss Yera

Haz el gesto de marco de director con las dos manos frente a la webcam y el
área que queda dentro de tus dedos se convierte en una ventana a un mundo
generado por IA en tiempo real. Las manos y el fondo son reales; solo lo que
se ve dentro del marco es el mundo IA.

Todo corre en el navegador desde una página estática: sin build, sin backend,
sin frameworks. La clave de fal la pones tú y se queda en tu navegador.

**En vivo:** <https://soymissyera.github.io/mundo-pollito/>
**Modo demo, sin cámara:** <https://soymissyera.github.io/mundo-pollito/?demo>

## Cómo se prueba

En este orden, que es el que va de gratis y sin permisos a la experiencia
completa:

1. **Modo demo, sin cámara y sin clave.** Abre la página con `?demo` al final
   de la URL. Verás un feed sintético con unas manos falsas que se mueven
   solas: sirve para comprobar que el tracking y el recorte funcionan sin
   pedir permisos ni gastar un centavo. Nunca llama a la API.
2. **Cámara real, sin clave.** Abre la página normal y da permiso de cámara.
   Haz el marco con los dedos: dentro verás un filtro local de color, distinto
   por cada estilo. Sigue sin llamar a la API.
3. **Con clave de fal.** Botón de la llave, arriba a la derecha. A partir de
   ahí la ventana muestra el mundo IA de verdad.

La cámara necesita HTTPS o localhost, así que en GitHub Pages funciona.

## Los dos modelos

Cada estilo apunta a uno de los dos modelos realtime de fal, y se puede
cambiar en vivo.

- **[Decart Lucy 2.5](https://fal.ai/models/decart/lucy-2-5/realtime)** es
  video a video de verdad. Todo el encuadre se reestiliza como flujo continuo
  y queda enganchado a tu movimiento: parpadeas y la ventana parpadea. Va
  mejor para transformaciones realistas de ti misma (anime, cyberpunk,
  personaje 3D). El medio viaja punto a punto por WebRTC, mientras que el
  WebSocket de fal lleva la señalización y los cambios de prompt en vivo.
- **[FLUX.2 [klein]](https://fal.ai/models/fal-ai/flux-2-klein-realtime/realtime)**
  hace edición de imagen cuadro por cuadro. Cada cuadro de la cámara sube como
  JPEG y vuelve reimaginado unos pasos de difusión después. La geometría es
  más suelta y soñadora, que es justo lo que le va a los mundos creativos:
  óleo vivo, dreamworld, tinta y Mundo Pollito.

El tracking, la máscara y el contorno corren en local a la velocidad de la
pantalla, así que el marco sigue tus dedos con latencia cero aunque el modelo
vaya más lento. Los modelos ni siquiera saben que existen los dedos: reciben
el encuadre completo y el recorte es 100% local.

## Estilos

| Tecla | Estilo | Modelo |
|---|---|---|
| 1 | Anime | Lucy 2.5 |
| 2 | Cyberpunk | Lucy 2.5 |
| 3 | Personaje 3D | Lucy 2.5 |
| 4 | Óleo vivo | FLUX.2 klein |
| 5 | Dreamworld | FLUX.2 klein |
| 6 | Boceto a tinta | FLUX.2 klein |
| 7 | **Mundo Pollito** | FLUX.2 klein |
| 8 | **Pollito animado** | FLUX.2 klein |
| 9 | Personalizado | el que elijas |
| O | Ocultar o mostrar la interfaz (modo grabación) | — |
| V | Formato vertical 9:16 | — |
| + − | Zoom dentro del marco vertical | — |
| , . | Cuánto te transforma el modelo, de 1 a 6 (también con la barrita) | — |
| R | Grabar y parar | — |
| P | Encender o apagar los pollitos | — |

El **Mundo Pollito** es el estilo propio de la marca. La regla que lo define
es lo que NO cambia: quien se ponga delante sale siendo quien es, su cara, su
pelo, su ropa y su expresión, solo que dibujado. El prompt lo pide con
mayúsculas («THIS EXACT PERSON, same face, same hair») porque sin esa orden el
modelo se toma libertades y devuelve a otra persona. Detrás, el rosa bubblegum de la marca,
liso.

Los pollitos sí salen, pero no los pinta el modelo: se dibujan en local con el
archivo real de la marca (`pollito-miss-yera.jpg`), encima de la ventana y
dentro del recorte. Viene en JPEG sobre blanco, así que la app le quita el
fondo por código antes de usarlo y lo recorta al contorno. Van animados,
brincan, pasean, se asoman por el borde de abajo, dan volteretas y a veces se
duermen. Se apagan con la tecla **P**, y no cuestan nada porque no pasan por
ningún modelo.

El fondo del prompt va liso y sin pollitos, y eso costó una prueba en vivo
aprenderlo:
pidiendo «fondo rosa con pollitos», klein montó una maqueta 3D con pollitos de
plástico y la persona no aparecía por ningún lado. A tres pasos de difusión el
presupuesto no da para la escena y para quien está delante, así que se gasta
entero en lo único que importa aquí.

El prompt tampoco describe a nadie en concreto, y eso es deliberado. Describir a la
dueña del repo («melena roja ondulada») tenía dos problemas: convertía en mujer
pelirroja a cualquier otra persona que lo probara, y peleaba contra el parecido
incluso con ella, porque el día que se recogiera el pelo el modelo se lo
soltaría igual. «El mismo pelo» respeta lo que de verdad entra por la cámara,
sea quien sea. Hay una prueba que lo vigila.

Hay dos versiones, y conviene probar las dos:

- **Tecla 7:** ilustración plana, contorno marrón grueso y color de cómic.
- **Tecla 8:** el mismo mundo con acabado de película animada, con volumen y
  luz suave.

Los dos van por klein a propósito. Lucy cuesta veinte veces más y para los
estilos de la marca no compensa; los únicos que quedan en Lucy son el anime,
el cyberpunk y el personaje 3D.

Si el resultado no se te parece lo suficiente, baja los pasos de difusión con
la tecla **,**: cuantos menos pasos, más se respeta la imagen de tu cámara y
más te pareces. Con **.** subes hacia más estilo y menos parecido.

El estilo Personalizado toma el prompt libre y el modelo que elijas en el panel
de la llave.

## Grabar para redes

**Botón Grabar** en la columna derecha, o la tecla **R**. No graba la pantalla:
graba el canvas, que es el video con el efecto y nada más. Por eso el archivo
sale sin interfaz, sin puntero y sin que haga falta esconder nada, y por eso
puedes seguir tocando los controles mientras grabas sin que salgan en la toma.

Si tienes puesto el formato vertical, el archivo sale directamente en
**1080x1920** con el degradado rosa de la marca arriba y abajo, listo para
subir a Instagram o TikTok sin reencuadrar. En horizontal sale 1920x1080. Al
parar se descarga solo, con la fecha en el nombre.

El formato es mp4 si el navegador sabe codificar H.264, y webm si no. Los dos
los importa CapCut sin problema. **No lleva audio**: el canvas no tiene sonido,
así que la música se pone al editar.

Los controles viven en dos columnas a los lados, nunca encima del video: los
estilos a la izquierda, y a la derecha la llave, la barrita de transformación
y los indicadores. Así la cámara queda despejada y grabar es recortar el
rectángulo del medio. Por debajo de 1040 px de ancho no caben las columnas y
pasan a ser barras arriba y abajo.

La tecla **O** esconde toda la interfaz y deja solo el video con el marco: se
van los dos rieles, el botón de la llave y hasta el puntero del ratón. Las teclas 1 a 9 siguen cambiando de estilo con la interfaz
oculta, así que puedes cambiar de mundo a media grabación sin que se vea un
solo botón. Pulsa **O** otra vez para recuperarla.

Al ocultar aparece un aviso recordando la tecla, que se desvanece solo a los
dos segundos y medio. Espera a que se vaya antes de empezar a grabar.

### Formato vertical para TikTok e Instagram

La tecla **V** pasa a 9:16 con el rosa de la marca arriba y abajo, dejando
sitio para los títulos.

El video sigue siendo 16:9 a propósito: el gesto necesita las dos manos
separadas, y recortar a vertical las dejaría fuera de cuadro. Por eso el 16:9
se encaja dentro del 9:16 en vez de recortarse.

Con **+** y **−** se acerca el encuadre dentro del marco vertical, de 1× a
2,4×. Más zoom llena más pantalla pero recorta por los lados, y el aviso te
dice cuánto: a 1,6× recorta el 38 %. Sube el zoom hasta justo antes de que se
te salgan las manos. Si haces el marco cerca del cuerpo, aguanta más zoom.

Ponte en pantalla completa antes de grabar: en vertical el ancho del video es
el 56 % de la altura de la ventana, así que cuanta más altura, más resolución
sale en el archivo final.

Orden recomendado: deja el estilo listo, comprueba en la pastilla que está
generando, pantalla completa, V, ajusta el zoom con + y −, pulsa O, espera a
que se vaya el aviso, y recién ahí graba la pantalla (en Mac, Cmd+Shift+5,
grabando solo la porción vertical rosa).

## Tu clave de fal

Saca una clave en [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) y
pégala en el panel de la llave, arriba a la derecha.

- La clave se queda en tu navegador. Solo se guarda en `localStorage` si
  marcas "recordar"; si no, vive en `sessionStorage` y muere al cerrar la
  pestaña. Nunca está en el código.
- Se usa únicamente para acuñar tokens de sesión de corta duración con el
  cliente oficial [`@fal-ai/client`](https://github.com/fal-ai/fal-js).
- Tu video no se guarda ni se sube a ningún sitio fuera de la llamada al
  modelo. Las carpetas de capturas están en `.gitignore`.

**Costos.** Precios de las fichas de fal a 13 de agosto de 2026:

| Modelo | Precio | Por minuto |
|---|---|---|
| Lucy 2.5 | $0.04 por segundo conectada | **$2.40** |
| FLUX.2 klein | $0.00194 por segundo de cómputo | **~$0.12** |

Lucy cuesta unas veinte veces más que klein, y por eso el estilo que abre por
defecto es el de klein. La app nunca deja una sesión de Lucy abierta de fondo:
al cambiar a un estilo klein o cerrar la pestaña, se desconecta. Sin clave,
todos los estilos caen a un filtro local gratuito.

El indicador de arriba a la izquierda estima el gasto de la sesión contando el
tiempo que cada backend está trabajando de verdad. Es una estimación para no
enterarse por la factura; la cifra que manda es la del panel de fal. Si fal
cambia los precios, se cambian en `PRECIOS_USD`, en `backends.js`.

**Modo ahorro** (activado por defecto, se apaga en el panel de la llave). La
ventana solo enseña el mundo IA cuando tienes el marco hecho con los dedos,
así que generar sin gesto es tirar el dinero. Con el ahorro puesto:

- **Klein** deja de mandar cuadros al soltar el marco, con una cola de 1,5 s
  para que rehacerlo se sienta instantáneo y un hueco de tracking no provoque
  parpadeo. Se conserva el último cuadro recibido, así que al volver a
  encuadrar la ventana no salta al filtro local.
- **Lucy** aguanta 20 segundos sin gesto antes de cortar, y se reanuda sola en
  cuanto vuelves a hacer el marco. Ese plazo lo fija el precio, no la
  comodidad: reconectar por WebRTC cuesta unos segundos y molesta, pero a
  $2.40 el minuto esperar más sale mucho más caro. Es lo que evita que una
  pestaña olvidada siga facturando.

## Cómo correrlo en tu máquina

Cualquier servidor estático sirve, no hay nada que compilar:

```bash
git clone https://github.com/soymissyera/mundo-pollito.git
cd mundo-pollito
python3 -m http.server 8125
```

Y abre <http://localhost:8125>. Para el modo demo,
<http://localhost:8125/?demo>.

## Cómo está hecho

```
index.html      página única, interfaz mínima
main.js         loop de render y orquestación de las tres capas
tracking.js     geometría del marco y pipeline de robustez (lógica pura)
backends.js     clientes de Lucy (WebRTC) y klein (cuadros), tokens de fal
composite.js    canvas, recorte, contorno, indicadores
styles.js       estilos, prompts y filtros locales de respaldo
hands.js        carga de MediaPipe Hand Landmarker
demo.js         feed sintético y manos falsas del modo ?demo
ui.js           selector de estilos, panel de la clave, indicadores
tests/          pruebas de la lógica pura en Node
```

Tres capas independientes sincronizadas en un solo `requestAnimationFrame`:

1. **Tracking.** MediaPipe Hand Landmarker encuentra las dos manos por cuadro
   y el cuadrilátero pasa por un pipeline de robustez: orden anatómico de las
   esquinas, gates de separación y de área con histéresis, rechazo de
   teletransporte, suavizado adaptativo por velocidad, sostenimiento de
   dropout y fundido de presencia.
2. **Generación.** El backend elegido reestiliza el encuadre completo. Los
   estilos de Lucy abren una sesión WebRTC; cambiar de estilo es un mensaje
   por el socket de señalización, no una reconexión, y si el upstream está a
   capacidad se reintenta con backoff exponencial. Los estilos de klein
   mandan un JPEG espejado de 768x768 cada 125 ms con
   `output_feedback_strength: 0.9`, que siembra cada cuadro con parte del
   anterior para tener coherencia temporal, más una semilla fija. El cuadro
   16:9 se aplasta a cuadrado en vez de recortarse, así la distorsión se
   cancela al mostrarlo y el marco puede estar en cualquier parte del encuadre.
3. **Compositing.** La salida IA se dibuja alineada a pantalla y se revela
   solo a través del cuadrilátero con un `clip()` del canvas, con contorno
   punteado animado y puntos pulsantes en las esquinas.

## Pruebas

La lógica pura (orden de esquinas, histéresis, rechazo de saltos, suavizado,
fundido, mapeo 16:9 a cuadrado, estilos) se prueba en Node, sin dependencias:

```bash
node tests/run-tests.mjs
```

Lo visual se prueba a mano en el navegador, empezando por `?demo`.

## Referencias

Reconstruido a partir de
[blendi-remade/finger-frame-effect-fal](https://github.com/blendi-remade/finger-frame-effect-fal),
de la familia original de
[sophiamyang](https://github.com/sophiamyang/finger-frame-effect):
`finger-frame-effect`, `finger-frame-effect-ai` y `finger-frame-effect-lucy`.
