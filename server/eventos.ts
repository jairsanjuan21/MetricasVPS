import { db } from "./db.ts";

/**
 * Eventos del VPS: alimentan la "Línea de tiempo" del dashboard y son el bus interno
 * (el SSE refresca la pantalla y las alertas avisan por Telegram).
 * Se guardan en SQLite, así que sobreviven a un reinicio del monitor.
 */

export type TipoEvento =
  | "natalia_conectada"
  | "natalia_desconectada"
  | "formulario_abierto"
  | "formulario_enviado"
  | "alerta"
  | "alerta_resuelta"
  | "servicio"
  | "despliegue"
  | "anm_barrido"
  | "error_nuevo";

/** Para los filtros de la línea de tiempo */
export type Categoria = "clientes" | "anm" | "despliegues" | "alertas";
export const CATEGORIA: Record<TipoEvento, Categoria> = {
  natalia_conectada: "clientes",
  natalia_desconectada: "clientes",
  formulario_abierto: "clientes",
  formulario_enviado: "clientes",
  anm_barrido: "anm",
  despliegue: "despliegues",
  servicio: "despliegues",
  alerta: "alertas",
  alerta_resuelta: "alertas",
  error_nuevo: "alertas",
};

export type Evento = {
  id: number;
  ts: number;
  tipo: TipoEvento;
  texto: string;
  /** Proyecto al que pertenece (fersautos, anm…), si aplica */
  proyecto?: string;
  /** Búsqueda que abre la consola de logs justo en ese momento (texto a buscar) */
  logs?: string;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS eventos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    tipo      TEXT NOT NULL,
    texto     TEXT NOT NULL,
    proyecto  TEXT,
    logs      TEXT
  );
  CREATE INDEX IF NOT EXISTS eventos_ts ON eventos (ts);
`);

const insertar = db.prepare("INSERT INTO eventos (ts, tipo, texto, proyecto, logs) VALUES (?, ?, ?, ?, ?)");
const oyentes = new Set<(e: Evento) => void>();

// Una vez al día se borra lo de más de 60 días
setInterval(() => db.prepare("DELETE FROM eventos WHERE ts < ?").run(Date.now() - 60 * 864e5), 864e5).unref();

export function publicar(tipo: TipoEvento, texto: string, extra: { proyecto?: string; logs?: string } = {}) {
  const ts = Date.now();
  const r = insertar.run(ts, tipo, texto, extra.proyecto ?? null, extra.logs ?? null);
  const e: Evento = { id: Number(r.lastInsertRowid), ts, tipo, texto, ...extra };
  for (const fn of oyentes) fn(e);
  return e;
}

type Fila = { id: number; ts: number; tipo: TipoEvento; texto: string; proyecto: string | null; logs: string | null };
const aEvento = (f: Fila): Evento => ({
  id: f.id,
  ts: f.ts,
  tipo: f.tipo,
  texto: f.texto,
  ...(f.proyecto ? { proyecto: f.proyecto } : {}),
  ...(f.logs ? { logs: f.logs } : {}),
});

export const eventosRecientes = (n = 15) =>
  (db.prepare("SELECT * FROM eventos ORDER BY id DESC LIMIT ?").all(n) as Fila[]).map(aEvento);

export const eventosDesde = (ts: number, limite = 300) =>
  (db.prepare("SELECT * FROM eventos WHERE ts >= ? ORDER BY id DESC LIMIT ?").all(ts, limite) as Fila[]).map(aEvento);

export function alPublicar(fn: (e: Evento) => void) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
