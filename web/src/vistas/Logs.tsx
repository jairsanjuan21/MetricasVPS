import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.ts";
import { useLogs } from "../useLogs.ts";
import { haceCuanto } from "../formato.ts";
import { IconoBuscar } from "../iconos.tsx";
import type { ErrorAgrupado, LineaLog, Proyecto } from "../tipos.ts";

type Props = { proyectos: Proyecto[]; params: URLSearchParams };

const NIVELES: { id: "todos" | "problemas" | "error"; texto: string }[] = [
  { id: "todos", texto: "Todo" },
  { id: "problemas", texto: "WARN + ERROR" },
  { id: "error", texto: "Solo ERROR" },
];

const horaLog = (ts: number) =>
  new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/Bogota" });

/** Cada proyecto con su color, para distinguir las líneas de un vistazo */
const COLORES = ["var(--azul)", "var(--lila)", "var(--verde)", "var(--rosa)", "var(--cian)"];
const colorDe = (grupo: string, grupos: string[]) => (grupo === "proxy" || grupo === "metricas" ? "var(--tenue)" : COLORES[grupos.indexOf(grupo) % COLORES.length]);

/**
 * Consola de logs en vivo de todo el VPS: todos los contenedores en una sola vista,
 * con filtros por proyecto y nivel, búsqueda, pausa y errores agrupados al lado.
 */
