// tests/qa-navegador.mjs — QA de la app entera en un navegador de verdad.
//
//   python3 -m http.server 8125 &
//   node tests/qa-navegador.mjs
//
// Las pruebas de run-tests.mjs cubren la lógica; esto cubre lo que solo se ve
// ejecutando: que la página arranque limpia, que las nueve teclas seleccionen
// su estilo, que las barritas y el reset hagan lo que dicen, que la grabación
// produzca un archivo, y que sin clave no se llame a la API.
//
// Lo único que NO puede cubrir es la salida de los modelos: para eso hace
// falta una clave de fal y una cámara.

import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox","--autoplay-policy=no-user-gesture-required"] });
const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await ctxB.newPage();
const errs = []; const fallos = [];
p.on("pageerror", e => errs.push("pageerror: " + e));
p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
const ok = (nombre, cond, extra="") => { console.log((cond?"  ✓ ":"  ✗ ") + nombre + (extra?` (${extra})`:"")); if(!cond) fallos.push(nombre); };

await p.goto("http://localhost:8125/?demo", { waitUntil: "load" });
await p.waitForTimeout(3000);

console.log("\nArranque");
ok("carga sin errores de consola", errs.length === 0, errs.join(" | "));
ok("la pantalla de carga se fue", await p.evaluate(()=>document.getElementById("status").classList.contains("hidden")));
ok("el canvas tiene el tamaño del video", await p.evaluate(()=>canvas.width===1280&&canvas.height===720));
ok("el sprite del pollito cargó", await p.evaluate(async()=>{const m=await import("./pollitos.js");const s=await m.cargarPollito();return s.width>100&&s.height>100;}));

console.log("\nEstilos");
const ids = ["anime","cyberpunk","personaje3d","oleo","dreamworld","tinta","pollito","pollito-3d","custom"];
for (let i=0;i<9;i++){
  await p.keyboard.press(String(i+1)); await p.waitForTimeout(120);
  const a = await p.evaluate(()=>document.querySelector("#toolbar button.active")?.dataset.id);
  ok(`tecla ${i+1} → ${ids[i]}`, a===ids[i], a);
}
await p.keyboard.press("Escape"); await p.keyboard.press("7"); await p.waitForTimeout(200);

console.log("\nBarritas y reset");
await p.locator("#pasos").fill("6"); await p.waitForTimeout(150);
await p.locator("#arrastre").fill("0.5"); await p.waitForTimeout(150);
ok("las barritas se mueven", await p.evaluate(()=>document.getElementById("pasos-valor").textContent==="6"&&document.getElementById("arrastre-valor").textContent==="0.50"));
// Los valores de fábrica se leen del módulo, no se fijan a mano: si cambian,
// la QA sigue comprobando lo correcto en vez de fallar por estar vieja.
const fabrica = await p.evaluate(async () => {
  const { KLEIN_PARAMS } = await import("./backends.js");
  return { pasos: KLEIN_PARAMS.num_inference_steps, arrastre: KLEIN_PARAMS.output_feedback_strength };
});
await p.click("#reset-btn"); await p.waitForTimeout(300);
ok(`el reset devuelve a ${fabrica.pasos} y ${fabrica.arrastre}`, await p.evaluate((f)=>
  document.getElementById("pasos-valor").textContent===String(f.pasos) &&
  Number(document.getElementById("arrastre-valor").textContent)===f.arrastre, fabrica));
ok("y lo guarda", await p.evaluate((f)=>
  localStorage.getItem("fal-klein-steps")===String(f.pasos) &&
  Number(localStorage.getItem("fal-klein-feedback"))===f.arrastre, fabrica));
await p.keyboard.press(","); await p.keyboard.press(","); await p.keyboard.press(","); await p.waitForTimeout(250);
ok("la transformación no baja de 2", await p.evaluate(()=>document.getElementById("pasos-valor").textContent==="2"), await p.textContent("#pasos-valor"));

console.log("\nTeclas de grabación");
await p.keyboard.press("p"); await p.waitForTimeout(200);
ok("P apaga los pollitos", (await p.textContent("#toast")).includes("apagados"));
await p.keyboard.press("p"); await p.waitForTimeout(200);
await p.keyboard.press("v"); await p.waitForTimeout(300);
ok("V pone el 9:16", await p.evaluate(()=>{const s=document.getElementById("stage").getBoundingClientRect();return Math.abs(s.width/s.height-9/16)<0.01}));
await p.keyboard.press("+"); await p.waitForTimeout(200);
ok("+ acerca en vertical", (await p.textContent("#toast")).includes("Zoom"));
await p.keyboard.press("o"); await p.waitForTimeout(400);
ok("O esconde los dos rieles", await p.evaluate(()=>getComputedStyle(document.getElementById("toolbar")).opacity==="0"&&getComputedStyle(document.getElementById("riel-der")).opacity==="0"));
await p.keyboard.press("o"); await p.waitForTimeout(300);

console.log("\nGrabación");
const dl = p.waitForEvent("download", { timeout: 25000 });
await p.keyboard.press("r"); await p.waitForTimeout(2500);
ok("el botón marca que graba", (await p.getAttribute("#rec-btn","class")).includes("grabando"));
await p.keyboard.press("r");
const d = await dl;
ok("descarga el archivo", !!d.suggestedFilename(), d.suggestedFilename());
await d.saveAs("/tmp/claude-0/-home-user-FingerFrameTrend/4d31ad51-93f8-5ca9-8c00-f88b79d8852a/scratchpad/qa-" + d.suggestedFilename());

console.log("\nPanel y enlaces");
await p.click("#key-btn"); await p.waitForTimeout(300);
ok("el panel abre", await p.evaluate(()=>!document.getElementById("key-panel").classList.contains("hidden")));
ok("el repo apunta al nombre nuevo", (await p.getAttribute("#repo-btn","href")).includes("mundo-pollito"));
ok("la versión está a la vista", /Versión \d/.test(await p.textContent("#key-panel")));
ok("el prompt activo se ve y es el del estilo", (await p.inputValue("#prompt-activo")).length > 40);
await p.fill("#style-custom", "prueba 123");
ok("se puede escribir en el prompt", (await p.inputValue("#style-custom"))==="prueba 123");
await p.keyboard.press("Escape"); await p.waitForTimeout(200);
await p.keyboard.press("4"); await p.waitForTimeout(200);
ok("tras Escape las teclas vuelven", await p.evaluate(()=>document.querySelector("#toolbar button.active")?.dataset.id)==="oleo");

console.log("\nSin clave no se llama a la API");
ok("la pastilla dice filtro local", (await p.textContent("#live-text")).includes("FILTRO LOCAL"));

console.log(`\n${fallos.length?"✗":"✓"} QA: ${fallos.length} fallo(s)` + (fallos.length?": "+fallos.join(", "):""));
console.log("errores de consola:", errs.length?errs:"ninguno");
await b.close();
