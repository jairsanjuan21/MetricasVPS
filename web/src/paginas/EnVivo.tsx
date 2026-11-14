import { useEffect } from "react";
import { useReloj, useVivo } from "../useVivo.ts";
import { COLOR_EVENTO } from "../componentes/Catalogo.tsx";
import { SelectorTema } from "../tema.tsx";
import { bytes, duracion, haceCuanto, hora, num, tiempoDesde } from "../formato.ts";
import type { Evento, Servicio } from "../tipos.ts";

/** Proyecto de Docker Compose del catálogo (los contenedores se llaman fersautos/app y fersautos/db). */
const PROYECTO = "fersautos";

/** Solo lo que pasa en el catálogo: la actividad del servidor no se mezcla aquí. */
const DEL_CATALOGO: Evento["tipo"][] = ["natalia_conectada", "natalia_desconectada", "formulario_abierto", "formulario_enviado"];

/**
 * Ventana aparte con solo el proyecto Fersautos (ruta /en-vivo). Diseño "A · Panel compacto":
 * salud de app/db, Natalia, 4 contadores, visitantes ahora y actividad del catálogo.
 */
export function EnVivo() {
  const { estado, conectado } = useVivo();
  const ahora = useReloj(5_000);
  const p = estado?.presencia;

  // El título de la pestaña también avisa: se ve aunque la ventana esté minimizada
  useEffect(() => {
    if (!p) return;
    const enFormulario = p.conteo.formulario ? ` · ${p.conteo.formulario} en formulario` : "";
    document.title = `(${p.conteo.conectados}) Fersautos en vivo${enFormulario}`;
    return () => {
      document.title = "VPS Monitor";
    };
  }, [p]);

  const servicios = (estado?.servicios.servicios ?? []).filter((s) => s.proyecto === PROYECTO);
  const eventos = (estado?.eventos ?? []).filter((e) => DEL_CATALOGO.includes(e.tipo));
  const ultimoEnvio = eventos.find((e) => e.tipo === "formulario_enviado");
  const escribiendo = p?.sesiones.filter((s) => s.escribiendo).length ?? 0;

  return (
    <div className="ev">
      <header className="ev__cabeza">
        <div className="ev__marca">
          <div className="ev__logo" aria-hidden="true">
            F
          </div>
          <div className="ev__titulo">
            <h1>Fersautos · en vivo</h1>
            <span className="en-vivo">
              <span className={conectado ? "punto punto--vivo" : "punto punto--apagado"} />
              {conectado ? `Actualizado ${hora(estado?.metricas?.ts ?? ahora)}` : "Reconectando…"}
            </span>
          </div>
        </div>
        <div className="ev__acciones">
          <div className="ev__salud" aria-label="Estado de los contenedores del catálogo">
            {servicios.length === 0 && <span className="ev__chip tenue">{estado?.servicios.activo ? "sin contenedores" : "Docker sin conectar"}</span>}
            {servicios.map((s) => (
              <ChipServicio key={s.id} s={s} />
            ))}
          </div>
          <SelectorTema compacto />
        </div>
      </header>

      {!p ? (
        <p className="tenue">Conectando con el servidor…</p>
      ) : (
        <>
          <div className="ev__fila">
            <section className="tarjeta ev__natalia">
              <div className="natalia__cabeza">
                <div className={p.natalia.enLinea ? "avatar avatar--en-linea" : "avatar"}>N</div>
                <div>
                  <strong className="natalia__nombre">Natalia</strong>
                  <span className="tenue chico">Usuaria principal</span>
                </div>
              </div>
              <div className={p.natalia.enLinea ? "presencia presencia--en-linea" : "presencia"} role="status">
                <span className={p.natalia.enLinea ? "punto punto--vivo" : "punto punto--apagado"} />
                {p.natalia.enLinea
                  ? `En línea desde las ${hora(p.natalia.desde!)}`
                  : p.natalia.ultimaVez
                    ? `Desconectada · última vez ${haceCuanto(p.natalia.ultimaVez, ahora)}`
                    : "Desconectada"}
              </div>
              <dl className="natalia__datos">
                {p.natalia.enLinea && (
                  <>
                    <div>
                      <dt>Viendo</dt>
                      <dd>{p.natalia.pagina}</dd>
                    </div>
                    <div>
                      <dt>Dispositivo</dt>
                      <dd>{p.natalia.dispositivo}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Conectada hoy</dt>
                  <dd className="mono">{duracion(p.hoy.nataliaSeg)}</dd>
                </div>
              </dl>
            </section>

            <div className="ev__contadores">
              <div className="tarjeta contador">
                <span className="tenue">Conectados ahora</span>
                <span className="cifra-enorme">{p.conteo.conectados}</span>
                <span className="tenue chico">pico de hoy: {p.hoy.pico}</span>
              </div>
              <div className="tarjeta contador">
                <span className="tenue">Viendo el catálogo</span>
                <span className="cifra-enorme">{p.conteo.catalogo}</span>
                <span className="tenue chico">sin formulario abierto</span>
              </div>
              <div className="tarjeta contador contador--formulario">
                <span className="contador__titulo">Llenando formulario</span>
                <span className="cifra-enorme">{p.conteo.formulario}</span>
                <span className="chico">{escribiendo ? `${escribiendo} escribiendo ahora` : "nadie escribiendo"}</span>
              </div>
              <div className="tarjeta contador">
                <span className="tenue">Formularios enviados hoy</span>
                <span className="cifra-enorme ev__enviados">{p.hoy.enviados}</span>
                <span className="tenue chico">{ultimoEnvio ? `último ${haceCuanto(ultimoEnvio.ts, ahora)}` : "ninguno desde que arrancó el monitor"}</span>
              </div>
            </div>
          </div>

          <section className="tarjeta tarjeta--tabla">
            <h2 className="tarjeta__barra">Visitantes ahora</h2>
            {p.sesiones.length === 0 ? (
              <p className="vacio">Nadie navegando el catálogo en este momento.</p>
            ) : (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Visitante</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Página</th>
                      <th scope="col">Dispositivo</th>
                      <th scope="col" className="derecha">
                        Tiempo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.sesiones.map((s) => (
                      <tr key={s.alias}>
                        <td className="mono">{s.alias}</td>
                        <td>
                          {s.actividad === "formulario" ? (
                            <span className="insignia insignia--formulario">{s.escribiendo ? "Escribiendo…" : "En el formulario"}</span>
                          ) : (
                            <span className="insignia">Viendo catálogo</span>
                          )}
                        </td>
                        <td>{s.pagina}</td>
                        <td className="tenue">{s.dispositivo}</td>
                        <td className="mono tenue derecha">{tiempoDesde(s.desde, ahora)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="tarjeta ev__actividad">
            <h2>Actividad</h2>
            {eventos.length === 0 ? (
              <p className="tenue chico">Sin actividad del catálogo desde que arrancó el monitor.</p>
            ) : (
              <ul>
                {eventos.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    <span className={`punto ${COLOR_EVENTO[e.tipo]}`} />
                    {e.texto}
                    <time className="mono tenue" dateTime={new Date(e.ts).toISOString()}>
                      {haceCuanto(e.ts, ahora)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ChipServicio({ s }: { s: Servicio }) {
  const bien = s.estado === "running" && s.salud !== "enferma";
  return (
    <span className="ev__chip" title={s.detalle}>
      <span className={bien ? "punto punto--vivo-fijo" : "punto punto--caido"} />
      {s.nombre} ·{" "}
      {bien ? `${s.cpuPct === null ? "…" : num(s.cpuPct, 1) + " %"} · ${s.memoriaB === null ? "…" : bytes(s.memoriaB, 0)}` : "caído"}
    </span>
  );
}
