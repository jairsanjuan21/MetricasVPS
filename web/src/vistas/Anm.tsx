import { useState } from "react";
import { api } from "../api.ts";
import { haceCuanto, num } from "../formato.ts";
import { enlace } from "../ruta.ts";
import { ChipServicio } from "../paginas/EnVivo.tsx";
import type { General, ResumenAnm, Servicio } from "../tipos.ts";

export const duracionTexto = (seg: number) => (seg < 90 ? `${seg} s` : `${num(seg / 60, seg < 600 ? 1 : 0)} min`);

/**
 * El portal de la ANM es externo: si va lento o falla, no es culpa de tu app.
 * Se juzga por el último barrido (cuánto tardó frente a lo normal y si tuvo consultas con error).
 */
export function estadoPortal(d: ResumenAnm) {
  const b = d.barrido;
  const lento = !!(b.ultimo_duracion_seg && b.duracion_normal_seg && b.ultimo_duracion_seg > b.duracion_normal_seg * 2);
  const conErrores = (b.ultimo_errores ?? 0) > 0;
  const fallo = b.ultimo_estado === "fallida";
  if (fallo) return { nivel: "mal" as const, lento, texto: "Falló el último barrido", corto: "falló el último barrido de ANM" };
  if (conErrores)
    return {
      nivel: "aviso" as const,
      lento,
      texto: `${b.ultimo_errores} consultas con error en el último barrido`,
      corto: "el portal de la ANM dio errores",
    };
  if (lento)
    return { nivel: "aviso" as const, lento, texto: "Lento en el último barrido · no es tu app", corto: "el portal de la ANM respondió lento" };
  return { nivel: "ok" as const, lento, texto: "Respondió bien en el último barrido", corto: "" };
}

export async function confirmarBarrido(setMensaje: (m: string) => void) {
  if (!confirm("¿Iniciar un barrido de la ANM ahora? Consulta todas las placas y puede tardar unos minutos.")) return;
  setMensaje("Iniciando barrido…");
  try {
    await api("/anm/barrer", { metodo: "POST" });
    setMensaje("Barrido iniciado. Aparecerá en la línea de tiempo cuando termine.");
  } catch (e) {
    setMensaje(e instanceof Error ? e.message : "No se pudo iniciar el barrido.");
  }
}

const DIA = 864e5;
const fechaIso = (ts: number) => new Date(ts - 5 * 3600_000).toISOString().slice(0, 10);

/** Tira de los próximos 10 días hábiles con un punto por cada vencimiento */
export function CalendarioVencimientos({ vencimientos, ahora, suelto }: { vencimientos: ResumenAnm["vencimientos"]; ahora: number; suelto?: boolean }) {
  const dias: { iso: string; ts: number }[] = [];
  for (let ts = ahora; dias.length < 10; ts += DIA) {
    const dow = new Date(ts - 5 * 3600_000).getUTCDay();
    if (dow !== 0 && dow !== 6) dias.push({ iso: fechaIso(ts), ts });
  }
  const primero = vencimientos.find((v) => v.dias_habiles !== null && v.dias_habiles >= 0);
  return (
    <div className={suelto ? "calendario calendario--suelto" : "calendario"}>
      <span className="tenue chico">Vencimientos · próximos 10 días hábiles</span>
      <div className="calendario__dias">
        {dias.map((d, i) => {
          const n = vencimientos.filter((v) => v.fecha_limite === d.iso).length;
          const clase = n === 0 ? "" : i <= 1 ? " calendario__dia--urgente" : i <= 5 ? " calendario__dia--pronto" : " calendario__dia--despues";
          const fecha = new Date(d.ts - 5 * 3600_000);
          return (
            <div key={d.iso} className={`calendario__dia${clase}`} title={n ? `${n} vencimiento${n > 1 ? "s" : ""}` : "sin vencimientos"}>
              <span>{fecha.toLocaleDateString("es-CO", { weekday: "short", timeZone: "UTC" }).replace(".", "")}</span>
              <b>{fecha.getUTCDate()}</b>
              <span aria-hidden="true">{"●".repeat(Math.min(n, 3))}</span>
            </div>
          );
        })}
      </div>
      {primero && (
        <a href={enlace("proyecto/anm")} className="chico">
          {primero.dias_habiles === 0 ? "Hoy" : primero.dias_habiles === 1 ? "Mañana" : `En ${primero.dias_habiles} días hábiles`} vence{" "}
          {primero.placa ?? "una placa"} · {primero.acto ?? "notificación"} →
        </a>
      )}
    </div>
  );
}

