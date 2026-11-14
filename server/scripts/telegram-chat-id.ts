/**
 * Averigua el TELEGRAM_CHAT_ID: el número del chat donde el bot te va a escribir.
 *   1. Crea el bot con @BotFather y pon su token en TELEGRAM_TOKEN.
 *   2. Abre tu bot en Telegram y mándale cualquier mensaje (por ejemplo "hola").
 *   3. Corre este script: imprime el chat_id de quien le escribió.
 */

const token = process.argv[2] ?? process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("Falta el token: ponlo en TELEGRAM_TOKEN o pásalo como argumento.");
  process.exit(1);
}

const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const datos = (await r.json()) as {
  ok: boolean;
  description?: string;
  result?: { message?: { chat: { id: number; first_name?: string; title?: string; type: string } } }[];
};

if (!datos.ok) {
  console.error("Telegram rechazó el token:", datos.description);
  process.exit(1);
}

const chats = new Map<number, string>();
for (const u of datos.result ?? []) {
  const c = u.message?.chat;
  if (c) chats.set(c.id, c.title ?? c.first_name ?? c.type);
}

if (chats.size === 0) {
  console.log("No hay mensajes todavía. Abre tu bot en Telegram, mándale \"hola\" y vuelve a correr esto.");
} else {
  console.log("Copia en tu .env.production la línea del chat que es tuyo:\n");
  for (const [id, nombre] of chats) console.log(`TELEGRAM_CHAT_ID=${id}    (${nombre})`);
}
