import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { config } from "./config.ts";
import { COOKIE, cerrarSesion, estadoSesion, exigirSesion, iniciarSesion, mismoOrigen, sesionVigente } from "./auth.ts";
import { alNuevaMuestra, historial, iniciarRecolector, ultimaInstantanea, type Rango } from "./metricas.ts";
import { alCambiarPresencia, iniciarLimpiezaPresencia, registrarLatido, resumenPresencia, validarLatido } from "./presencia.ts";
import { iniciarDocker, logs, reiniciar, resumenServicios } from "./docker.ts";
import { guardarAlertas, iniciarAlertas, leerAlertas } from "./alertas.ts";
import { alPublicar, eventosRecientes } from "./eventos.ts";

const app = new Hono();

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      styleSrc: ["'self'"],
      fontSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'none'"],
    },
    referrerPolicy: "no-referrer",
  }),
);

app.get("/salud", (c) => c.json({ ok: true, metricas: !!ultimaInstantanea() }));

// ---------- Ingesta desde el catálogo (red interna; Caddy la bloquea desde internet) ----------

const tokenIngesta = createHash("sha256").update(config.ingestaToken).digest();
app.post("/ingesta/presencia", bodyLimit({ maxSize: 4 * 1024 }), async (c) => {
  const recibido = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(createHash("sha256").update(recibido).digest(), tokenIngesta)) return c.json({ mensaje: "No autorizado." }, 401);
  const latido = validarLatido(await c.req.json().catch(() => null));
  if (!latido) return c.json({ mensaje: "Datos inválidos." }, 400);
  registrarLatido(latido);
  return c.body(null, 204);
});

// ---------- Sesión ----------

app.use("/api/*", mismoOrigen);
app.post("/api/sesion", bodyLimit({ maxSize: 2 * 1024 }), iniciarSesion);
app.delete("/api/sesion", cerrarSesion);
app.get("/api/sesion", estadoSesion);

// Todo lo demás bajo /api exige sesión
const privada = new Hono();
privada.use("*", exigirSesion);

/** Todo lo que el dashboard necesita para pintarse de una vez. */
const estadoCompleto = () => ({
  metricas: ultimaInstantanea(),
  presencia: resumenPresencia(),
  servicios: resumenServicios(),
  eventos: eventosRecientes(),
  config: { bandaLimiteGb: config.bandaLimiteGb },
});

privada.get("/estado", (c) => c.json(estadoCompleto()));

privada.get("/historial", (c) => {
  const rango = c.req.query("rango") as Rango;
  if (!["15m", "1h", "24h"].includes(rango)) return c.json({ mensaje: "Rango inválido." }, 400);
  return c.json({ rango, puntos: historial(rango) });
});

/**
 * Datos en vivo por Server-Sent Events: una conexión HTTP que queda abierta y por la que el servidor
 * empuja mensajes. Más simple que WebSocket porque aquí solo habla el servidor.
 */
privada.get("/vivo", (c) => {
  const token = getCookie(c, COOKIE)!;
  return streamSSE(c, async (stream) => {
    const enviar = (event: string, data: unknown) => {
      if (!stream.aborted) stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {});
    };

    enviar("estado", estadoCompleto());

    let vueltas = 0;
    const quitarMuestra = alNuevaMuestra((m) => {
      // El dashboard abierto cuenta como actividad; si la sesión se cerró (logout) se avisa y se corta.
      if (!sesionVigente(token)) {
        enviar("sesion", { vencida: true });
        stream.abort();
        return;
      }
      enviar("metricas", m);
      if (++vueltas % 5 === 0) enviar("servicios", resumenServicios());
    });

    // Los cambios de presencia llegan en ráfagas (varias pestañas latiendo): se agrupan en 300 ms
    let pendiente: NodeJS.Timeout | null = null;
    const quitarPresencia = alCambiarPresencia(() => {
      pendiente ??= setTimeout(() => {
        pendiente = null;
        enviar("presencia", resumenPresencia());
      }, 300);
    });
    const quitarEventos = alPublicar((e) => enviar("evento", e));

    await new Promise<void>((resolve) => stream.onAbort(resolve));
    quitarMuestra();
    quitarPresencia();
    quitarEventos();
    if (pendiente) clearTimeout(pendiente);
  });
});

privada.post("/servicios/:id/reiniciar", async (c) => {
  try {
    const s = await reiniciar(c.req.param("id"));
    return c.json({ estado: "ok", servicio: s.nombre });
  } catch (e) {
    return c.json({ mensaje: e instanceof Error ? e.message : "No se pudo reiniciar." }, 400);
  }
});

privada.get("/servicios/:id/logs", async (c) => {
  try {
    return c.json({ texto: await logs(c.req.param("id"), Number(c.req.query("lineas")) || 200) });
  } catch (e) {
    return c.json({ mensaje: e instanceof Error ? e.message : "No se pudieron leer los logs." }, 400);
  }
});

privada.get("/alertas", (c) => c.json(leerAlertas()));
privada.put("/alertas", bodyLimit({ maxSize: 4 * 1024 }), async (c) => c.json(guardarAlertas(await c.req.json().catch(() => null))));

app.route("/api", privada);

// ---------- Frontend compilado (React) ----------

const WEB = "./dist/web";
if (existsSync(WEB)) {
  app.use("/assets/*", serveStatic({ root: WEB, onFound: (_p, c) => c.header("Cache-Control", "public, max-age=31536000, immutable") }));
  app.use("*", serveStatic({ root: WEB }));
  // Cualquier otra ruta GET devuelve la app (React decide qué pantalla mostrar)
  app.get("*", serveStatic({ path: `${WEB}/index.html` }));
} else {
  app.get("/", (c) => c.text("API del monitor activa. En desarrollo abre el frontend con `npm run dev:web`."));
}

// ---------- Arranque ----------

const paradas = [iniciarRecolector(), iniciarLimpiezaPresencia(), iniciarDocker(), iniciarAlertas()];

const servidor = serve({ fetch: app.fetch, port: config.puerto, hostname: "0.0.0.0" }, (info) =>
  console.log(`[monitor] Escuchando en http://localhost:${info.port} (${config.enProduccion ? "producción" : "desarrollo"})`),
);

// Al detener el contenedor se guarda el último minuto y el tráfico pendiente antes de salir
for (const senal of ["SIGINT", "SIGTERM"] as const) {
  process.on(senal, () => {
    for (const parar of paradas) parar();
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