/** Página del proyecto ANM: vencimientos completos, barridos recientes y sus contenedores. */
export function Anm({ g, servicios, ahora }: { g: General | null; servicios: Servicio[]; ahora: number }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const a = g?.anm;
  const d = a?.datos;
  const b = d?.barrido;
  const maxDur = Math.max(1, ...(b?.recientes ?? []).map((r) => r.duracion_seg));

  return (
    <>
      <header className="cabecera">
        <div className="cabecera__titulo">
          <h1>Notificaciones ANM</h1>
          <span className="tenue">{d ? `${d.placas} placas vigiladas · actualizado ${haceCuanto(a!.actualizado, ahora)}` : "…"}</span>
        </div>
        <div className="cabecera__acciones">
          <a className="boton boton--enlace" href={enlace("logs", { proyecto: "anm" })}>
            Ver logs
          </a>
          {a?.activo && (
            <button type="button" className="boton boton--primario" disabled={b?.en_curso} onClick={() => confirmarBarrido(setMensaje)}>
              {b?.en_curso ? "Barriendo…" : "Barrer ahora"}
            </button>
          )}
        </div>
      </header>
      {mensaje && <p className="aviso aviso--info">{mensaje}</p>}

      <div className="ev__salud">
        {servicios.map((s) => (
          <ChipServicio key={s.id} s={s} />
        ))}
      </div>

      {!a?.activo || !d ? (
        <p className="vacio tarjeta">{a?.error ?? "Configura ANM_TOKEN en el monitor y MONITOR_TOKEN en ANM para ver estos datos."}</p>
      ) : (
        <>
          <section className="tarjeta">
            <CalendarioVencimientos vencimientos={d.vencimientos} ahora={ahora} suelto />
          </section>

          <div className="fila">
            <section className="tarjeta tarjeta--ancha tarjeta--tabla">
              <h2 className="tarjeta__barra">Vencimientos sin responder</h2>
              {d.vencimientos.length === 0 ? (
                <p className="vacio">No hay vencimientos en las próximas 3 semanas.</p>
              ) : (
                <div className="tabla-scroll">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Placa</th>
                        <th scope="col">Acto</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Fecha límite</th>
                        <th scope="col" className="derecha">
                          Días hábiles
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.vencimientos.map((v) => (
                        <tr key={v.id}>
                          <td className="mono">{v.placa ?? "–"}</td>
                          <td>{v.acto ?? "–"}</td>
                          <td className="tenue">{v.estado ?? "nueva"}</td>
                          <td className="mono">{v.fecha_limite}</td>
                          <td className="derecha">
                            <span
                              className={`insignia${(v.dias_habiles ?? 99) <= 1 ? " insignia--rojo" : (v.dias_habiles ?? 99) <= 5 ? " insignia--formulario" : ""}`}
                            >
                              {v.dias_habiles === null ? "–" : v.dias_habiles < 0 ? `vencido hace ${-v.dias_habiles}` : v.dias_habiles === 0 ? "hoy" : v.dias_habiles}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="tarjeta tarjeta--angosta">
              <h2>Barridos recientes</h2>
              <div className="barridos" role="img" aria-label="Duración de los últimos barridos">
                {(b?.recientes ?? []).map((r) => {
                  const lento = b?.duracion_normal_seg && r.duracion_seg > b.duracion_normal_seg * 2;
                  return (
                    <div
                      key={r.inicio}
                      className={`barridos__barra${lento ? " barridos__barra--lenta" : ""}${r.estado === "fallida" ? " barridos__barra--fallida" : ""}`}
                      style={{ height: `${Math.max(6, (r.duracion_seg / maxDur) * 100)}%` }}
                      title={`${new Date(r.inicio).toLocaleString("es-CO", { timeZone: "America/Bogota" })} · ${duracionTexto(r.duracion_seg)} · ${r.nuevas} nuevas`}
                    />
                  );
                })}
              </div>
              <dl className="datos">
                <dt>Último</dt>
                <dd>{b?.ultimo_inicio ? `${haceCuanto(Date.parse(b.ultimo_inicio), ahora)} · ${duracionTexto(b.ultimo_duracion_seg ?? 0)}` : "–"}</dd>
                <dt>Duración normal</dt>
                <dd>{b?.duracion_normal_seg ? duracionTexto(b.duracion_normal_seg) : "–"}</dd>
                <dt>Nuevas hoy</dt>
                <dd>{d.notificaciones.nuevas_hoy}</dd>
                <dt>Correos pendientes</dt>
                <dd>{d.notificaciones.pendientes_envio}</dd>
                <dt>Portal de la ANM</dt>
                <dd>{estadoPortal(d).texto}</dd>
              </dl>
            </section>
          </div>
        </>
      )}
    </>
  );
}
