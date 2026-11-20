import { haceCuanto, hora, tiempoDesde } from "../formato.ts";
import { IconoLapiz } from "../iconos.tsx";
import type { Evento, Presencia } from "../tipos.ts";

/** Natalia + contadores + tabla de sesiones. Se usa en el dashboard y en la ventana aparte (/en-vivo). */
export function Catalogo({ p, ahora }: { p: Presencia; ahora: number }) {
  const n = p.natalia;
  return (
    <div className="fila">
      <section className="tarjeta tarjeta--angosta natalia">
        <div className="natalia__cabeza">
          <div className={n.enLinea ? "avatar avatar--en-linea" : "avatar"}>N</div>
          <div>
            <strong className="natalia__nombre">Natalia</strong>
            <span className="tenue chico">Usuaria principal · administra el catálogo</span>
          </div>
        </div>
        <div className={n.enLinea ? "presencia presencia--en-linea" : "presencia"} role="status">
          <span className={n.enLinea ? "punto punto--vivo" : "punto punto--apagado"} />
          {n.enLinea
            ? `En línea · conectada desde las ${hora(n.desde!)}`
            : n.ultimaVez
              ? `Desconectada · última vez ${haceCuanto(n.ultimaVez, ahora)}`
              : "Desconectada"}
        </div>
        {n.enLinea && (
          <dl className="natalia__datos">
            <div>
              <dt>Viendo</dt>
              <dd>{n.pagina}</dd>
            </div>
            <div>
              <dt>Dispositivo</dt>
              <dd>
                {n.dispositivo}
                {n.dispositivos > 1 ? ` (+${n.dispositivos - 1})` : ""}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <div className="catalogo">
        <div className="tarjeta contador">
          <span className="tenue">Conectados ahora</span>
          <span className="cifra-enorme">{p.conteo.conectados}</span>
          <span className="tenue chico">pico de hoy: {p.hoy.pico}</span>
        </div>
        <div className="tarjeta contador">
          <span className="tenue">Viendo el catálogo</span>
          <span className="cifra-enorme">{p.conteo.catalogo}</span>
          <span className="tenue chico">visitantes sin formulario abierto</span>
        </div>
        <div className="tarjeta contador contador--formulario">
          <span className="contador__titulo">
            <IconoLapiz tam={14} /> Llenando formulario
          </span>
          <span className="cifra-enorme">{p.conteo.formulario}</span>
          <span className="chico">enviados hoy: {p.hoy.enviados}</span>
        </div>

        <section className="tarjeta tarjeta--tabla">
          <h3 className="tarjeta__barra">Sesiones activas</h3>
          {p.sesiones.length === 0 ? (
            <p className="vacio">Nadie navegando el catálogo en este momento.</p>
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Visitante</th>
                    <th scope="col">Actividad</th>
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
      </div>
    </div>
  );
}

export const COLOR_EVENTO: Record<Evento["tipo"], string> = {
  natalia_conectada: "punto--vivo-fijo",
  natalia_desconectada: "punto--apagado",
  formulario_abierto: "punto--ambar",
  formulario_enviado: "punto--lila",
  alerta: "punto--ambar",
  alerta_resuelta: "punto--apagado",
  servicio: "punto--anillo",
  despliegue: "punto--anillo",
  anm_barrido: "punto--gris",
  error_nuevo: "punto--rojo",
};

export function Actividad({ eventos, ahora }: { eventos: Evento[]; ahora: number }) {
  if (eventos.length === 0) return <p className="vacio">Sin actividad desde que arrancó el monitor.</p>;
  return (
    <ol className="actividad">
      {eventos.slice(0, 8).map((e) => (
        <li key={e.id}>
          <span className={`punto ${COLOR_EVENTO[e.tipo]}`} />
          <div>
            <span>{e.texto}</span>
            <time className="mono tenue chico" dateTime={new Date(e.ts).toISOString()} title={hora(e.ts)}>
              {haceCuanto(e.ts, ahora)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
