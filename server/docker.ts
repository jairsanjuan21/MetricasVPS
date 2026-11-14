import { config } from "./config.ts";
import { publicar } from "./eventos.ts";

/**
 * Contenedores del VPS a través de docker-socket-proxy.
 *
 * El socket de Docker da control total del servidor (montarlo directo = ser root en el VPS).
 * Por eso el panel no lo toca: habla con un proxy que solo deja listar contenedores,
 * leer sus estadísticas y logs, y reiniciarlos. Nada de crear, borrar ni ejecutar comandos.
 */

export type Servicio = {
  id: string;
  nombre: string;
  proyecto: string;
  imagen: string;
  estado: string; // running, exited, restarting...
  salud: "sana" | "enferma" | "iniciando" | null;
  detalle: string; // "Up 3 days (healthy)"
  cpuPct: number | null;
  memoriaB: number | null;
  memoriaLimiteB: number | null;
};

type ContenedorApi = {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Labels: Record<string, string>;
};

const activo = () => !!config.dockerUrl;

async function api(ruta: string, init?: RequestInit) {
  const r = await fetch(config.dockerUrl.replace(/\/$/, "") + ruta, { ...init, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Docker respondió ${r.status} en ${ruta}`);
  return r;
}

let cache: Servicio[] = [];
let error: string | null = null;
const previo = new Map<string, { cpu: number; sistema: number }>();

function saludDe(status: string): Servicio["salud"] {
  if (status.includes("(healthy)")) return "sana";
  if (status.includes("(unhealthy)")) return "enferma";
  if (status.includes("(health: starting)")) return "iniciando";
  return null;
}

async function estadisticas(id: string) {
  const r = await api(`/containers/${id}/stats?stream=false&one-shot=true`);
  const s = (await r.json()) as {
    cpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number; online_cpus?: number };
    memory_stats?: { usage?: number; limit?: number; stats?: { inactive_file?: number } };
  };
  const cpu = s.cpu_stats?.cpu_usage?.total_usage ?? 0;
  const sistema = s.cpu_stats?.system_cpu_usage ?? 0;
  const nucleos = s.cpu_stats?.online_cpus ?? 1;
  const ant = previo.get(id);
  previo.set(id, { cpu, sistema });
  // Igual que `docker stats`: uso del contenedor sobre el uso total del sistema entre dos lecturas
  const cpuPct = ant && sistema > ant.sistema ? ((cpu - ant.cpu) / (sistema - ant.sistema)) * nucleos * 100 : null;
  // Memoria "real" (la que muestra docker stats): uso menos la caché de archivos que el kernel puede soltar
  const usada = (s.memory_stats?.usage ?? 0) - (s.memory_stats?.stats?.inactive_file ?? 0);
  return { cpuPct, memoriaB: usada > 0 ? usada : null, memoriaLimiteB: s.memory_stats?.limit ?? null };
}

async function refrescar() {
  if (!activo()) return;
  try {
    const lista = (await (await api("/containers/json?all=1")).json()) as ContenedorApi[];
    cache = await Promise.all(
      lista.map(async (c): Promise<Servicio> => {
        const base: Servicio = {
          id: c.Id.slice(0, 12),
          nombre: c.Labels["com.docker.compose.service"] ?? c.Names[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12),
          proyecto: c.Labels["com.docker.compose.project"] ?? "",
          imagen: c.Image,
          estado: c.State,
          salud: saludDe(c.Status),
          detalle: c.Status,
          cpuPct: null,
          memoriaB: null,
          memoriaLimiteB: null,
        };
        if (c.State !== "running") return base;
        try {
          return { ...base, ...(await estadisticas(c.Id)) };
        } catch {
          return base;
        }
      }),
    );
    cache.sort((a, b) => a.proyecto.localeCompare(b.proyecto) || a.nombre.localeCompare(b.nombre));
    error = null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
}

export function iniciarDocker() {
  if (!activo()) {
    console.warn("[docker] DOCKER_URL vacío: la sección de servicios queda desactivada");
    return () => {};
  }
  refrescar();
  const t = setInterval(refrescar, 10_000);
  return () => clearInterval(t);
}

export const resumenServicios = () => ({ activo: activo(), error, servicios: cache });

const ID_VALIDO = /^[a-f0-9]{12,64}$/;
const buscar = (id: string) => (ID_VALIDO.test(id) ? cache.find((s) => s.id === id.slice(0, 12)) : undefined);

export async function reiniciar(id: string) {
  const s = buscar(id);
  if (!s) throw new Error("Contenedor no encontrado.");
  await api(`/containers/${s.id}/restart?t=10`, { method: "POST" });
  publicar("servicio", `Se reinició ${s.proyecto ? s.proyecto + "/" : ""}${s.nombre}`);
  setTimeout(refrescar, 1500);
  return s;
}

/**
 * Últimas líneas de log. Sin TTY, Docker mezcla stdout y stderr en "tramas":
 * 8 bytes de cabecera (byte 0 = flujo, bytes 4–7 = largo) y luego el texto.
 */
export async function logs(id: string, lineas = 200) {
  const s = buscar(id);
  if (!s) throw new Error("Contenedor no encontrado.");
  const r = await api(`/containers/${s.id}/logs?stdout=1&stderr=1&timestamps=1&tail=${Math.min(lineas, 1000)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const partes: string[] = [];
  let i = 0;
  const conTramas = buf.length >= 8 && (buf[0] === 1 || buf[0] === 2) && buf[1] === 0 && buf[2] === 0 && buf[3] === 0;
  if (!conTramas) return buf.toString("utf8");
  while (i + 8 <= buf.length) {
    const largo = buf.readUInt32BE(i + 4);
    partes.push(buf.subarray(i + 8, i + 8 + largo).toString("utf8"));
    i += 8 + largo;
  }
  return partes.join("");
}
