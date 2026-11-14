import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { config } from "./config.ts";

/**
 * SQLite integrado en Node (sin dependencias nativas que compilar).
 * Guarda solo lo que debe sobrevivir a un reinicio: historial por minuto, tráfico por día,
 * contadores del catálogo y la configuración de alertas. Lo "en vivo" vive en memoria.
 */
export const db = new DatabaseSync(join(config.datosDir, "metricas.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS muestras_minuto (
    ts       INTEGER PRIMARY KEY,   -- inicio del minuto, en ms
    cpu      REAL NOT NULL,         -- %
    ram      REAL NOT NULL,         -- %
    swap     REAL NOT NULL,         -- %
    red_in   REAL NOT NULL,         -- Mbps promedio
    red_out  REAL NOT NULL          -- Mbps promedio
  );

  CREATE TABLE IF NOT EXISTS trafico_dia (
    dia  TEXT PRIMARY KEY,          -- AAAA-MM-DD (hora de Bogotá)
    rx   INTEGER NOT NULL DEFAULT 0, -- bytes recibidos
    tx   INTEGER NOT NULL DEFAULT 0  -- bytes enviados
  );

  CREATE TABLE IF NOT EXISTS catalogo_dia (
    dia        TEXT PRIMARY KEY,
    pico       INTEGER NOT NULL DEFAULT 0,  -- máximo de conectados a la vez
    enviados   INTEGER NOT NULL DEFAULT 0   -- formularios enviados
  );

  CREATE TABLE IF NOT EXISTS ajustes (
    clave  TEXT PRIMARY KEY,
    valor  TEXT NOT NULL
  );
`);

// Columnas agregadas después de la primera versión (SQLite no tiene "ADD COLUMN IF NOT EXISTS")
try {
  db.exec("ALTER TABLE catalogo_dia ADD COLUMN natalia_seg INTEGER NOT NULL DEFAULT 0");
} catch {
  /* ya existe */
}

/** Fecha local de Colombia (AAAA-MM-DD), para que "hoy" cambie a medianoche de Bogotá y no de UTC. */
export function diaLocal(fecha = new Date()): string {
  return fecha.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

export function leerAjuste<T>(clave: string, porDefecto: T): T {
  const fila = db.prepare("SELECT valor FROM ajustes WHERE clave = ?").get(clave) as { valor: string } | undefined;
  if (!fila) return porDefecto;
  try {
    return { ...porDefecto, ...JSON.parse(fila.valor) } as T;
  } catch {
    return porDefecto;
  }
}

export function guardarAjuste(clave: string, valor: unknown) {
  db.prepare("INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(
    clave,
    JSON.stringify(valor),
  );
}
