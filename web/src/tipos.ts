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
  hoy: { pico: number; enviados: number; nataliaSeg: number };
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
  contenedor: string;
  grupo: string;
  creado: number;
};

export type ResumenServicios = { activo: boolean; error: string | null; servicios: Servicio[] };

export type Evento = {
  id: number;
  ts: number;
  tipo:
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
  texto: string;
  proyecto?: string;
  /** Texto a buscar en la consola de logs para ver ese momento */
  logs?: string;
};

export type ItemLinea = Evento & { categoria: "clientes" | "anm" | "despliegues" | "alertas" | "visitas"; hasta?: number };

export type Nivel = "info" | "warn" | "error";
export type LineaLog = { id: number; ts: number; fuente: string; grupo: string; nivel: Nivel; texto: string };

export type ErrorAgrupado = {
  huella: string;
  fuente: string;
  grupo: string;
  nivel: Nivel;
  ejemplo: string;
  primera: number;
  ultima: number;
  total: number;
  recientes: number;
  nuevo: boolean;
};

export type Chequeo = { msHora: number | null; uptime30: number | null; dias: (number | null)[]; ultimoOk: boolean | null };

export type ResumenAnm = {
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

export type Proyecto = { id: string; nombre: string; contenedores: { total: number; bien: number } };

export type General = {
  servidor: {
    cpuNormal: number | null;
    ramNormal: number | null;
    discoDiasParaLlenarse: number | null;
    sparkCpu: (number | null)[];
    sparkRam: (number | null)[];
  };
  fersautos: {
    visitasHoy: number;
    normalHastaAhora: number | null;
    porHoraHoy: number[];
    porHoraAyer: number[];
    horaActual: number;
    enviadosHoy: number;
    enviadosNormal: number | null;
    pico: number;
    embudo: { entraron: number; vieronModelo: number; abrieronFormulario: number; enviaron: number };
    origenes: { origen: string; n: number }[];
    modelos: { modelo: string; n: number }[];
  };
  desdeUltimaVisita: { desde: number; visitas: number; formularios: number; anmNuevas: number; alertas: string[] } | null;
  chequeos: Record<string, Chequeo>;
  anm: { activo: boolean; error: string | null; actualizado: number; datos: ResumenAnm | null };
  proyectos: Proyecto[];
  errores: ErrorAgrupado[];
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
  errores: { activa: boolean };
};
