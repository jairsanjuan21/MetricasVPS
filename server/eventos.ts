/**
 * Registro de "Actividad reciente" del dashboard y bus de eventos interno.
 * Los módulos publican aquí (presencia, alertas, servicios) y quien quiera escucha:
 * el SSE para refrescar la pantalla y las alertas para avisar por Telegram.
 */

export type TipoEvento =
  | "natalia_conectada"
  | "natalia_desconectada"
  | "formulario_abierto"
  | "formulario_enviado"
  | "alerta"
  | "alerta_resuelta"
  | "servicio";

export type Evento = { id: number; ts: number; tipo: TipoEvento; texto: string };

const MAX = 40;
const lista: Evento[] = [];
const oyentes = new Set<(e: Evento) => void>();
let siguienteId = 1;

export function publicar(tipo: TipoEvento, texto: string) {
  const e: Evento = { id: siguienteId++, ts: Date.now(), tipo, texto };
  lista.unshift(e);
  if (lista.length > MAX) lista.pop();
  for (const fn of oyentes) fn(e);
  return e;
}

export const eventosRecientes = (n = 15) => lista.slice(0, n);

export function alPublicar(fn: (e: Evento) => void) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
