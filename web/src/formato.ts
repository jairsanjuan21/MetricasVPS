// Formatos en español de Colombia, con coma decimal

const nf = (dec: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const num = (v: number, dec = 0) => nf(dec).format(v);
export const pct = (v: number) => `${num(v)} %`;

/** Bytes a la unidad más legible. Usa base 1000 (como Hostinger cuenta el ancho de banda). */
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

/** Memoria en GiB (base 1024), como la reportan free/htop. */
export const gib = (b: number, dec = 1) => num(b / 1024 ** 3, dec);

export function duracion(seg: number) {
  const d = Math.floor(seg / 86400);
  const h = Math.floor((seg % 86400) / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function haceCuanto(ts: number, ahora = Date.now()) {
  const seg = Math.max(0, Math.round((ahora - ts) / 1000));
  if (seg < 45) return "hace un momento";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** "4 min", "1 h 05 min": cuánto lleva una sesión */
export function tiempoDesde(ts: number, ahora = Date.now()) {
  const min = Math.max(0, Math.floor((ahora - ts) / 60000));
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export const hora = (ts: number) =>
  new Date(ts).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