export function Logs({ proyectos, params }: Props) {
  const [pausado, setPausado] = useState(false);
  const { lineas, conectado, enEspera } = useLogs(pausado);
  const [grupo, setGrupo] = useState(params.get("proyecto") ?? "todos");
  const [fuente, setFuente] = useState(params.get("fuente") ?? "");
  const [nivel, setNivel] = useState<"todos" | "problemas" | "error">((params.get("nivel") as "error") ?? "todos");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [siguiendo, setSiguiendo] = useState(!params.get("ts"));
  const [errores, setErrores] = useState<ErrorAgrupado[]>([]);
  const caja = useRef<HTMLDivElement>(null);
  const irATs = useRef(Number(params.get("ts")) || 0);

  // Si llega un enlace nuevo (desde la línea de tiempo) se aplican sus filtros
  useEffect(() => {
    setQ(params.get("q") ?? "");
    setFuente(params.get("fuente") ?? "");
    setGrupo(params.get("proyecto") ?? "todos");
    irATs.current = Number(params.get("ts")) || 0;
    if (irATs.current) setSiguiendo(false);
  }, [params]);

  useEffect(() => {
    const cargar = () => api<ErrorAgrupado[]>("/logs/errores?horas=24").then(setErrores).catch(() => {});
    cargar();
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, []);

  const grupos = useMemo(() => [...new Set(lineas.map((l) => l.grupo))].sort(), [lineas]);
  const nombreGrupo = (g: string) => proyectos.find((p) => p.id === g)?.nombre ?? g;

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return lineas.filter(
      (l) =>
        (grupo === "todos" || l.grupo === grupo) &&
        (!fuente || l.fuente === fuente) &&
        (nivel === "todos" || (nivel === "error" ? l.nivel === "error" : l.nivel !== "info")) &&
        (!texto || l.texto.toLowerCase().includes(texto) || l.fuente.includes(texto)),
    );
  }, [lineas, grupo, fuente, nivel, q]);

  const conteo = useMemo(() => {
    const hora = Date.now() - 3600_000;
    const ultimaHora = lineas.filter((l) => l.ts >= hora);
    return { warn: ultimaHora.filter((l) => l.nivel === "warn").length, error: ultimaHora.filter((l) => l.nivel === "error").length };
  }, [lineas]);

  // Seguir el final, o saltar a la línea del momento que se pidió (enlace con ?ts=)
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    if (irATs.current && visibles.length) {
      const objetivo = visibles.find((l) => l.ts >= irATs.current) ?? visibles[visibles.length - 1]!;
      setSeleccion(objetivo.id);
      document.getElementById(`linea-${objetivo.id}`)?.scrollIntoView({ block: "center" });
      irATs.current = 0;
      return;
    }
    if (siguiendo) el.scrollTop = el.scrollHeight;
  }, [visibles, siguiendo]);

  const alDesplazar = () => {
    const el = caja.current;
    if (!el) return;
    const alFinal = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (alFinal !== siguiendo) setSiguiendo(alFinal);
  };

  const verContexto = (l: LineaLog) => {
    setFuente(l.fuente);
    setQ("");
    setNivel("todos");
    setSeleccion(l.id);
    irATs.current = l.ts;
    setSiguiendo(false);
  };

  const hayFiltros = grupo !== "todos" || fuente || nivel !== "todos" || q;

  return (
    <>
      <header className="cabecera">
        <div className="cabecera__titulo">
          <h1>Logs en vivo</h1>
          <span className="en-vivo">
            <span className={conectado ? "punto punto--vivo" : "punto punto--apagado"} />
            {conectado ? `Todos los contenedores · ${lineas.length.toLocaleString("es-CO")} líneas en memoria` : "Reconectando…"}
          </span>
        </div>
        <div className="logs__resumen mono chico">
          última hora: <b className="texto-ambar">{conteo.warn} WARN</b> · <b className={conteo.error ? "texto-rojo" : ""}>{conteo.error} ERROR</b>
        </div>
      </header>

      <div className="vista-logs">
        <section className="terminal" aria-label="Consola de logs">
          <div className="terminal__barra">
            <div role="group" aria-label="Proyecto" className="chips-filtro">
              <button type="button" aria-pressed={grupo === "todos"} onClick={() => setGrupo("todos")}>
                Todos
              </button>
              {grupos.map((g) => (
                <button key={g} type="button" aria-pressed={grupo === g} onClick={() => setGrupo(g)}>
                  <i style={{ background: colorDe(g, grupos) }} />
                  {nombreGrupo(g)}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Nivel" className="segmentado segmentado--chico">
              {NIVELES.map((n) => (
                <button key={n.id} type="button" aria-pressed={nivel === n.id} onClick={() => setNivel(n.id)}>
                  {n.texto}
                </button>
              ))}
            </div>
            <label className="buscador">
              <IconoBuscar tam={14} />
              <span className="sr">Buscar en los logs</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en logs…" spellCheck={false} />
            </label>
            <button type="button" className="boton" onClick={() => setPausado((p) => !p)}>
              {pausado ? `Reanudar${enEspera ? ` (+${enEspera})` : ""}` : "Pausar"}
            </button>
          </div>

          {fuente && (
            <div className="terminal__aviso">
              Mostrando solo <b className="mono">{fuente}</b>
              <button type="button" className="enlace-boton" onClick={() => setFuente("")}>
                quitar
              </button>
            </div>
          )}

          <div className="terminal__lineas" ref={caja} onScroll={alDesplazar} role="log" aria-live="off">
            {visibles.length === 0 && (
              <p className="terminal__vacio">{lineas.length === 0 ? "Esperando líneas de los contenedores…" : "Ninguna línea coincide con los filtros."}</p>
            )}
            {visibles.slice(-1500).map((l) => (
              <div
                key={l.id}
                id={`linea-${l.id}`}
                className={`log log--${l.nivel}${seleccion === l.id ? " log--seleccionada" : ""}`}
                onClick={() => setSeleccion(seleccion === l.id ? null : l.id)}
              >
                <span className="log__hora">{horaLog(l.ts)}</span>
                <span className="log__fuente" style={{ color: colorDe(l.grupo, grupos) }} title={l.fuente}>
                  {l.fuente}
                </span>
                <span className="log__texto">
                  {resaltar(l.texto, q)}
                  {seleccion === l.id && (
                    <span className="log__acciones">
                      <button type="button" onClick={(e) => (e.stopPropagation(), verContexto(l))}>
                        Ver contexto de {l.fuente}
                      </button>
                      <button type="button" onClick={(e) => (e.stopPropagation(), navigator.clipboard?.writeText(l.texto))}>
                        Copiar línea
                      </button>
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="terminal__pie mono">
            <span>
              {pausado ? "En pausa · las líneas nuevas esperan" : siguiendo ? "Siguiendo en vivo" : "Desplazado · no sigue el final"}
              {" · "}
              {visibles.length.toLocaleString("es-CO")} visibles
            </span>
            <span className="terminal__pie-acciones">
              {hayFiltros && (
                <button
                  type="button"
                  className="enlace-boton"
                  onClick={() => {
                    setGrupo("todos");
                    setFuente("");
                    setNivel("todos");
                    setQ("");
                  }}
                >
                  Limpiar filtros
                </button>
              )}
              {!siguiendo && (
                <button type="button" className="enlace-boton" onClick={() => setSiguiendo(true)}>
                  Ir al final ↓
                </button>
              )}
            </span>
          </div>
        </section>

        <aside className="tarjeta logs__errores">
          <h2>Errores agrupados · 24 h</h2>
          <p className="tenue chico">Los mensajes iguales se juntan. Los nuevos son los que nunca habían aparecido.</p>
          {errores.length === 0 ? (
            <p className="vacio">Sin WARN ni ERROR en las últimas 24 horas.</p>
          ) : (
            <ul className="errores">
              {errores.map((e) => (
                <li key={e.huella}>
                  <button
                    type="button"
                    className={`error-agrupado${e.nuevo ? " error-agrupado--nuevo" : ""}`}
                    onClick={() => {
                      setQ(e.ejemplo.replace(/^\S*\d{4}-\d\d-\d\d\S*\s*/, "").slice(0, 40));
                      setFuente(e.fuente);
                      setNivel("todos");
                      setSiguiendo(true);
                    }}
                  >
                    <span className={`etiqueta-nivel etiqueta-nivel--${e.nuevo ? "nuevo" : e.nivel}`}>{e.nuevo ? "NUEVO" : e.nivel.toUpperCase()}</span>
                    <span className="error-agrupado__texto">
                      <span className="mono">{e.ejemplo.slice(0, 120)}</span>
                      <span className="tenue chico">
                        {e.fuente} · {e.nuevo ? `primera vez ${haceCuanto(e.primera)}` : `visto ${e.total.toLocaleString("es-CO")} veces`}
                      </span>
                    </span>
                    <span className="mono chico">×{e.recientes}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}

/** Resalta la búsqueda dentro de la línea */
function resaltar(texto: string, q: string) {
  const t = q.trim();
  if (!t) return texto;
  const i = texto.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark>{texto.slice(i, i + t.length)}</mark>
      {texto.slice(i + t.length)}
    </>
  );
}
