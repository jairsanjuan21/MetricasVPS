import { useEffect, useMemo, useState } from "react";
import { api } from "../api.ts";
import { bytes, gib, haceCuanto, hora, num } from "../formato.ts";
import { enlace } from "../ruta.ts";
import { COLOR_EVENTO } from "../componentes/Catalogo.tsx";
import { IconoPantalla, IconoVentana } from "../iconos.tsx";
import type { EstadoCompleto, Evento, General as DatosGeneral, ItemLinea, Servicio } from "../tipos.ts";
import { CalendarioVencimientos, confirmarBarrido, duracionTexto, estadoPortal } from "./Anm.tsx";

type Props = {
  estado: EstadoCompleto | null;
  general: DatosGeneral | null;
  ahora: number;
  oyentesEvento: Set<(e: Evento) => void>;
  alModoTv: () => void;
};

const fechaLarga = (ts: number) =>
  new Date(ts).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });

/** "+20 % frente a lo normal" — null si no hay con qué comparar todavía */
function comparar(valor: number, normal: number | null | undefined, unidad = "") {
  if (normal === null || normal === undefined) return null;
  if (normal < 1 && valor < 1) return "igual que siempre";
  const dif = normal === 0 ? 100 : ((valor - normal) / normal) * 100;
  if (Math.abs(dif) < 10) return `normal (${num(normal, normal < 10 ? 1 : 0)}${unidad})`;
  return `${dif > 0 ? "+" : "−"}${num(Math.abs(dif))} % frente a lo normal (${num(normal, normal < 10 ? 1 : 0)}${unidad})`;
}

const DIAS_SEMANA = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

const NOMBRE_ORIGEN: Record<string, string> = {
  whatsapp: "WhatsApp",
  estados: "Estados WA",
  instagram: "Instagram",
  facebook: "Facebook",
  qr: "Código QR",
  directo: "Directo",
};

