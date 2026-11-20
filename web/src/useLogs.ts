import { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import type { LineaLog } from "./tipos.ts";

const MAX = 3000;

/**
 * Logs en vivo de todos los contenedores (SSE /api/logs/vivo).
 * Con `pausado`, las líneas nuevas se guardan aparte y entran al reanudar.
 */
export function useLogs(pausado = false) {
  const [lineas, setLineas] = useState<LineaLog[]>([]);
  const [conectado, setConectado] = useState(false);
  const [enEspera, setEnEspera] = useState(0);
  const espera = useRef<LineaLog[]>([]);
  const pausa = useRef(pausado);
  pausa.current = pausado;

  useEffect(() => {
    const es = new EventSource("/api/logs/vivo");
    es.addEventListener("open", () => setConectado(true));
    es.addEventListener("error", () => {
      setConectado(false);
      api("/sesion").catch(() => {});
    });
    es.addEventListener("inicio", (e) => setLineas(JSON.parse((e as MessageEvent).data as string) as LineaLog[]));
    es.addEventListener("lineas", (e) => {
      const nuevas = JSON.parse((e as MessageEvent).data as string) as LineaLog[];
      if (pausa.current) {
        espera.current.push(...nuevas);
        setEnEspera(espera.current.length);
        return;
      }
      setLineas((l) => [...l, ...nuevas].slice(-MAX));
    });
    return () => es.close();
  }, []);

  // Al reanudar entran las que esperaban
  useEffect(() => {
    if (pausado || espera.current.length === 0) return;
    const pendientes = espera.current;
    espera.current = [];
    setEnEspera(0);
    setLineas((l) => [...l, ...pendientes].slice(-MAX));
  }, [pausado]);

  return { lineas, conectado, enEspera };
}
