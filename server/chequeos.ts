import { config } from "./config.ts";
import { db } from "./db.ts";
import { publicar } from "./eventos.ts";

/**
 * Disponibilidad: cada minuto el monitor visita cada proyecto por la red interna
 * y anota si respondió y cuánto tardó. Con eso salen el tiempo de respuesta y el % de disponibilidad.
 */

const OBJETIVOS = () =>
  [
    { proyecto: "fersautos", url: config.fersautosUrl },
    { proyecto: "anm", url: config.anmUrl ? config.anmUrl + "/" : "" },
  ].filter((o) => o.url);

db.exec(`
  CREATE TABLE IF NOT EXISTS chequeos (
    ts        INTEGER NOT NULL,
    proyecto  TEXT NOT NULL,
    ok        INTEGER NOT NULL,
    ms        INTEGER
  );
  CREATE INDEX IF NOT EXISTS chequeos_p_ts ON chequeos (proyecto, ts);
`);

const guardar = db.prepare("INSERT INTO chequeos (ts, proyecto, ok, ms) VALUES (?, ?, ?, ?)");
const caido = new Map<string, number>(); // proyecto -> desde cuándo no responde

async function chequear(proyecto: string, url: string) {
  const inicio = performance.now();
  let ok = false;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
    ok = r.status < 500;
    await r.body?.cancel();
  } catch {
    ok = false;
  }
  const ms = Math.round(performance.now() - inicio);
  guardar.run(Date.now(), proyecto, ok ? 1 : 0, ok ? ms : null);

  // Dos fallas seguidas (2 min) = caído; se avisa una vez y otra al volver
  if (!ok) {
    const desde = caido.get(proyecto) ?? Date.now();
    caido.set(proyecto, desde);
    if (Date.now() - desde >= 60_000 && Date.now() - desde < 120_000) {
      publicar("alerta", `${proyecto} no responde desde hace 1 min`, { proyecto, logs: "" });
    }
  } else if (caido.has(proyecto)) {
    const minutos = Math.round((Date.now() - caido.get(proyecto)!) / 60_000);
    caido.delete(proyecto);
    if (minutos >= 1) publicar("alerta_resuelta", `${proyecto} volvió a responder (estuvo caído ${minutos} min)`, { proyecto });
  }
}

export function iniciarChequeos() {
  const vuelta = () => {
    for (const o of OBJETIVOS()) chequear(o.proyecto, o.url);
  };
  setTimeout(vuelta, 5_000);
  const t = setInterval(vuelta, 60_000);
  const limpieza = setInterval(() => db.prepare("DELETE FROM chequeos WHERE ts < ?").run(Date.now() - 95 * 864e5), 3600_000);
  return () => {
    clearInterval(t);
    clearInterval(limpieza);
  };
}

/** Por proyecto: respuesta media de la última hora, disponibilidad de 30 días y una barra por día de los últimos 90. */
export function resumenChequeos() {
  const salida: Record<string, { msHora: number | null; uptime30: number | null; dias: (number | null)[]; ultimoOk: boolean | null }> = {};
  const DIA = 864e5;
  const hoy0 = Math.floor((Date.now() - 5 * 3600_000) / DIA) * DIA + 5 * 3600_000; // medianoche de Bogotá
  for (const o of OBJETIVOS()) {
    const hora = db
      .prepare("SELECT AVG(ms) AS ms FROM chequeos WHERE proyecto = ? AND ok = 1 AND ts >= ?")
      .get(o.proyecto, Date.now() - 3600_000) as { ms: number | null };
    const mes = db
      .prepare("SELECT COUNT(*) AS n, SUM(ok) AS ok FROM chequeos WHERE proyecto = ? AND ts >= ?")
      .get(o.proyecto, Date.now() - 30 * DIA) as { n: number; ok: number | null };
    const porDia = db
      .prepare(
        "SELECT CAST((ts - ?) / ? AS INTEGER) AS d, COUNT(*) AS n, SUM(ok) AS ok FROM chequeos WHERE proyecto = ? AND ts >= ? GROUP BY d",
      )
      .all(hoy0 - 89 * DIA, DIA, o.proyecto, hoy0 - 89 * DIA) as { d: number; n: number; ok: number }[];
    const dias: (number | null)[] = Array.from({ length: 90 }, () => null);
    for (const f of porDia) if (f.d >= 0 && f.d < 90) dias[f.d] = f.ok / f.n;
    const ultimo = db.prepare("SELECT ok FROM chequeos WHERE proyecto = ? ORDER BY ts DESC LIMIT 1").get(o.proyecto) as
      | { ok: number }
      | undefined;
    salida[o.proyecto] = {
      msHora: hora.ms === null ? null : Math.round(hora.ms),
      uptime30: mes.n ? (mes.ok ?? 0) / mes.n : null,
      dias,
      ultimoOk: ultimo ? ultimo.ok === 1 : null,
    };
  }
  return salida;
}
