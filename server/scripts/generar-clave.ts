import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { hashearClave } from "../clave.ts";

/**
 * Genera el hash de la contraseña del panel y un token para la ingesta.
 *   npm run clave
 * Copia las líneas que imprime a tu .env (o .env.production en el VPS).
 */

function preguntarOculto(texto: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Oculta lo que se escribe (no deja la contraseña en pantalla)
    const salida = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let silenciar = false;
    salida._writeToOutput = (s: string) => {
      if (!silenciar || s.includes(texto)) salida.output.write(s);
    };
    rl.question(texto, (r) => {
      rl.close();
      process.stdout.write("\n");
      resolve(r);
    });
    silenciar = true;
  });
}

const clave = process.argv[2] ?? (await preguntarOculto("Contraseña para el panel (mín. 12 caracteres): "));
if (clave.length < 12) {
  console.error("La contraseña debe tener al menos 12 caracteres.");
  process.exit(1);
}
if (!process.argv[2]) {
  const repetida = await preguntarOculto("Repítela: ");
  if (repetida !== clave) {
    console.error("No coinciden.");
    process.exit(1);
  }
}

const hash = await hashearClave(clave);
console.log("\nCopia esto en tu archivo de entorno:\n");
// Comillas simples: el hash tiene "$" y así ni Docker Compose ni la shell lo interpretan
console.log(`ADMIN_CLAVE_HASH='${hash}'`);
console.log(`INGESTA_TOKEN=${randomBytes(32).toString("base64url")}`);
console.log("\n(El INGESTA_TOKEN también va en el .env.production del catálogo como METRICAS_TOKEN)");
