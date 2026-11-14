import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { bytes, num } from "../formato.ts";
import { IconoCerrar } from "../iconos.tsx";
import type { ResumenServicios, Servicio } from "../tipos.ts";

/** Contenedores Docker del VPS, con reinicio (confirmado) y visor de logs. */
export function Servicios({ resumen }: { resumen: ResumenServicios }) {
  const [confirmar, setConfirmar] = useState<Servicio | null>(null);
  const [verLogs, setVerLogs] = useState<Servicio | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  return (
    <section id="servicios" className="tarjeta tarjeta--ancha tarjeta--tabla">
      <div className="tarjeta__barra tarjeta__barra--flex">
        <h2>Servicios y proyectos</h2>
        <span className="tenue chico">{mensaje ?? "Reiniciar pide confirmación"}</span>
      </div>

      {!resumen.activo && <p className="vacio">Sin conexión a Docker (DOCKER_URL no configurado). En el VPS esto se llena solo.</p>}
      {resumen.error && <p className="vacio vacio--alerta">No se pudo consultar Docker: {resumen.error}</p>}

      <ul className="servicios">
        {resumen.servicios.map((s) => {
          const bien = s.estado === "running" && s.salud !== "enferma";
          return (
            <li key={s.id} className="servicio">
              <span className={bien ? "punto punto--vivo-fijo" : "punto punto--caido"} />
              <div className="servicio__nombre">
                <span className="mono">
                  {s.proyecto && <span className="tenue">{s.proyecto}/</span>}
                  {s.nombre}
                </span>
                <span className="tenue chico">
                  {s.detalle}
                  {s.salud === "enferma" ? " · no responde" : ""}
                </span>
              </div>
              <span className="mono tenue chico servicio__uso">
                {s.estado === "running"
                  ? `CPU ${s.cpuPct === null ? "…" : num(s.cpuPct, 1) + " %"} · ${s.memoriaB === null ? "…" : bytes(s.memoriaB, 0)}`
                  : "detenido"}
              </span>
              <div className="servicio__acciones">
                <button type="button" className="boton" onClick={() => setConfirmar(s)}>
                  Reiniciar
                </button>
                <button type="button" className="boton" onClick={() => setVerLogs(s)}>
                  Logs
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {confirmar && (
        <Dialogo titulo={`¿Reiniciar ${confirmar.nombre}?`} alCerrar={() => setConfirmar(null)}>
          <p>
            El servicio <strong className="mono">{confirmar.proyecto ? `${confirmar.proyecto}/` : ""}{confirmar.nombre}</strong> se detendrá unos
            segundos. Si es el catálogo, quien esté llenando el formulario podría perder lo que lleva escrito.
          </p>
          <div className="dialogo__acciones">
            <button type="button" className="boton" onClick={() => setConfirmar(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="boton boton--peligro"
              onClick={async () => {
                const s = confirmar;
                setConfirmar(null);
                setMensaje(`Reiniciando ${s.nombre}…`);
                try {
                  await api(`/servicios/${s.id}/reiniciar`, { metodo: "POST" });
                  setMensaje(`${s.nombre} reiniciado`);
                } catch (e) {
                  setMensaje(e instanceof Error ? e.message : "No se pudo reiniciar");
                }
              }}
            >
              Sí, reiniciar
            </button>
          </div>
        </Dialogo>
      )}

      {verLogs && <VisorLogs servicio={verLogs} alCerrar={() => setVerLogs(null)} />}
    </section>
  );
}

function VisorLogs({ servicio, alCerrar }: { servicio: Servicio; alCerrar: () => void }) {
  const [texto, setTexto] = useState("Cargando…");
  const pre = useRef<HTMLPreElement>(null);

  useEffect(() => {
    api<{ texto: string }>(`/servicios/${servicio.id}/logs?lineas=300`)
      .then((r) => setTexto(r.texto || "(sin líneas de log)"))
      .catch((e: Error) => setTexto(e.message));
  }, [servicio.id]);

  useEffect(() => {
    pre.current?.scrollTo({ top: pre.current.scrollHeight });
  }, [texto]);

  return (
    <Dialogo titulo={`Logs · ${servicio.nombre}`} alCerrar={alCerrar} ancho>
      <pre ref={pre} className="logs">
        {texto}
      </pre>
    </Dialogo>
  );
}

/** <dialog> nativo: trae el foco atrapado, Escape para cerrar y fondo inerte sin librerías. */
function Dialogo({ titulo, alCerrar, ancho, children }: { titulo: string; alCerrar: () => void; ancho?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className={ancho ? "dialogo dialogo--ancho" : "dialogo"} onClose={alCerrar} aria-label={titulo}>
      <div className="dialogo__cabeza">
        <h3>{titulo}</h3>
        <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => ref.current?.close()}>
          <IconoCerrar />
        </button>
      </div>
      {children}
    </dialog>
  );
}
