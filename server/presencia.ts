import { createHash } from "node:crypto";
import { db, diaLocal, guardarAjuste, leerAjuste } from "./db.ts";
import { publicar } from "./eventos.ts";

/**
 * Presencia en vivo del catálogo.
 *
 * Cada pestaña abierta del catálogo manda un "latido" cada 15 s al servidor del catálogo,
 * y este lo reenvía aquí por la red interna de Docker. Si una sesión deja de latir 45 s,
 * se da por desconectada. Así no hace falta mantener un WebSocket por cada visitante.
 *
 * Quién es Natalia lo decide el servidor del catálogo leyendo su sesión de Better Auth
 * (rol "asesora"): el navegador no puede hacerse pasar por ella.
 */

export type Rol = "visitante" | "asesora" | "admin";
export type Actividad = "catalogo" | "formulario" | "panel" | "ingreso";

export type Latido = {
  tipo: "latido" | "salida" | "formulario_enviado";
  sid: string;
  ruta: string;
  rol: Rol;
  nombre?: string;
  dispositivo: string;
  escribiendo?: boolean;
};

type Sesion = {
  sid: string;
  alias: string;
  rol: Rol;
  nombre?: string;
  ruta: string;
  actividad: Actividad;
  dispositivo: string;
  escribiendo: boolean;
  desde: number;
  ultimo: number;
};

const EXPIRA_MS = 45_000;
const sesiones = new Map<string, Sesion>();
const oyentes = new Set<() => void>();
/** Visitantes que ya abrieron el formulario, para avisar solo la primera vez. */
const yaAbrieronFormulario = new Set<string>();

type DatosNatalia = { ultimaVez: number | null };
let natalia = leerAjuste<DatosNatalia>("natalia", { ultimaVez: null });

const avisar = () => {
  for (const fn of oyentes) fn();
};

// ---------- Validación de lo que llega ----------

const ROLES: Rol[] = ["visitante", "asesora", "admin"];
const TIPOS: Latido["tipo"][] = ["latido", "salida", "formulario_enviado"];

export function validarLatido(x: unknown): Latido | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!TIPOS.includes(o.tipo as Latido["tipo"])) return null;
  if (typeof o.sid !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(o.sid)) return null;
  if (typeof o.ruta !== "string" || !o.ruta.startsWith("/")) return null;
  if (!ROLES.includes(o.rol as Rol)) return null;
  return {
    tipo: o.tipo as Latido["tipo"],
    sid: o.sid,
    ruta: o.ruta.split("?")[0]!.slice(0, 120),
    rol: o.rol as Rol,
    nombre: typeof o.nombre === "string" ? o.nombre.slice(0, 60) : undefined,
    dispositivo: typeof o.dispositivo === "string" ? o.dispositivo.slice(0, 60) : "Desconocido",
    escribiendo: o.escribiendo === true,
  };
}

// ---------- Lógica ----------

function actividadDe(ruta: string): Actividad {
  if (ruta.startsWith("/credito")) return "formulario";
  if (ruta.startsWith("/panel") || ruta.startsWith("/admin")) return "panel";
  if (ruta.startsWith("/ingresar")) return "ingreso";
  return "catalogo";
}

/** Identificador corto y estable para mostrar ("V-7F2A") sin exponer el id real de la pestaña. */
const aliasDe = (sid: string) => "V-" + createHash("sha256").update(sid).digest("hex").slice(0, 4).toUpperCase();

const nataliaEnLinea = () => [...sesiones.values()].some((s) => s.rol === "asesora");

function actualizarPico() {
  const conectados = [...sesiones.values()].filter((s) => s.rol !== "admin").length;
  db.prepare(
    "INSERT INTO catalogo_dia (dia, pico) VALUES (?, ?) ON CONFLICT(dia) DO UPDATE SET pico = MAX(pico, excluded.pico)",
  ).run(diaLocal(), conectados);
}

export function registrarLatido(l: Latido) {
  const antes = nataliaEnLinea();
  const ahora = Date.now();

  if (l.tipo === "formulario_enviado") {
    db.prepare(
      "INSERT INTO catalogo_dia (dia, enviados) VALUES (?, 1) ON CONFLICT(dia) DO UPDATE SET enviados = enviados + 1",
    ).run(diaLocal());
    publicar("formulario_enviado", `Formulario de crédito enviado por ${aliasDe(l.sid)}`);
    yaAbrieronFormulario.delete(l.sid);
  } else if (l.tipo === "salida") {
    sesiones.delete(l.sid);
  } else {
    const previa = sesiones.get(l.sid);
    const actividad = actividadDe(l.ruta);
    sesiones.set(l.sid, {
      sid: l.sid,
      alias: l.rol === "visitante" ? aliasDe(l.sid) : (l.nombre ?? l.rol),
      rol: l.rol,
      nombre: l.nombre,
      ruta: l.ruta,
      actividad,
      dispositivo: l.dispositivo,
      escribiendo: actividad === "formulario" && !!l.escribiendo,
      desde: previa?.desde ?? ahora,
      ultimo: ahora,
    });
    if (l.rol === "visitante" && actividad === "formulario" && !yaAbrieronFormulario.has(l.sid)) {
      yaAbrieronFormulario.add(l.sid);
      publicar("formulario_abierto", `${aliasDe(l.sid)} abrió el formulario de crédito`);
    }
    actualizarPico();
  }

  revisarNatalia(antes);
  avisar();
}

