import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { config } from "./config.ts";
import { verificarClave } from "./clave.ts";

/**
 * Autenticación de un solo administrador.
 *
 * - La contraseña nunca se guarda: solo su hash scrypt (ver clave.ts).
 * - La sesión es un token aleatorio en una cookie httpOnly (JavaScript no la puede leer) y SameSite=Strict
 *   (otro sitio no puede usarla para hacer peticiones a tu nombre).
 * - Tras varios intentos fallidos desde la misma IP, esa IP queda bloqueada un rato.
 */

export const COOKIE = "mvps_sesion";

/** Compara textos en tiempo constante (sin delatar cuántas letras coinciden). */
const igualesSeguro = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

// ---------- Sesiones en memoria ----------
// Al reiniciar el contenedor se cierran todas: para un panel de un solo usuario es aceptable y más simple.

type Sesion = { creada: number; ultimoUso: number };
const sesiones = new Map<string, Sesion>();
const duracionMs = () => config.sesionMinutos * 60_000;

function crearSesion() {
  const token = randomBytes(32).toString("base64url");
  sesiones.set(token, { creada: Date.now(), ultimoUso: Date.now() });
  return token;
}

/** Devuelve la sesión si es válida y la renueva. */
export function validarSesion(token: string | undefined): Sesion | null {
  if (!token) return null;
  const s = sesiones.get(token);
  if (!s) return null;
  if (Date.now() - s.ultimoUso > duracionMs()) {
    sesiones.delete(token);
    return null;
  }
  s.ultimoUso = Date.now();
  return s;
}

export const sesionVigente = (token: string) => {
  const s = sesiones.get(token);
  return !!s && Date.now() - s.ultimoUso <= duracionMs();
};

setInterval(() => {
  for (const [t, s] of sesiones) if (Date.now() - s.ultimoUso > duracionMs()) sesiones.delete(t);
}, 60_000).unref();

// ---------- Intentos fallidos por IP ----------

type Intentos = { fallos: number; bloqueadoHasta: number };
const intentos = new Map<string, Intentos>();

export function ipDe(c: Context) {
  // Caddy pone la IP real del cliente en X-Forwarded-For
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";
}

// ---------- Rutas y middleware ----------

const opcionesCookie = () =>
  ({
    httpOnly: true,
    secure: config.enProduccion,
    sameSite: "Strict",
    path: "/",
    maxAge: config.sesionMinutos * 60 * 4, // el navegador la guarda un poco más; el servidor manda
  }) as const;

export async function iniciarSesion(c: Context) {
  const ip = ipDe(c);
  const reg = intentos.get(ip) ?? { fallos: 0, bloqueadoHasta: 0 };

  if (reg.bloqueadoHasta > Date.now()) {
    const seg = Math.ceil((reg.bloqueadoHasta - Date.now()) / 1000);
    return c.json({ estado: "bloqueado", mensaje: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(seg / 60)} min.`, segundos: seg }, 429);
  }

  const cuerpo = (await c.req.json().catch(() => ({}))) as { usuario?: unknown; clave?: unknown };
  const usuario = typeof cuerpo.usuario === "string" ? cuerpo.usuario.slice(0, 100) : "";
  const clave = typeof cuerpo.clave === "string" ? cuerpo.clave.slice(0, 200) : "";

  // Se verifica la clave siempre, aunque el usuario esté mal: así la respuesta tarda lo mismo en ambos casos.
  const claveOk = await verificarClave(clave, config.adminClaveHash);
  const usuarioOk = igualesSeguro(usuario, config.adminUsuario);

  if (!claveOk || !usuarioOk) {
    reg.fallos++;
    if (reg.fallos >= config.intentosMaximos) {
      reg.fallos = 0;
      reg.bloqueadoHasta = Date.now() + config.bloqueoMinutos * 60_000;
      intentos.set(ip, reg);
      console.warn(`[auth] IP ${ip} bloqueada ${config.bloqueoMinutos} min por intentos fallidos`);
      return c.json(
        { estado: "bloqueado", mensaje: `Demasiados intentos fallidos. Acceso bloqueado desde esta IP por ${config.bloqueoMinutos} minutos.`, segundos: config.bloqueoMinutos * 60 },
        429,
      );
    }
    intentos.set(ip, reg);
    const quedan = config.intentosMaximos - reg.fallos;
    return c.json(
      { estado: "error", mensaje: `Usuario o contraseña incorrectos. Te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`} antes de un bloqueo de ${config.bloqueoMinutos} minutos.`, intentosRestantes: quedan },
      401,
    );
  }

  intentos.delete(ip);
  setCookie(c, COOKIE, crearSesion(), opcionesCookie());
  return c.json({ estado: "ok", usuario: config.adminUsuario });
}

export function cerrarSesion(c: Context) {
  const token = getCookie(c, COOKIE);
  if (token) sesiones.delete(token);
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ estado: "ok" });
}

export function estadoSesion(c: Context) {
  const s = validarSesion(getCookie(c, COOKIE));
  if (!s) return c.json({ autenticado: false }, 401);
  return c.json({ autenticado: true, usuario: config.adminUsuario, expiraEnSeg: Math.round(duracionMs() / 1000) });
}

/** Middleware: corta con 401 cualquier ruta privada sin sesión válida. */
export async function exigirSesion(c: Context, next: Next) {
  if (!validarSesion(getCookie(c, COOKIE))) return c.json({ mensaje: "Sesión vencida o inexistente." }, 401);
  await next();
}

/**
 * Defensa extra contra CSRF en peticiones que cambian algo: el navegador manda Origin,
 * y debe coincidir con el host del panel.
 */
export async function mismoOrigen(c: Context, next: Next) {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origen = c.req.header("origin");
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
    if (origen && host && new URL(origen).host !== host) return c.json({ mensaje: "Origen no permitido." }, 403);
  }
  await next();
}
