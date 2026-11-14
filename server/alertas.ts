import nodemailer from "nodemailer";
import { config } from "./config.ts";
import { guardarAjuste, leerAjuste } from "./db.ts";
import { alNuevaMuestra, type Instantanea } from "./metricas.ts";
import { resumenServicios } from "./docker.ts";
import { alPublicar, publicar } from "./eventos.ts";

/**
 * Alertas: vigila umbrales y avisa en "Actividad reciente" y por correo (si hay SMTP configurado).
 * Una alerta de CPU/RAM solo salta si el valor se SOSTIENE varios minutos: un pico de 3 segundos
 * mientras corre un build no es un problema y no debe llenarte el correo.
 */

export type AjustesAlertas = {
  cpu: { activa: boolean; umbral: number; minutos: number };
  ram: { activa: boolean; umbral: number; minutos: number };
  disco: { activa: boolean; umbral: number };
  servicio: { activa: boolean };
  natalia: { activa: boolean };
  formulario: { activa: boolean };
};

const POR_DEFECTO: AjustesAlertas = {
  cpu: { activa: true, umbral: 85, minutos: 5 },
  ram: { activa: true, umbral: 90, minutos: 3 },
  disco: { activa: true, umbral: 80 },
  servicio: { activa: true },
  natalia: { activa: false },
  formulario: { activa: true },
};

let ajustes = leerAjuste<AjustesAlertas>("alertas", POR_DEFECTO);
export const leerAlertas = () => ({ ajustes, correoConfigurado: correoListo() });

const entre = (v: unknown, min: number, max: number, def: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def;
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);

/** Acepta solo los campos conocidos y con rangos razonables. */
export function guardarAlertas(x: unknown) {
  const o = (x ?? {}) as Partial<Record<keyof AjustesAlertas, Record<string, unknown>>>;
  const a = ajustes;
  ajustes = {
    cpu: { activa: bool(o.cpu?.activa, a.cpu.activa), umbral: entre(o.cpu?.umbral, 10, 100, a.cpu.umbral), minutos: entre(o.cpu?.minutos, 1, 60, a.cpu.minutos) },
    ram: { activa: bool(o.ram?.activa, a.ram.activa), umbral: entre(o.ram?.umbral, 10, 100, a.ram.umbral), minutos: entre(o.ram?.minutos, 1, 60, a.ram.minutos) },
    disco: { activa: bool(o.disco?.activa, a.disco.activa), umbral: entre(o.disco?.umbral, 10, 100, a.disco.umbral) },
    servicio: { activa: bool(o.servicio?.activa, a.servicio.activa) },
    natalia: { activa: bool(o.natalia?.activa, a.natalia.activa) },
    formulario: { activa: bool(o.formulario?.activa, a.formulario.activa) },
  };
  guardarAjuste("alertas", ajustes);
  return leerAjustesPublicos();
}
const leerAjustesPublicos = () => leerAlertas();

// ---------- Correo ----------

const correoListo = () => !!(config.smtp.host && config.smtp.destino && config.smtp.remitente);
const transporte = correoListo()
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.puerto,
      secure: config.smtp.puerto === 465,
      auth: config.smtp.usuario ? { user: config.smtp.usuario, pass: config.smtp.clave } : undefined,
    })
  : null;

const enviados: number[] = [];
async function correo(asunto: string, texto: string) {
  if (!transporte) return;
  // Freno: máximo 20 correos por hora, por si algo entra en bucle
  const haceUnaHora = Date.now() - 3600_000;
  while (enviados.length && enviados[0]! < haceUnaHora) enviados.shift();
  if (enviados.length >= 20) return;
  enviados.push(Date.now());
  try {
    await transporte.sendMail({ from: config.smtp.remitente, to: config.smtp.destino, subject: `[VPS] ${asunto}`, text: texto });
  } catch (e) {
    console.error("[alertas] No se pudo enviar el correo:", e instanceof Error ? e.message : e);
  }
}

// ---------- Umbrales sostenidos ----------

type Vigia = { sobreDesde: number | null; disparada: boolean };
const vigias: Record<"cpu" | "ram" | "disco", Vigia> = {
  cpu: { sobreDesde: null, disparada: false },
  ram: { sobreDesde: null, disparada: false },
  disco: { sobreDesde: null, disparada: false },
};

function vigilar(clave: "cpu" | "ram" | "disco", nombre: string, valor: number, umbral: number, minutos: number, activa: boolean) {
  const v = vigias[clave];
  if (!activa) {
    vigias[clave] = { sobreDesde: null, disparada: false };
    return;
  }
  if (valor >= umbral) {
    v.sobreDesde ??= Date.now();
    if (!v.disparada && Date.now() - v.sobreDesde >= minutos * 60_000) {
      v.disparada = true;
      const texto = `${nombre} al ${valor.toFixed(0)} % (umbral ${umbral} %${minutos ? `, sostenido ${minutos} min` : ""})`;
      publicar("alerta", texto);
      correo(texto, `${texto}.\n\nRevisa el panel de métricas del VPS.`);
    }
  } else if (valor < umbral - 5) {
    // Histéresis de 5 puntos: evita que la alerta se active y desactive sin parar alrededor del umbral
    if (v.disparada) {
      publicar("alerta_resuelta", `${nombre} volvió a la normalidad (${valor.toFixed(0)} %)`);
      correo(`${nombre} normalizado`, `${nombre} bajó a ${valor.toFixed(0)} %.`);
    }
    vigias[clave] = { sobreDesde: null, disparada: false };
  }
}

function revisarMuestra(i: Instantanea) {
  vigilar("cpu", "CPU", i.cpu.pct, ajustes.cpu.umbral, ajustes.cpu.minutos, ajustes.cpu.activa);
  vigilar("ram", "RAM", i.ram.pct, ajustes.ram.umbral, ajustes.ram.minutos, ajustes.ram.activa);
  vigilar("disco", "Disco", i.disco.pct, ajustes.disco.umbral, 0, ajustes.disco.activa);
}

// ---------- Servicios caídos ----------

const estadoAnterior = new Map<string, boolean>();
function revisarServicios() {
  const { servicios } = resumenServicios();
  for (const s of servicios) {
    const bien = s.estado === "running" && s.salud !== "enferma";
    const antes = estadoAnterior.get(s.id);
    estadoAnterior.set(s.id, bien);
    if (antes === undefined || antes === bien || !ajustes.servicio.activa) continue;
    const nombre = `${s.proyecto ? s.proyecto + "/" : ""}${s.nombre}`;
    if (!bien) {
      const texto = `El servicio ${nombre} está caído (${s.detalle})`;
      publicar("alerta", texto);
      correo(texto, `${texto}.\nImagen: ${s.imagen}`);
    } else {
      publicar("alerta_resuelta", `El servicio ${nombre} volvió a funcionar`);
      correo(`${nombre} recuperado`, `El servicio ${nombre} volvió a estar en línea.`);
    }
  }
}

export function iniciarAlertas() {
  const quitar1 = alNuevaMuestra(revisarMuestra);
  const quitar2 = alPublicar((e) => {
    if (ajustes.natalia.activa && (e.tipo === "natalia_conectada" || e.tipo === "natalia_desconectada")) correo(e.texto, e.texto + ".");
    if (ajustes.formulario.activa && e.tipo === "formulario_enviado") correo("Nuevo formulario de crédito", e.texto + ".");
  });
  const t = setInterval(revisarServicios, 10_000);
  if (!correoListo()) console.warn("[alertas] SMTP sin configurar: las alertas solo se verán en el panel");
  return () => {
    quitar1();
    quitar2();
    clearInterval(t);
  };
}