function revisarNatalia(antes: boolean) {
  const ahora = nataliaEnLinea();
  if (antes === ahora) return;
  if (ahora) publicar("natalia_conectada", "Natalia se conectó");
  else {
    natalia = { ultimaVez: Date.now() };
    guardarAjuste("natalia", natalia);
    publicar("natalia_desconectada", "Natalia se desconectó");
  }
}

/** Limpia sesiones que dejaron de latir. */
export function iniciarLimpiezaPresencia() {
  const sumarNatalia = db.prepare(
    "INSERT INTO catalogo_dia (dia, natalia_seg) VALUES (?, 5) ON CONFLICT(dia) DO UPDATE SET natalia_seg = natalia_seg + 5",
  );
  const t = setInterval(() => {
    // Tiempo que Natalia pasa conectada hoy (para el resumen /hoy del bot)
    if (nataliaEnLinea()) sumarNatalia.run(diaLocal());
    const antes = nataliaEnLinea();
    let cambio = false;
    for (const [sid, s] of sesiones) {
      if (Date.now() - s.ultimo > EXPIRA_MS) {
        sesiones.delete(sid);
        cambio = true;
      }
    }
    if (cambio) {
      revisarNatalia(antes);
      avisar();
    }
  }, 5000);
  return () => clearInterval(t);
}

export function alCambiarPresencia(fn: () => void) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

const NOMBRES_RUTA: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^\/$/, () => "Catálogo · inicio"],
  [/^\/galeria/, () => "Familia Suzuki"],
  [/^\/modelo\/([^/]+)/, (m) => `Modelo · ${decodeURIComponent(m[1]!).replace(/-/g, " ")}`],
  [/^\/credito/, () => "Formulario de crédito"],
  [/^\/panel\/?([^/]*)/, (m) => (m[1] ? `Panel · ${m[1]}` : "Panel · inicio")],
  [/^\/admin\/?([^/]*)/, (m) => (m[1] ? `Admin · ${m[1]}` : "Admin · inicio")],
  [/^\/ingresar/, () => "Inicio de sesión"],
];

function nombrePagina(ruta: string) {
  for (const [re, fn] of NOMBRES_RUTA) {
    const m = re.exec(ruta);
    if (m) return fn(m);
  }
  return ruta;
}

/** Foto del estado para el dashboard. */
export function resumenPresencia() {
  const todas = [...sesiones.values()];
  const visitantes = todas.filter((s) => s.rol === "visitante").sort((a, b) => a.desde - b.desde);
  const deNatalia = todas.filter((s) => s.rol === "asesora").sort((a, b) => b.ultimo - a.ultimo);
  const hoy = (db.prepare("SELECT pico, enviados, natalia_seg AS nataliaSeg FROM catalogo_dia WHERE dia = ?").get(diaLocal()) as
    | { pico: number; enviados: number; nataliaSeg: number }
    | undefined) ?? { pico: 0, enviados: 0, nataliaSeg: 0 };

  const formulario = visitantes.filter((s) => s.actividad === "formulario").length;
  const actual = deNatalia[0];

  return {
    natalia: {
      enLinea: deNatalia.length > 0,
      desde: deNatalia.length ? Math.min(...deNatalia.map((s) => s.desde)) : null,
      ultimaVez: natalia.ultimaVez,
      pagina: actual ? nombrePagina(actual.ruta) : null,
      dispositivo: actual?.dispositivo ?? null,
      dispositivos: deNatalia.length,
    },
    conteo: {
      conectados: visitantes.length + (deNatalia.length ? 1 : 0),
      catalogo: visitantes.length - formulario,
      formulario,
    },
    hoy,
    sesiones: visitantes.map((s) => ({
      alias: s.alias,
      actividad: s.actividad,
      escribiendo: s.escribiendo,
      pagina: nombrePagina(s.ruta),
      dispositivo: s.dispositivo,
      desde: s.desde,
    })),
  };
}

export type ResumenPresencia = ReturnType<typeof resumenPresencia>;
