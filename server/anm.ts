import { config } from "./config.ts";
import { publicar } from "./eventos.ts";
import { avisar } from "./alertas.ts";
import { db } from "./db.ts";

db.exec("CREATE TABLE IF NOT EXISTS anm_barridos (inicio TEXT PRIMARY KEY, ts INTEGER NOT NULL, nuevas INTEGER NOT NULL, duracion INTEGER)");
const anotarBarrido = db.prepare("INSERT OR IGNORE INTO anm_barridos (inicio, ts, nuevas, duracion) VALUES (?, ?, ?, ?)");

/**
 * Notificaciones ANM: el monitor le pregunta cada minuto a su ruta /api/monitor/resumen
 * (red interna de Docker, con MONITOR_TOKEN) cómo van los barridos y los vencimientos.
 */

export type ResumenAnm = {
  ahora: string;
  barrido: {
    en_curso: boolean;
    ultimo_inicio: string | null;
    ultimo_estado: string | null;
    ultimo_duracion_seg: number | null;
    ultimo_nuevas: number | null;
    ultimo_errores: number | null;
    duracion_normal_seg: number | null;
    proximo: string | null;
    recientes: { inicio: string; duracion_seg: number; estado: string; nuevas: number }[];
  };
  notificaciones: { nuevas_hoy: number; promedio_diario: number; pendientes_envio: number };
  placas: number;
  vencimientos: {
    id: number;
    placa: string | null;
    acto: string | null;
    urgencia: string | null;
    fecha_limite: string;
    dias_habiles: number | null;
    estado: string | null;
  }[];
};

const activo = () => !!(config.anmUrl && config.anmToken);
let ultimo: ResumenAnm | null = null;
let error: string | null = null;
let actualizado = 0;
let barridoVisto: string | null = null;

async function llamar(ruta: string, metodo = "GET") {
  const r = await fetch(config.anmUrl + ruta, {
    method: metodo,
    headers: { authorization: `Bearer ${config.anmToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { detail?: string };
    throw new Error(cuerpo.detail ?? `ANM respondió ${r.status}`);
  }
  return r.json();
}

const minutos = (seg: number) => (seg < 90 ? `${seg} s` : `${Math.round(seg / 60)} min`);

async function refrescar() {
  if (!activo()) return;
  try {
    const r = (await llamar("/api/monitor/resumen")) as ResumenAnm;
    ultimo = r;
    error = null;
    actualizado = Date.now();

    // ¿Terminó un barrido nuevo? Se anota en la línea de tiempo (no la primera vez, para no repetir)
    const b = r.barrido;
    if (b.ultimo_inicio && !b.en_curso && b.ultimo_inicio !== barridoVisto) {
      if (barridoVisto !== null) {
        const lento = b.duracion_normal_seg && b.ultimo_duracion_seg && b.ultimo_duracion_seg > b.duracion_normal_seg * 2;
        const fallo = b.ultimo_estado === "fallida";
        const texto = `Barrido ANM ${fallo ? "falló" : "terminado"} · ${b.ultimo_nuevas ?? 0} nuevas · ${minutos(b.ultimo_duracion_seg ?? 0)}${
          lento ? ` (normal: ${minutos(b.duracion_normal_seg!)})` : ""
        }`;
        publicar(fallo ? "alerta" : "anm_barrido", texto, { proyecto: "anm", logs: "barrido" });
        if (fallo) avisar(`🔴 ${texto}`);
      }
      barridoVisto = b.ultimo_inicio;
      anotarBarrido.run(b.ultimo_inicio, Date.parse(b.ultimo_inicio) || Date.now(), b.ultimo_nuevas ?? 0, b.ultimo_duracion_seg);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

export function iniciarAnm() {
  if (!activo()) {
    console.warn("[anm] ANM_TOKEN vacío: la tarjeta de Notificaciones ANM queda sin datos");
    return () => {};
  }
  refrescar();
  const t = setInterval(refrescar, 60_000);
  return () => clearInterval(t);
}

export const resumenAnm = () => ({ activo: activo(), error, actualizado, datos: ultimo });

export async function barrerAnm() {
  if (!activo()) throw new Error("La conexión con Notificaciones ANM no está configurada (ANM_TOKEN).");
  const r = (await llamar("/api/monitor/barrer", "POST")) as { id_ejecucion: number };
  publicar("anm_barrido", "Barrido ANM iniciado desde el panel", { proyecto: "anm" });
  setTimeout(refrescar, 5_000);
  return r;
}