const nombreModelo = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Vista general: estado de todo el VPS y de cada proyecto en una pantalla. */
export function General({ estado, general, ahora, oyentesEvento, alModoTv }: Props) {
  const m = estado?.metricas ?? null;
  const g = general;
  const servicios = estado?.servicios.servicios ?? [];
  const deGrupo = (id: string) => servicios.filter((s) => s.grupo === id);

  // ---- Avisos: qué está fuera de lo normal ahora mismo ----
  const avisos = useMemo(() => {
    const lista: { texto: string; proyecto?: string }[] = [];
    for (const s of servicios) if (s.estado !== "running" || s.salud === "enferma") lista.push({ texto: `${s.contenedor} está caído`, proyecto: s.grupo });
    for (const [p, c] of Object.entries(g?.chequeos ?? {})) if (c.ultimoOk === false) lista.push({ texto: `${p} no responde`, proyecto: p });
    const portal = g?.anm.datos ? estadoPortal(g.anm.datos) : null;
    if (portal && portal.nivel !== "ok") lista.push({ texto: portal.corto, proyecto: "anm" });
    if (g?.anm.activo && g.anm.error) lista.push({ texto: "no se pudo leer Notificaciones ANM", proyecto: "anm" });
    const nuevos = (g?.errores ?? []).filter((e) => e.nuevo && e.nivel === "error").length;
    if (nuevos) lista.push({ texto: `${nuevos} ${nuevos === 1 ? "error nuevo" : "errores nuevos"} en logs` });
    if (m && m.disco.pct >= 85) lista.push({ texto: `disco al ${num(m.disco.pct)} %` });
    return lista;
  }, [servicios, g, m]);

  const titulo =
    avisos.length === 0
      ? "Todo funciona"
      : avisos.some((a) => / caído| no responde/.test(a.texto))
        ? `Atención · ${avisos[0]!.texto}`
        : `Todo funciona · ${avisos.length === 1 ? `1 aviso${avisos[0]!.proyecto === "anm" ? " en ANM" : ""}` : `${avisos.length} avisos`}`;

  const u = g?.desdeUltimaVisita;

  return (
    <>
      <header className="cabecera cabecera--general">
        <div className="cabecera__titulo">
          <span className="tenue chico">
            {fechaLarga(ahora)} · {hora(ahora)}
            {u ? ` · última visita ${haceCuanto(u.desde, ahora)}` : ""}
          </span>
          <h1>{titulo}</h1>
          {u && (
            <p className="resumen-visita">
              Desde tu última visita: <b>{u.visitas}</b> {u.visitas === 1 ? "visita" : "visitas"} al catálogo, <b>{u.formularios}</b>{" "}
              {u.formularios === 1 ? "formulario nuevo" : "formularios nuevos"}
              {g?.anm.activo ? (
                <>
                  {" "}
                  y <b>{u.anmNuevas}</b> {u.anmNuevas === 1 ? "notificación ANM" : "notificaciones ANM"}
                </>
              ) : null}
              .{" "}
              {avisos.length === 0 && u.alertas.length === 0
                ? "Nada fuera de lo normal."
                : avisos.length
                  ? `Revisa: ${avisos.map((a) => a.texto).join(", ")}.`
                  : `Hubo avisos que ya se resolvieron: ${u.alertas[0]}.`}
            </p>
          )}
        </div>
        <button type="button" className="boton boton--icono-texto" onClick={alModoTv}>
          <IconoPantalla tam={16} /> Modo TV
        </button>
      </header>

      <FranjaServidor m={m} g={g} />

      <div className="proyectos">
        <TarjetaFersautos estado={estado} g={g} servicios={deGrupo("fersautos")} ahora={ahora} />
        <TarjetaAnm g={g} servicios={deGrupo("anm")} ahora={ahora} />
        {(g?.proyectos ?? [])
          .filter((p) => p.id !== "fersautos" && p.id !== "anm")
          .map((p) => (
            <TarjetaGenerica key={p.id} nombre={p.nombre} servicios={deGrupo(p.id)} />
          ))}
      </div>

      <div className="proyectos">
        <LineaDeTiempo desde={u?.desde ?? null} ahora={ahora} oyentesEvento={oyentesEvento} />
        <ErroresRecientes g={g} ahora={ahora} />
      </div>
    </>
  );
}

// ---------- Franja del servidor ----------

