import { config } from "./config.ts";
import { db } from "./db.ts";
import { ultimaInstantanea } from "./metricas.ts";
import { resumenPresencia } from "./presencia.ts";
import { reiniciar, resumenServicios, type Servicio } from "./docker.ts";
import { eventosRecientes } from "./eventos.ts";
import { silenciar, silenciadoHasta } from "./alertas.ts";
import { editar, enviar, esc, llamar, telegramListo, type Teclado } from "./telegram-api.ts";
import { barra, bytes, duracion, fechaCorta, gib, haceCuanto, hora, inicioDeHoy, num } from "./formato.ts";

/**
 * Comandos del bot de Telegram.
 *
 * Usa "long polling": el monitor le pregunta a Telegram cada 25 s "¿hay mensajes nuevos?" y Telegram
 * deja la petición abierta hasta que llega uno. Así no hace falta un dominio ni una URL pública (webhook).
 *
 * Seguridad: solo se responde al chat de TELEGRAM_CHAT_ID. Cualquier otro chat se ignora en silencio.
 */

type Chat = { id: number };
type Actualizacion = {
  update_id: number;
  message?: { message_id: number; chat: Chat; text?: string };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: Chat } };
};

const esMiChat = (chat?: Chat) => !!chat && String(chat.id) === String(config.telegram.chatId);

// ---------- Mensajes ----------

function msgEstado() {
  const m = ultimaInstantanea();
  if (!m) return "⏳ Todavía no hay métricas. Intenta en unos segundos.";
  const l = [
    `🖥 <b>Estado del VPS</b> · ${hora(m.ts)}`,
    "",
    "<pre>",
    `CPU     ${num(m.cpu.pct).padStart(3)} %   ${barra(m.cpu.pct)}   carga ${num(m.cpu.carga[0], 2)}`,
    `RAM     ${num(m.ram.pct).padStart(3)} %   ${barra(m.ram.pct)}   ${gib(m.ram.usadaB)} / ${gib(m.ram.totalB, 0)} GB`,
    m.swap.totalB ? `Swap    ${num(m.swap.usadaB / 1024 ** 2)} MB / ${gib(m.swap.totalB, 0)} GB` : "Swap    sin configurar",
    `Disco   ${num(m.disco.pct).padStart(3)} %   ${barra(m.disco.pct)}   ${num(m.disco.usadoB / 1e9)} / ${num(m.disco.totalB / 1e9)} GB`,
    "",
    `Red     ↓ ${num(m.red.inMbps, 1)} Mbps   ↑ ${num(m.red.outMbps, 1)} Mbps`,
    `Ciclo   ${bytes(m.red.mesB)} de ${bytes(m.red.limiteB, 0)} (${num(m.red.pct)} %) · reinicia en ${m.red.diasParaCorte} d`,
    "</pre>",
    `Encendido hace ${duracion(m.uptimeSeg)}`,
  ];
  return l.join("\n");
}

function msgUsuarios() {
  const p = resumenPresencia();
  const n = p.natalia;
  const l = ["👥 <b>Catálogo en vivo</b>", ""];
  if (n.enLinea) {
    l.push(`🟢 Natalia en línea desde las ${hora(n.desde!)}`);
    l.push(`   ${esc(n.pagina ?? "")} · ${esc(n.dispositivo ?? "")}`);
  } else {
    l.push(`⚪ Natalia desconectada${n.ultimaVez ? ` · última vez ${haceCuanto(n.ultimaVez)}` : ""}`);
  }
  l.push("", `Conectados: <b>${p.conteo.conectados}</b>`, `  · Viendo catálogo: ${p.conteo.catalogo}`, `  · En el formulario: ${p.conteo.formulario}`);
  const enFormulario = p.sesiones.filter((s) => s.actividad === "formulario");
  if (enFormulario.length) {
    l.push("", "📝 <b>En el formulario</b>");
    for (const s of enFormulario) {
      const min = Math.max(1, Math.round((Date.now() - s.desde) / 60000));
      l.push(`  ${s.alias} · ${esc(s.dispositivo)}${s.escribiendo ? " · escribiendo…" : ""} (${min} min)`);
    }
  }
  l.push("", `Hoy: pico ${p.hoy.pico} · enviados ${p.hoy.enviados}`);
  return l.join("\n");
}

const nombreServicio = (s: Servicio) => `${s.proyecto ? s.proyecto + "/" : ""}${s.nombre}`;
const estaBien = (s: Servicio) => s.estado === "running" && s.salud !== "enferma";

