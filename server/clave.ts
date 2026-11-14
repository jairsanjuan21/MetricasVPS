import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Hash de contraseñas con scrypt (incluido en Node). Es lento a propósito y usa mucha memoria,
 * así que probar millones de contraseñas contra un hash robado sale carísimo.
 * Formato guardado: scrypt$N$r$p$salBase64$hashBase64
 */

const scryptAsync = promisify(scrypt) as (clave: string, sal: Buffer, largo: number, opciones: object) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashearClave(clave: string) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(clave, sal, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString("base64")}$${hash.toString("base64")}`;
}

export async function verificarClave(clave: string, guardado: string) {
  const [alg, n, r, p, sal, hash] = guardado.split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const calculado = await scryptAsync(clave, Buffer.from(sal, "base64"), esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return timingSafeEqual(calculado, esperado);
}