function Spark({ valores, color }: { valores: (number | null)[]; color: string }) {
  const pts = valores
    .map((v, i) => (v === null ? null : `${((i / (valores.length - 1)) * 84).toFixed(1)},${(24 - (Math.min(v, 100) / 100) * 22).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg aria-hidden="true" width="84" height="26" viewBox="0 0 84 26" className="spark">
      <polyline points={pts} fill="none" style={{ stroke: color }} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function FranjaServidor({ m, g }: { m: EstadoCompleto["metricas"]; g: DatosGeneral | null }) {
  const s = g?.servidor;
  const notaCpu = !m || !s ? "" : s.cpuNormal === null ? "sin historial aún" : Math.abs(m.cpu.pct - s.cpuNormal) < 10 ? "normal a esta hora" : m.cpu.pct > s.cpuNormal ? `alto · normal ${num(s.cpuNormal)} %` : `bajo · normal ${num(s.cpuNormal)} %`;
  const notaRam = !m || !s || s.ramNormal === null ? "" : Math.abs(m.ram.pct - s.ramNormal) < 8 ? "normal a esta hora" : `${m.ram.pct > s.ramNormal ? "+" : "−"}${num(Math.abs(m.ram.pct - s.ramNormal))} pts vs. lo normal`;
  const diasDisco = s?.discoDiasParaLlenarse;
  const notaDisco =
    diasDisco === null || diasDisco === undefined
      ? "calculando ritmo de llenado…"
      : diasDisco > 730
        ? "a este ritmo, años para llenarse"
        : diasDisco > 60
          ? `a este ritmo, lleno en ${Math.round(diasDisco / 30)} meses`
          : `¡a este ritmo, lleno en ${diasDisco} días!`;
  return (
    <section aria-label="Servidor" className="franja">
      <a className="franja__celda" href={enlace("servidor")}>
        <span className="tenue chico">CPU</span>
        <span className="franja__fila">
          <b className="cifra-media">{m ? `${num(m.cpu.pct)} %` : "–"}</b>
          {s && <Spark valores={s.sparkCpu} color="var(--azul)" />}
        </span>
        <span className="tenue chico">{notaCpu}</span>
      </a>
      <a className="franja__celda" href={enlace("servidor")}>
        <span className="tenue chico">RAM</span>
        <span className="franja__fila">
          <b className="cifra-media">
            {m ? gib(m.ram.usadaB) : "–"}
            <small> / {m ? gib(m.ram.totalB, 0) : "–"} GB</small>
          </b>
          {s && <Spark valores={s.sparkRam} color="var(--lila)" />}
        </span>
        <span className="tenue chico">{notaRam}</span>
      </a>
      <a className="franja__celda" href={enlace("servidor")}>
        <span className="tenue chico">Disco</span>
        <b className="cifra-media">
          {m ? num(m.disco.usadoB / 1e9) : "–"}
          <small> / {m ? num(m.disco.totalB / 1e9) : "–"} GB</small>
        </b>
        <span className={diasDisco !== null && diasDisco !== undefined && diasDisco <= 60 ? "chico texto-ambar" : "tenue chico"}>{notaDisco}</span>
      </a>
      <a className="franja__celda" href={enlace("servidor")}>
        <span className="tenue chico">Red</span>
        <b className="cifra-media cifra-media--chica">
          ↓ {m ? num(m.red.inMbps, 1) : "–"} · ↑ {m ? num(m.red.outMbps, 1) : "–"} <small>Mbps</small>
        </b>
        <span className="tenue chico">{m ? `mes: ${bytes(m.red.mesB)} de ${bytes(m.red.limiteB, 0)}` : ""}</span>
      </a>
    </section>
  );
}

// ---------- Fersautos ----------

function PieContenedores({ servicios, extra }: { servicios: Servicio[]; extra?: React.ReactNode }) {
  return (
    <div className="proyecto__pie mono">
      {servicios.length === 0 && <span>sin contenedores detectados</span>}
      {servicios.map((s) => {
        const bien = s.estado === "running" && s.salud !== "enferma";
        return (
          <span key={s.id} className="proyecto__contenedor" title={s.detalle}>
            <span className={bien ? "punto punto--vivo-fijo" : "punto punto--caido"} />
            {s.nombre} {bien ? `${s.cpuPct === null ? "…" : num(s.cpuPct, 1) + " %"} · ${s.memoriaB === null ? "…" : bytes(s.memoriaB, 0)}` : "caído"}
          </span>
        );
      })}
      {extra}
    </div>
  );
}

function TarjetaFersautos({ estado, g, servicios, ahora }: { estado: EstadoCompleto | null; g: DatosGeneral | null; servicios: Servicio[]; ahora: number }) {
  const f = g?.fersautos;
  const p = estado?.presencia;
  const ch = g?.chequeos.fersautos;
  const bien = servicios.length > 0 && servicios.every((s) => s.estado === "running" && s.salud !== "enferma") && ch?.ultimoOk !== false;
  const diaSemana = DIAS_SEMANA[new Date(ahora - 5 * 3600_000).getUTCDay()];
  const maxHora = Math.max(1, ...(f?.porHoraHoy ?? []), ...(f?.porHoraAyer ?? []));
  const maxOrigen = Math.max(1, ...(f?.origenes ?? []).map((o) => o.n));
  const comparaVisitas = f ? comparar(f.visitasHoy, f.normalHastaAhora) : null;

  return (
    <section className={`tarjeta proyecto${bien ? "" : " proyecto--aviso"}`}>
      <div className="proyecto__cabeza">
        <span className="proyecto__nombre">
          <span className={bien ? "punto punto--vivo" : "punto punto--caido"} />
          <b>Fersautos</b>
          <span className="tenue chico">catálogo · Next.js</span>
        </span>
        <span className="proyecto__acciones">
          <a href={enlace("proyecto/fersautos")}>Abrir</a>
          <button type="button" className="enlace-boton" onClick={() => window.open("/en-vivo", "fersautos-en-vivo", "popup,width=980,height=820")?.focus()}>
            En vivo <IconoVentana tam={14} />
          </button>
        </span>
      </div>

      <div className="proyecto__cifras">
        <div>
          <span className="tenue chico">Visitas hoy</span>
          <b className="cifra-grande">{f?.visitasHoy ?? "–"}</b>
          <span className="chico texto-azul">{comparaVisitas ? comparaVisitas.replace("lo normal", `tus ${diaSemana}`) : "aún sin historial para comparar"}</span>
        </div>
        <div>
          <span className="chico texto-ambar">En formulario ahora</span>
          <b className="cifra-grande cifra--ambar">{p?.conteo.formulario ?? "–"}</b>
          <span className="tenue chico">{p ? `${p.sesiones.filter((s) => s.escribiendo).length} escribiendo · ${p.conteo.conectados} en línea` : ""}</span>
        </div>
        <div>
          <span className="tenue chico">Enviados hoy</span>
          <b className="cifra-grande cifra--lila">{f?.enviadosHoy ?? "–"}</b>
          <span className="tenue chico">{f?.enviadosNormal === null || !f ? "sin historial aún" : `normal: ${num(f.enviadosNormal, 1)} al día`}</span>
        </div>
      </div>

      {f && (
        <div className="horas">
          <div className="horas__barras" role="img" aria-label="Visitas por hora de hoy y de ayer">
            {f.porHoraHoy.map((n, h) => {
              const ayer = f.porHoraAyer[h] ?? 0;
              return (
                <div key={h} className="horas__par" title={`${h}:00 · hoy ${n} · ayer ${ayer}`}>
                  <div className="horas__ayer" style={{ height: `${(ayer / maxHora) * 100}%` }} />
                  <div className={h > f.horaActual ? "horas__hoy horas__hoy--futuro" : "horas__hoy"} style={{ height: `${(n / maxHora) * 100}%` }} />
                </div>
              );
            })}
          </div>
          <div className="horas__eje mono">
            <span>12 a. m.</span>
            <span>
              <i className="horas__clave horas__clave--hoy" /> hoy <i className="horas__clave" /> ayer
            </span>
            <span>11 p. m.</span>
          </div>
        </div>
      )}

      {f && (
        <div className="proyecto__dos">
          <div>
            <span className="tenue chico">De dónde llegan hoy</span>
            {f.origenes.length === 0 && <p className="tenue chico">Sin visitas todavía.</p>}
            {f.origenes.slice(0, 5).map((o) => (
              <div key={o.origen} className="barra-fila">
                <span>{NOMBRE_ORIGEN[o.origen] ?? o.origen}</span>
                <div className="barra-fila__barra">
                  <div style={{ width: `${(o.n / maxOrigen) * 100}%` }} />
                </div>
                <span className="mono">{o.n}</span>
              </div>
            ))}
          </div>
          <div>
            <span className="tenue chico">Modelos más vistos hoy</span>
            {f.modelos.length === 0 && <p className="tenue chico">Nadie ha abierto un modelo hoy.</p>}
            <ol className="ranking">
              {f.modelos.slice(0, 4).map((mo, i) => (
                <li key={mo.modelo}>
                  <span>
                    <span className="mono tenue">{i + 1}</span> {nombreModelo(mo.modelo)}
                  </span>
                  <span className="mono tenue">
                    {mo.n} {mo.n === 1 ? "vista" : "vistas"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {p && (
        <div className={p.natalia.enLinea ? "presencia presencia--en-linea proyecto__natalia" : "presencia proyecto__natalia"}>
          <span className={p.natalia.enLinea ? "punto punto--vivo" : "punto punto--apagado"} />
          {p.natalia.enLinea
            ? `Natalia en línea desde las ${hora(p.natalia.desde!)} · ${p.natalia.pagina}`
            : `Natalia desconectada${p.natalia.ultimaVez ? ` · última vez ${haceCuanto(p.natalia.ultimaVez, ahora)}` : ""}`}
        </div>
      )}

      <PieContenedores
        servicios={servicios}
        extra={
          ch && (
            <span>
              {ch.msHora === null ? "sin respuesta" : `${ch.msHora} ms`} · {ch.uptime30 === null ? "–" : `${num(ch.uptime30 * 100, 2)} % disponible`}
            </span>
          )
        }
      />
    </section>
  );
}

// ---------- ANM ----------

function TarjetaAnm({ g, servicios, ahora }: { g: DatosGeneral | null; servicios: Servicio[]; ahora: number }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const a = g?.anm;
  const d = a?.datos;
  const ch = g?.chequeos.anm;
  const portal = d ? estadoPortal(d) : null;
  const appBien = servicios.every((s) => s.estado === "running" && s.salud !== "enferma") && ch?.ultimoOk !== false;
  const aviso = !appBien || (portal && portal.nivel !== "ok") || !!a?.error;

  const proximos = (d?.vencimientos ?? []).filter((v) => v.dias_habiles !== null && v.dias_habiles >= 0 && v.dias_habiles <= 10);
  const manana = proximos.filter((v) => v.dias_habiles! <= 1);
  const b = d?.barrido;

  return (
    <section className={`tarjeta proyecto${aviso ? " proyecto--aviso" : ""}`}>
      <div className="proyecto__cabeza">
        <span className="proyecto__nombre">
          <span className={!appBien ? "punto punto--caido" : aviso ? "punto punto--ambar" : "punto punto--vivo"} />
          <b>Notificaciones ANM</b>
          <span className="tenue chico">FastAPI · barridos</span>
        </span>
        <span className="proyecto__acciones">
          <a href={enlace("proyecto/anm")}>Abrir</a>
          {a?.activo && (
            <button type="button" className="boton" disabled={b?.en_curso} onClick={() => confirmarBarrido(setMensaje)}>
              {b?.en_curso ? "Barriendo…" : "Barrer ahora"}
            </button>
          )}
        </span>
      </div>

      {!a?.activo ? (
        <p className="vacio">
          Falta conectar el monitor con ANM: pon el mismo token en <code>MONITOR_TOKEN</code> (ANM) y <code>ANM_TOKEN</code> (monitor).
        </p>
      ) : !d ? (
        <p className="vacio">{a.error ? `No se pudo leer ANM: ${a.error}` : "Consultando Notificaciones ANM…"}</p>
      ) : (
        <>
          <div className="proyecto__cifras">
            <div>
              <span className="tenue chico">Nuevas hoy</span>
              <b className="cifra-grande">{d.notificaciones.nuevas_hoy}</b>
              <span className="tenue chico">normal: {num(d.notificaciones.promedio_diario, 1)} al día</span>
            </div>
            <div>
              <span className="chico texto-ambar">Vencen en 2 semanas</span>
              <b className="cifra-grande cifra--ambar">{proximos.length}</b>
              <span className={manana.length ? "chico texto-rojo" : "tenue chico"}>
                {manana.length ? `${manana.length} vence${manana.length === 1 ? "" : "n"} mañana o hoy` : "ninguno mañana"}
              </span>
            </div>
            <div>
              <span className="tenue chico">Último barrido</span>
              <b className={`cifra-grande${portal?.lento ? " cifra--ambar" : ""}`}>{b?.ultimo_duracion_seg ? duracionTexto(b.ultimo_duracion_seg) : "–"}</b>
              <span className={portal?.lento ? "chico texto-ambar" : "tenue chico"}>
                {b?.duracion_normal_seg ? `normal: ${duracionTexto(b.duracion_normal_seg)}` : ""}
                {b?.ultimo_inicio ? ` · ${haceCuanto(Date.parse(b.ultimo_inicio), ahora)}` : ""}
              </span>
            </div>
          </div>

          <CalendarioVencimientos vencimientos={d.vencimientos} ahora={ahora} />

          <div className="proyecto__dos proyecto__dos--cajas">
            <div className={`caja-estado${appBien ? "" : " caja-estado--mal"}`}>
              <span className="tenue chico">Tu app (ANM)</span>
              <span>
                <span className={appBien ? "punto punto--vivo-fijo" : "punto punto--caido"} /> {appBien ? `Funcionando · ${ch?.msHora ?? "…"} ms` : "No responde"}
              </span>
            </div>
            <div className={`caja-estado${portal?.nivel === "ok" ? "" : " caja-estado--aviso"}`}>
              <span className="tenue chico">Portal de la ANM (externo)</span>
              <span>
                <span className={portal?.nivel === "ok" ? "punto punto--vivo-fijo" : "punto punto--ambar"} /> {portal?.texto}
              </span>
            </div>
          </div>
          {mensaje && <p className="chico tenue proyecto__mensaje" role="status">{mensaje}</p>}
        </>
      )}

      <PieContenedores
        servicios={servicios}
        extra={b?.proximo ? <span>próximo barrido {haceCuantoFuturo(Date.parse(b.proximo), ahora)}</span> : null}
      />
    </section>
  );
}

function haceCuantoFuturo(ts: number, ahora: number) {
  const min = Math.round((ts - ahora) / 60000);
  if (min < 1) return "en un momento";
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `en ${h} h ${min % 60} min`;
  return new Date(ts).toLocaleString("es-CO", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
}

function TarjetaGenerica({ nombre, servicios }: { nombre: string; servicios: Servicio[] }) {
  const bien = servicios.every((s) => s.estado === "running" && s.salud !== "enferma");
  return (
    <section className="tarjeta proyecto">
      <div className="proyecto__cabeza">
        <span className="proyecto__nombre">
          <span className={bien ? "punto punto--vivo-fijo" : "punto punto--caido"} />
          <b>{nombre}</b>
          <span className="tenue chico">detectado automáticamente</span>
        </span>
        <a href={enlace("logs", { proyecto: servicios[0]?.grupo })}>Ver logs</a>
      </div>
      <PieContenedores servicios={servicios} />
    </section>
  );
}

// ---------- Línea de tiempo ----------

const FILTROS = [
  { id: "todo", texto: "Todo" },
  { id: "clientes", texto: "Clientes" },
  { id: "anm", texto: "ANM" },
  { id: "despliegues", texto: "Despliegues" },
  { id: "alertas", texto: "Alertas" },
] as const;

const horaCorta = (ts: number) => new Date(ts).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
/** "6–7 p. m." en vez de "6 p. m.–7 p. m." */
function rangoHora(desde: number, hasta: number) {
  const f = (ts: number) => new Date(ts).toLocaleTimeString("es-CO", { hour: "numeric", timeZone: "America/Bogota" });
  const [a, b] = [f(desde), f(hasta)];
  const sufijo = (t: string) => t.replace(/^\d+\s*/, "");
  return sufijo(a) === sufijo(b) ? `${a.replace(/\s*\D+$/, "")}–${b}` : `${a}–${b}`;
}

function LineaDeTiempo({ desde, ahora, oyentesEvento }: { desde: number | null; ahora: number; oyentesEvento: Set<(e: Evento) => void> }) {
  const [items, setItems] = useState<ItemLinea[]>([]);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todo");

  useEffect(() => {
    const cargar = () => api<ItemLinea[]>("/linea").then(setItems).catch(() => {});
    cargar();
    // Un evento nuevo recarga la línea (y cada 2 min para que los grupos de visitas se actualicen)
    let espera: ReturnType<typeof setTimeout> | null = null;
    const alEvento = () => {
      espera ??= setTimeout(() => {
        espera = null;
        cargar();
      }, 1000);
    };
    oyentesEvento.add(alEvento);
    const t = setInterval(cargar, 120_000);
    return () => {
      oyentesEvento.delete(alEvento);
      clearInterval(t);
      if (espera) clearTimeout(espera);
    };
  }, [oyentesEvento]);

  const visibles = items.filter((i) => filtro === "todo" || i.categoria === filtro || (filtro === "clientes" && i.categoria === "visitas")).slice(0, 14);

  return (
    <section className="tarjeta linea">
      <div className="tarjeta__cabeza">
        <h2>Línea de tiempo</h2>
        <div role="group" aria-label="Filtrar la línea de tiempo" className="chips-filtro chips-filtro--chico">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.texto}
            </button>
          ))}
        </div>
      </div>
      {visibles.length === 0 ? (
        <p className="vacio">Nada en las últimas 48 horas.</p>
      ) : (
        <ol className="linea__lista">
          {visibles.map((i) => (
            <li key={`${i.categoria}-${i.id}`}>
              <span className="mono tenue linea__hora">{i.hasta ? rangoHora(i.ts, i.hasta) : horaCorta(i.ts)}</span>
              <span className={`punto ${i.categoria === "visitas" ? "punto--vivo-fijo" : COLOR_EVENTO[i.tipo]}`} />
              <span className="linea__texto">
                {i.texto}
                {i.logs !== undefined && (
                  <a href={enlace("logs", { q: i.logs, ts: i.ts - 60_000, proyecto: i.proyecto })} className="linea__enlace">
                    logs de ese momento →
                  </a>
                )}
              </span>
              {desde && i.ts > desde && i.ts <= ahora && <span className="insignia insignia--nuevo">nuevo</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------- Errores ----------

function ErroresRecientes({ g, ahora }: { g: DatosGeneral | null; ahora: number }) {
  const errores = g?.errores ?? [];
  return (
    <section className="tarjeta tarjeta--tabla">
      <div className="tarjeta__barra tarjeta__barra--flex">
        <h2>Errores en logs · 24 h</h2>
        <a href={enlace("logs")}>Abrir consola en vivo →</a>
      </div>
      {errores.length === 0 ? (
        <p className="vacio">Sin WARN ni ERROR en las últimas 24 horas. 👌</p>
      ) : (
        <ul className="errores errores--tarjeta">
          {errores.slice(0, 6).map((e) => (
            <li key={e.huella}>
              <a
                className={`error-agrupado${e.nuevo ? " error-agrupado--nuevo" : ""}`}
                href={enlace("logs", { q: e.ejemplo.replace(/^\S*\d{4}-\d\d-\d\d\S*\s*/, "").slice(0, 40), fuente: e.fuente })}
              >
                <span className={`etiqueta-nivel etiqueta-nivel--${e.nuevo ? "nuevo" : e.nivel}`}>{e.nuevo ? "NUEVO" : e.nivel.toUpperCase()}</span>
                <span className="error-agrupado__texto">
                  <span className="mono">{e.ejemplo.slice(0, 90)}</span>
                  <span className="tenue chico">
                    {e.fuente} · {e.nuevo ? `primera vez ${haceCuanto(e.primera, ahora)}` : `visto ${e.total.toLocaleString("es-CO")} veces en total`}
                  </span>
                </span>
                <span className="mono chico">×{e.recientes}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
