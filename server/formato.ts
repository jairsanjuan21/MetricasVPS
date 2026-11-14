// Formatos en español de Colombia para los mensajes del bot

const TZ = "America/Bogota";

export const num = (v: number, dec = 0) =>
  new Intl.NumberFormat("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);

/** Bytes con base 1000 (como cuenta Hostinger el tráfico). */
export function bytes(b: number, dec = 1) {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1000 && i < u.length - 1) {
    v /= 1000;
    i++;
  }
  return `${num(v, i === 0 ? 0 : dec)} ${u[i]}`;
}

/** Memoria en GiB (base 1024), como free/htop. */
export const gib = (b: number, dec = 1) => num(b / 1024 ** 3, dec);

export const hora = (ts: number) => new Date(ts).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: TZ });

export const fechaCorta = (ts = Date.now()) =>
  new Date(ts).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).replace(/\./g, "");

export function duracion(seg: number) {
  const d = Math.floor(seg / 86400);
  const h = Math.floor((seg % 86400) / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function haceCuanto(ts: number) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/** Barra de 10 bloques: ▓▓▓░░░░░░░ */
export function barra(pct: number) {
  const llenos = Math.round(Math.max(0, Math.min(100, pct)) / 10);
  return "▓".repeat(llenos) + "░".repeat(10 - llenos);
}

/** Inicio del día de hoy en Bogotá, en ms (Colombia no tiene horario de verano: UTC-5 fijo). */
export function inicioDeHoy() {
  const ahora = Date.now();
  const bogota = ahora - 5 * 3600_000;
  return ahora - (bogota % 86_400_000);
}
