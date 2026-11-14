import { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import type { EstadoCompleto, Evento, Instantanea, Muestra, Presencia, Rango, ResumenServicios } from "./tipos.ts";

/**
 * Conexión en vivo con el servidor (Server-Sent Events).
 * EventSource se reconecta solo si se cae la red; si el motivo es que la sesión venció,
 * se comprueba /api/sesion y la app vuelve al login.
 */
export function useVivo() {
  const [estado, setEstado] = useState<EstadoCompleto | null>(null);
  const [conectado, setConectado] = useState(false);
  const oyentesMuestra = useRef(new Set<(m: Instantanea) => void>());

  useEffect(() => {
    const es = new EventSource("/api/vivo");
    const leer = <T,>(e: MessageEvent) => JSON.parse(e.data as string) as T;

    es.addEventListener("open", () => setConectado(true));
    es.addEventListener("error", () => {
      setConectado(false);
      api("/sesion").catch(() => {}); // si responde 401, api() dispara el regreso al login
    });
    es.addEventListener("estado", (e) => setEstado(leer<EstadoCompleto>(e)));
    es.addEventListener("metricas", (e) => {
      const m = leer<Instantanea>(e);
      setEstado((s) => (s ? { ...s, metricas: m } : s));
      for (const fn of oyentesMuestra.current) fn(m);
    });
    es.addEventListener("presencia", (e) => {
      const p = leer<Presencia>(e);
      setEstado((s) => (s ? { ...s, presencia: p } : s));
    });
    es.addEventListener("servicios", (e) => {
      const sv = leer<ResumenServicios>(e);
      setEstado((s) => (s ? { ...s, servicios: sv } : s));
    });
    es.addEventListener("evento", (e) => {
      const ev = leer<Evento>(e);
      setEstado((s) => (s ? { ...s, eventos: [ev, ...s.eventos].slice(0, 15) } : s));
    });
    es.addEventListener("sesion", () => {
      es.close();
      api("/sesion").catch(() => {});
    });

    return () => es.close();
  }, []);

  return { estado, conectado, oyentesMuestra: oyentesMuestra.current };
}

const PUNTOS_15M = 300;

/** Serie para la gráfica: carga el historial del rango y, en "15 min", le va sumando cada muestra en vivo. */
export function useHistorial(rango: Rango, oyentes: Set<(m: Instantanea) => void>) {
  const [puntos, setPuntos] = useState<Muestra[]>([]);

  useEffect(() => {
    let vivo = true;
    const cargar = () =>
      api<{ puntos: Muestra[] }>(`/historial?rango=${rango}`)
        .then((r) => vivo && setPuntos(r.puntos))
        .catch(() => {});
    cargar();

    if (rango === "15m") {
      const fn = (m: Instantanea) =>
        setPuntos((p) =>
          [...p, { ts: m.ts, cpu: m.cpu.pct, ram: m.ram.pct, swap: m.swap.pct, redIn: m.red.inMbps, redOut: m.red.outMbps }].slice(
            -PUNTOS_15M,
          ),
        );
      oyentes.add(fn);
      return () => {
        vivo = false;
        oyentes.delete(fn);
      };
    }
    // 1 h y 24 h se guardan por minuto: basta con recargar cada minuto
    const t = setInterval(cargar, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [rango, oyentes]);

  return puntos;
}

/** Re-render periódico para que los "hace 3 min" avancen solos. */
export function useReloj(ms = 15_000) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return ahora;
}