function msgServicios() {
  const r = resumenServicios();
  if (!r.activo) return "🧩 La conexión con Docker no está configurada.";
  if (r.error) return `🧩 No pude consultar Docker: ${esc(r.error)}`;
  const ancho = Math.max(...r.servicios.map((s) => nombreServicio(s).length), 10);
  const filas = r.servicios.map((s) => {
    const uso = estaBien(s)
      ? `CPU ${s.cpuPct === null ? "…" : num(s.cpuPct, 1) + " %"} · ${s.memoriaB === null ? "…" : bytes(s.memoriaB, 0)}`
      : esc(s.detalle);
    return `${estaBien(s) ? "🟢" : "🔴"} ${esc(nombreServicio(s).padEnd(ancho))}  ${uso}`;
  });
  return ["🧩 <b>Servicios</b>", "", "<pre>", ...filas, "</pre>"].join("\n");
}

function msgHoy() {
  const desde = inicioDeHoy();
  const p = resumenPresencia();
  const cpu = db
    .prepare("SELECT AVG(cpu) AS prom, MAX(cpu) AS max, AVG(ram) AS ram FROM muestras_minuto WHERE ts >= ?")
    .get(desde) as { prom: number | null; max: number | null; ram: number | null };
  const m = ultimaInstantanea();
  const alertas = eventosRecientes(40)
    .filter((e) => e.ts >= desde && (e.tipo === "alerta" || e.tipo === "alerta_resuelta"))
    .reverse();

  const l = [
    `📅 <b>Resumen de hoy</b> · ${fechaCorta()}`,
    "",
    "<b>Catálogo</b>",
    `  Pico de conectados: ${p.hoy.pico}`,
    `  Formularios enviados: ${p.hoy.enviados}`,
    `  Natalia conectada: ${duracion(p.hoy.nataliaSeg)}`,
    "",
    "<b>Servidor</b>",
    cpu.prom === null ? "  Aún sin datos de hoy" : `  CPU promedio ${num(cpu.prom)} % · máx ${num(cpu.max ?? 0)} %`,
    cpu.ram === null ? null : `  RAM promedio ${num(cpu.ram)} %`,
    m ? `  Tráfico ↓ ${bytes(m.red.hoyRxB)}  ↑ ${bytes(m.red.hoyTxB)}` : null,
    "",
    `<b>Alertas: ${alertas.filter((a) => a.tipo === "alerta").length}</b>`,
    ...alertas.slice(-8).map((a) => `  ${a.tipo === "alerta" ? "🔴" : "✅"} ${hora(a.ts)} ${esc(a.texto)}`),
  ];
  return l.filter((x) => x !== null).join("\n");
}

function msgAyuda() {
  return [
    "🤖 <b>Comandos</b>",
    "",
    "/estado — CPU, RAM, disco y red ahora",
    "/usuarios — Natalia y clientes en el catálogo",
    "/servicios — contenedores y su consumo",
    "/hoy — resumen del día",
    "/silencio 1h — pausar alertas (30m, 1h, 2h, 8h · 0 para reactivar)",
    ...(config.telegram.permitirReinicio ? ["/reiniciar — reiniciar un servicio"] : []),
  ].join("\n");
}

function cmdSilencio(arg: string) {
  const m = /^(\d+)\s*(m|min|h)?$/i.exec(arg.trim() || "1h");
  if (!m) return "Úsalo así: /silencio 30m, /silencio 1h, /silencio 8h o /silencio 0";
  const n = Number(m[1]);
  const ms = Math.min(n * ((m[2] ?? "h").toLowerCase().startsWith("m") ? 60_000 : 3600_000), 24 * 3600_000);
  silenciar(ms);
  if (ms === 0) return "🔔 Alertas activas de nuevo";
  return `🔕 Alertas en silencio hasta las ${hora(silenciadoHasta())}\nEscribe /silencio 0 para reactivarlas antes.`;
}

// ---------- /reiniciar con botones ----------

/** Servicios que se pueden reiniciar desde el bot (el monitor no se reinicia a sí mismo). */
const reiniciables = () => resumenServicios().servicios.filter((s) => s.proyecto !== "metricas");

function tecladoServicios(): Teclado {
  const botones = reiniciables().map((s) => ({ text: nombreServicio(s), callback_data: `r:${s.id}` }));
  const filas: Teclado = [];
  for (let i = 0; i < botones.length; i += 2) filas.push(botones.slice(i, i + 2));
  filas.push([{ text: "Cancelar", callback_data: "x" }]);
  return filas;
}

