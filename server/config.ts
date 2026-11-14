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

  // --- Plan del VPS (para porcentajes y barras) ---
  bandaLimiteGb: numero("BANDA_LIMITE_GB", 8000),
  bandaDiaCorte: numero("BANDA_DIA_CORTE", 1),

  // --- Datos persistentes (SQLite). Su volumen vive en el disco del VPS: también sirve para medir el disco. ---
  datosDir: process.env.DATOS_DIR ?? join(process.cwd(), "datos"),

  // --- Correo para alertas (opcional) ---
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    puerto: numero("SMTP_PUERTO", 587),
    usuario: process.env.SMTP_USUARIO ?? "",
    clave: process.env.SMTP_CLAVE ?? "",
    remitente: process.env.SMTP_REMITENTE ?? "",
    destino: process.env.ALERTAS_CORREO ?? "",
  },
};

mkdirSync(config.datosDir, { recursive: true });
