/** Error con el código HTTP, para distinguir "sesión vencida" (401) de otros fallos. */
export class ErrorApi extends Error {
  estado: number;
  datos: Record<string, unknown>;
  constructor(estado: number, datos: Record<string, unknown>) {
    super(typeof datos.mensaje === "string" ? datos.mensaje : `Error ${estado}`);
    this.estado = estado;
    this.datos = datos;
  }
}

let alVencerSesion: () => void = () => {};
/** La app registra aquí qué hacer si el servidor dice 401 (volver al login). */
export const configurarSesionVencida = (fn: () => void) => {
  alVencerSesion = fn;
};

export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  const r = await fetch(`/api${ruta}`, {
    method: opciones.metodo ?? "GET",
    headers: opciones.cuerpo !== undefined ? { "content-type": "application/json" } : undefined,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    credentials: "same-origin",
  });
  const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    if (r.status === 401 && ruta !== "/sesion") alVencerSesion();
    throw new ErrorApi(r.status, datos);
  }
  return datos as T;
}