async function alBoton(id: string, datos: string, mensajeId: number) {
  await llamar("answerCallbackQuery", { callback_query_id: id }).catch(() => {});
  if (!config.telegram.permitirReinicio) return;

  if (datos === "x") return editar(mensajeId, "Cancelado. No se reinició nada.");

  const [accion, contenedor] = datos.split(":");
  const s = reiniciables().find((x) => x.id === contenedor);
  if (!s) return editar(mensajeId, "Ese servicio ya no aparece. Escribe /reiniciar de nuevo.");

  if (accion === "r") {
    const enFormulario = resumenPresencia().conteo.formulario;
    const aviso =
      s.proyecto.includes("fersautos") && enFormulario > 0
        ? `\nHay ${enFormulario} ${enFormulario === 1 ? "persona" : "personas"} en el formulario y podrían perder lo que llevan.`
        : "";
    return editar(mensajeId, `⚠️ ¿Reiniciar <b>${esc(nombreServicio(s))}</b>?\nSe cae unos segundos.${aviso}`, [
      [
        { text: "Sí, reiniciar", callback_data: `rc:${s.id}` },
        { text: "Cancelar", callback_data: "x" },
      ],
    ]);
  }

  if (accion === "rc") {
    await editar(mensajeId, `♻️ Reiniciando <b>${esc(nombreServicio(s))}</b>…`);
    const inicio = Date.now();
    try {
      await reiniciar(s.id);
      return editar(mensajeId, `✅ <b>${esc(nombreServicio(s))}</b> reiniciado (tardó ${Math.round((Date.now() - inicio) / 1000)} s)`);
    } catch (e) {
      return editar(mensajeId, `❌ No se pudo reiniciar ${esc(nombreServicio(s))}: ${esc(e instanceof Error ? e.message : String(e))}`);
    }
  }
}

// ---------- Bucle de mensajes ----------

async function alMensaje(texto: string) {
  const [crudo = "", ...resto] = texto.trim().split(/\s+/);
  const comando = crudo.toLowerCase().replace(/@\w+$/, ""); // en grupos llega como /estado@mi_bot
  const arg = resto.join(" ");

  switch (comando) {
    case "/estado":
      return enviar(msgEstado());
    case "/usuarios":
      return enviar(msgUsuarios());
    case "/servicios":
      return enviar(msgServicios());
    case "/hoy":
      return enviar(msgHoy());
    case "/silencio":
      return enviar(cmdSilencio(arg));
    case "/reiniciar":
      if (!config.telegram.permitirReinicio) return enviar("El reinicio desde Telegram está desactivado.");
      if (!resumenServicios().activo) return enviar("La conexión con Docker no está configurada.");
      return enviar("♻️ ¿Qué servicio reinicio?", tecladoServicios());
    default:
      return enviar(msgAyuda());
  }
}

const COMANDOS = [
  { command: "estado", description: "CPU, RAM, disco y red ahora" },
  { command: "usuarios", description: "Natalia y clientes en el catálogo" },
  { command: "servicios", description: "Contenedores y su consumo" },
  { command: "hoy", description: "Resumen del día" },
  { command: "silencio", description: "Pausar alertas: /silencio 1h" },
  { command: "reiniciar", description: "Reiniciar un servicio" },
  { command: "ayuda", description: "Lista de comandos" },
];

export function iniciarBot() {
  if (!telegramListo()) return () => {};
  let activo = true;
  let offset = 0;

  (async () => {
    // Registra los comandos para que aparezcan en el menú "/" del chat
    await llamar("setMyCommands", {
      commands: COMANDOS.filter((c) => c.command !== "reiniciar" || config.telegram.permitirReinicio),
    }).catch((e) => console.warn("[bot] No se pudieron registrar los comandos:", e instanceof Error ? e.message : e));

    // Descarta lo que llegó mientras el monitor estaba apagado (no ejecutar un /reiniciar viejo)
    try {
      const viejos = await llamar<Actualizacion[]>("getUpdates", { offset: -1, timeout: 0 });
      if (viejos.length) offset = viejos[viejos.length - 1]!.update_id + 1;
    } catch {
      /* se intenta en el bucle */
    }
    console.log("[bot] Escuchando comandos de Telegram");

    while (activo) {
      try {
        const actualizaciones = await llamar<Actualizacion[]>(
          "getUpdates",
          { offset, timeout: 25, allowed_updates: ["message", "callback_query"] },
          35_000,
        );
        for (const u of actualizaciones) {
          offset = u.update_id + 1;
          try {
            if (u.message?.text && esMiChat(u.message.chat)) await alMensaje(u.message.text);
            const cb = u.callback_query;
            if (cb?.data && cb.message && esMiChat(cb.message.chat)) await alBoton(cb.id, cb.data, cb.message.message_id);
          } catch (e) {
            console.error("[bot] Error respondiendo:", e instanceof Error ? e.message : e);
          }
        }
      } catch (e) {
        if (!activo) break;
        console.warn("[bot] Sin conexión con Telegram, reintento en 5 s:", e instanceof Error ? e.message : e);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();

  return () => {
    activo = false;
  };
}

/** Para probar los textos sin Telegram: node server/scripts/vista-bot.ts */
export const vistaPrevia = { msgEstado, msgUsuarios, msgServicios, msgHoy, msgAyuda, cmdSilencio };
