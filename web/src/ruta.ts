import { useEffect, useState } from "react";

/**
 * Rutas del panel con "#": #/logs, #/proyecto/anm, #/logs?q=Brevo
 * Con # el servidor no necesita saber de rutas y el botón Atrás del navegador funciona.
 */
export type Ruta = { vista: string; id?: string; params: URLSearchParams };

function leer(): Ruta {
  const [camino = "", consulta = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [vista = "", id] = camino.split("/");
  return { vista: vista || "general", id, params: new URLSearchParams(consulta) };
}

export function useRuta() {
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const alCambiar = () => {
      setRuta(leer());
      scrollTo({ top: 0 });
    };
    addEventListener("hashchange", alCambiar);
    return () => removeEventListener("hashchange", alCambiar);
  }, []);
  return ruta;
}

export const enlace = (vista: string, params?: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return `#/${vista}${s ? "?" + s : ""}`;
};

export const navegar = (destino: string) => {
  location.hash = destino.replace(/^#/, "");
};
