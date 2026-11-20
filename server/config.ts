import { mkdirSync } from "node:fs";
import { join } from "node:path";

/** Lee una variable obligatoria: si falta, el servidor no arranca (mejor fallar al inicio que en producción). */
function obligatoria(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    console.error(`[config] Falta la variable de entorno ${nombre}. Revisa tu archivo .env`);
    process.exit(1);
  }
  return valor;
}

const numero = (nombre: string, porDefecto: number) => {
  const v = Number(process.env[nombre]);
  return Number.isFinite(v) && v > 0 ? v : porDefecto;
};

const enProduccion = process.env.NODE_ENV === "production";

export const config = {
  enProduccion,
  puerto: numero("PUERTO", 4000),

  // --- Acceso al panel (un solo administrador) ---
  adminUsuario: obligatoria("ADMIN_USUARIO"),
  /** Hash scrypt generado con `npm run clave`. Nunca la contraseña en texto plano. */
  adminClaveHash: obligatoria("ADMIN_CLAVE_HASH"),
  /** Minutos sin actividad antes de cerrar la sesión. */
  sesionMinutos: numero("SESION_MINUTOS", 30),
  intentosMaximos: numero("LOGIN_INTENTOS", 5),
  bloqueoMinutos: numero("LOGIN_BLOQUEO_MINUTOS", 15),

  // --- Ingesta desde el catálogo (red interna de Docker) ---
  ingestaToken: obligatoria("INGESTA_TOKEN"),

  // --- Lectura del servidor ---
  /** Dónde está montado el /proc del VPS. En desarrollo (Linux) basta /proc. */
  hostProc: process.env.HOST_PROC ?? "/proc",
  /** Interfaz de red pública. Vacío = se detecta sola (la de más tráfico que no sea docker/lo). */
  interfazRed: process.env.INTERFAZ_RED ?? "",
  /** docker-socket-proxy. Vacío = la sección de servicios se desactiva. */
  dockerUrl: process.env.DOCKER_URL ?? "",

  // --- Proyectos (red interna de Docker "proxy") ---
  /** Dirección interna del catálogo para medir si responde y cuánto tarda. Vacío = sin chequeo. */
  fersautosUrl: process.env.FERSAUTOS_URL ?? "http://fersautos-app:3000/",
  /** Notificaciones ANM: dirección interna y el token de /api/monitor (MONITOR_TOKEN en ANM). */
  anmUrl: (process.env.ANM_URL ?? "http://notificaciones-anm:8000").replace(/\/$/, ""),
  anmToken: process.env.ANM_TOKEN ?? "",

  // --- Plan del VPS (para porcentajes y barras) ---
  bandaLimiteGb: numero("BANDA_LIMITE_GB", 8000),
  bandaDiaCorte: numero("BANDA_DIA_CORTE", 1),

  // --- Datos persistentes (SQLite). Su volumen vive en el disco del VPS: también sirve para medir el disco. ---
  datosDir: process.env.DATOS_DIR ?? join(process.cwd(), "datos"),

  // --- Alertas por Telegram (opcional) ---
  telegram: {
    token: process.env.TELEGRAM_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    /** "0" quita el comando /reiniciar del bot. */
    permitirReinicio: process.env.TELEGRAM_REINICIAR !== "0",
  },
};

mkdirSync(config.datosDir, { recursive: true });
