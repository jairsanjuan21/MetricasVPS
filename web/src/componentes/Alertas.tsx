import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { AjustesAlertas } from "../tipos.ts";

type Respuesta = { ajustes: AjustesAlertas; telegramConfigurado: boolean };

/** Interruptores de alertas: cada cambio se guarda al instante en el servidor. */
export function Alertas() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [prueba, setPrueba] = useState<string | null>(null);

  useEffect(() => {
    api<Respuesta>("/alertas").then(setDatos).catch(() => {});
  }, []);

  if (!datos) return null;
  const a = datos.ajustes;

  async function cambiar(nuevo: AjustesAlertas) {
    setDatos((d) => (d ? { ...d, ajustes: nuevo } : d));
    setGuardando(true);
    try {
      setDatos(await api<Respuesta>("/alertas", { metodo: "PUT", cuerpo: nuevo }));
    } finally {
      setGuardando(false);
    }
  }

  const filas: { clave: keyof AjustesAlertas; texto: string }[] = [
    { clave: "cpu", texto: `CPU sobre ${a.cpu.umbral} % durante ${a.cpu.minutos} min` },
    { clave: "ram", texto: `RAM sobre ${a.ram.umbral} % durante ${a.ram.minutos} min` },
    { clave: "disco", texto: `Disco sobre ${a.disco.umbral} %` },
    { clave: "servicio", texto: "Un servicio se cae o deja de responder" },
    { clave: "natalia", texto: "Natalia se conecta o desconecta" },
    { clave: "formulario", texto: "Un cliente envía el formulario" },
  ];

  return (
    <section id="alertas" className="tarjeta">
      <div className="tarjeta__cabeza">
        <h2>Alertas por Telegram</h2>
        <div className="alertas__estado">
          <span className="tenue chico" role="status">
            {guardando
              ? "Guardando…"
              : (prueba ??
                (datos.telegramConfigurado ? "Llegan a tu chat de Telegram" : "Bot sin configurar: solo se verán en Actividad reciente"))}
          </span>
          {datos.telegramConfigurado && (
            <button
              type="button"
              className="boton"
              onClick={async () => {
                setPrueba("Enviando…");
                try {
                  await api("/alertas/prueba", { metodo: "POST" });
                  setPrueba("Mensaje de prueba enviado. Revisa Telegram.");
                } catch (e) {
                  setPrueba(e instanceof Error ? e.message : "No se pudo enviar");
                }
              }}
            >
              Enviar prueba
            </button>
          )}
        </div>
      </div>
      <div className="alertas">
        {filas.map((f) => (
          <label key={f.clave} className="alerta">
            <input
              type="checkbox"
              checked={a[f.clave].activa}
              onChange={(e) => cambiar({ ...a, [f.clave]: { ...a[f.clave], activa: e.target.checked } })}
            />
            {f.texto}
          </label>
        ))}
      </div>
    </section>
  );
}
