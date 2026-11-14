// Formas de los datos que manda el servidor (espejo de server/metricas.ts, presencia.ts, docker.ts...)

export type Instantanea = {
  ts: number;
  uptimeSeg: number;
  cpu: { pct: number; nucleos: number; carga: [number, number, number] };
  ram: { totalB: number; usadaB: number; cacheB: number; pct: number };
  swap: { totalB: number; usadaB: number; pct: number };
  disco: { totalB: number; usadoB: number; pct: number; lecturaBs: number; escrituraBs: number };
  red: {
    interfaz: string;
    inMbps: number;
    outMbps: number;
    hoyRxB: number;
    hoyTxB: number;
    mesB: number;
    limiteB: number;
    pct: number;
    diasParaCorte: number;
  };
};

export type Muestra = { ts: number; cpu: number; ram: number; swap: number; redIn: number; redOut: number };
export type Rango = "15m" | "1h" | "24h";

export type SesionVisitante = {
  alias: string;
  actividad: "catalogo" | "formulario" | "panel" | "ingreso";
  escribiendo: boolean;
  pagina: string;
  dispositivo: string;
  desde: number;
};

export type Presencia = {
  natalia: {
    enLinea: boolean;
    desde: number | null;
    ultimaVez: number | null;
    pagina: string | null;
    dispositivo: string | null;
    dispositivos: number;
  };
  conteo: { conectados: number; catalogo: number; formulario: number };
  hoy: { pico: number; enviados: number };
  sesiones: SesionVisitante[];
};

export type Servicio = {
  id: string;
  nombre: string;
  proyecto: string;
  imagen: string;
  estado: string;
  salud: "sana" | "enferma" | "iniciando" | null;
  detalle: string;
  cpuPct: number | null;
  memoriaB: number | null;
  memoriaLimiteB: number | null;
};

export type ResumenServicios = { activo: boolean; error: string | null; servicios: Servicio[] };

export type Evento = {
  id: number;
  ts: number;
  tipo: "natalia_conectada" | "natalia_desconectada" | "formulario_abierto" | "formulario_enviado" | "alerta" | "alerta_resuelta" | "servicio";
  texto: string;
};

export type EstadoCompleto = {
  metricas: Instantanea | null;
  presencia: Presencia;
  servicios: ResumenServicios;
  eventos: Evento[];
};

export type AjustesAlertas = {
  cpu: { activa: boolean; umbral: number; minutos: number };
  ram: { activa: boolean; umbral: number; minutos: number };
  disco: { activa: boolean; umbral: number };
  servicio: { activa: boolean };
  natalia: { activa: boolean };
  formulario: { activa: boolean };
};
