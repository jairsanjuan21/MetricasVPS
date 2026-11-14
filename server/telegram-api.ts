import { config } from "./config.ts";

/**
 * Cliente mínimo de la API de bots de Telegram (https://core.telegram.org/bots/api).
 * Cada método es un POST con JSON a https://api.telegram.org/bot<TOKEN>/<método>.
 */

export const telegramListo = () => !!(config.telegram.token && config.telegram.chatId);

export type Boton = { text: string; callback_data: string };
export type Teclado = Boton[][];

export async function llamar<T = unknown>(metodo: string, cuerpo: object = {}, timeoutMs = 10_000): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${config.telegram.token}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const datos = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!r.ok || !datos.ok) throw new Error(`Telegram ${metodo}: ${datos.description ?? r.status}`);
  return datos.result as T;
}

/** Escapa texto para parse_mode HTML (nombres de servicios, páginas, etc.). */
export const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function enviar(texto: string, teclado?: Teclado) {
  return llamar<{ message_id: number }>("sendMessage", {
    chat_id: config.telegram.chatId,
    text: texto,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(teclado ? { reply_markup: { inline_keyboard: teclado } } : {}),
  });
}

export function editar(mensajeId: number, texto: string, teclado?: Teclado) {
  return llamar("editMessageText", {
    chat_id: config.telegram.chatId,
    message_id: mensajeId,
    text: texto,
    parse_mode: "HTML",
    ...(teclado ? { reply_markup: { inline_keyboard: teclado } } : {}),
  });
}
