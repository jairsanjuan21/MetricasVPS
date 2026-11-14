import { useState } from "react";
import { useHistorial, useReloj, useVivo } from "../useVivo.ts";
import { bytes, duracion, gib, haceCuanto, hora, num, pct, tiempoDesde } from "../formato.ts";
import { Grafica } from "../componentes/Grafica.tsx";
import { Servicios } from "../componentes/Servicios.tsx";
import { Alertas } from "../componentes/Alertas.tsx";
import type { Evento, Instantanea, Presencia, Rango } from "../tipos.ts";
import {
  IconoAbajo,
  IconoArriba,
  IconoCampana,
  IconoLapiz,
  IconoPulso,
  IconoResumen,
  IconoSalir,
  IconoServidor,
  IconoUsuarios,
} from "../iconos.tsx";

type Props = { usuario: string; alSalir: () => void };

const RANGOS: { id: Rango; texto: string; inicio: string }[] = [
  { id: "15m", texto: "15 min", inicio: "hace 15 min" },
  { id: "1h", texto: "1 h", inicio: "hace 1 h" },
  { id: "24h", texto: "24 h", inicio: "hace 24 h" },
];

const AZUL = "#38bdf8";
const LILA = "#c4b5fd";
const AMBAR = "#f59e0b";

export function Dashboard({ usuario, alSalir }: Props) {
  const { estado, conectado, oyentesMuestra } = useVivo();
  const [rango, setRango] = useState<Rango>("15m");
  const puntos = useHistorial(rango, oyentesMuestra);
  const ahora = useReloj();
  const m = estado?.metricas;

  return (
    <div className="app">
      <aside className="lateral">
        <div className="logo logo--chico">
          <span className="logo__icono">
            <IconoPulso tam={18} />
          </span>
          <span className="logo__texto">VPS Monitor</span>
        </div>
        <nav aria-label="Secciones" className="lateral__nav">
          <a className="nav nav--activa" href="#resumen">
            <IconoResumen /> Resumen
          </a>
          <a className="nav" href="#catalogo">
            <IconoUsuarios /> Usuarios en vivo
          </a>
          <a className="nav" href="#servicios">
            <IconoServidor /> Servicios
          </a>
          <a className="nav" href="#alertas">
            <IconoCampana /> Alertas
          </a>
        </nav>
        <div className="lateral__pie">
          <strong>{usuario}</strong>
          <span className="tenue">{conectado ? "Conectado en vivo" : "Reconectando…"}</span>
          <button type="button" className="enlace-boton" onClick={alSalir}>
            <IconoSalir tam={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main id="resumen" className="contenido">
        <header className="cabecera">
          <div className="cabecera__titulo">
            <h1>Resumen del servidor</h1>
            <div className="chips">
              <span className="chip">Hostinger KVM 2</span>
              <span className="chip">{m ? `${m.cpu.nucleos} vCPU · ${gib(m.ram.totalB, 0)} GB RAM` : "…"}</span>
              {m && <span className="chip">encendido hace {duracion(m.uptimeSeg)}</span>}
            </div>
          </div>
          <div className="cabecera__acciones">
            <span className="en-vivo">
              <span className={conectado ? "punto punto--vivo" : "punto punto--apagado"} />
              {conectado ? "En vivo · cada 2 s" : "Sin conexión"}
            </span>
            <div role="group" aria-label="Rango de tiempo" className="segmentado">
              {RANGOS.map((r) => (
                <button key={r.id} type="button" aria-pressed={rango === r.id} onClick={() => setRango(r.id)}>
                  {r.texto}
                </button>
              ))}
            </div>
          </div>
        </header>

        {!estado ? <p className="tenue">Conectando con el servidor…</p> : null}
        {m && <Kpis m={m} />}

        <div className="fila">
          <section className="tarjeta tarjeta--ancha">
            <div className="tarjeta__cabeza">
              <h2>CPU y RAM</h2>
              <div className="leyenda">
                <span>
                  <i className="leyenda__linea" style={{ background: AZUL }} />
                  CPU
                </span>
                <span>
                  <i className="leyenda__guiones" style={{ borderColor: LILA }} />
                  RAM
                </span>
              </div>
            </div>
            <Grafica
              etiqueta="Uso de CPU y RAM en el tiempo"
              alto={200}
              max={100}
              ejeY={["100 %", "50 %", "0 %"]}
              tiempos={puntos.map((p) => p.ts)}
              series={[
                { nombre: "CPU", valores: puntos.map((p) => p.cpu), color: AZUL, area: true, formato: pct },
                { nombre: "RAM", valores: puntos.map((p) => p.ram), color: LILA, discontinua: true, formato: pct },
              ]}
            />
            <div className="eje-x">
              <span>{RANGOS.find((r) => r.id === rango)!.inicio}</span>
              <span>ahora</span>
            </div>
          </section>

          <section className="tarjeta tarjeta--angosta">
            <h2>Red {m && <span className="tenue mono">· {m.red.interfaz}</span>}</h2>
            <div className="red__actual">
              <div>
                <span className="red__etiqueta">
                  <IconoAbajo tam={14} style={{ color: AZUL }} /> Entrante
                </span>
                <span className="cifra-media">
                  {m ? num(m.red.inMbps, m.red.inMbps < 10 ? 2 : 1) : "–"} <small>Mbps</small>
                </span>
              </div>
              <div>
                <span className="red__etiqueta">
                  <IconoArriba tam={14} style={{ color: AMBAR }} /> Saliente
                </span>
                <span className="cifra-media">
                  {m ? num(m.red.outMbps, m.red.outMbps < 10 ? 2 : 1) : "–"} <small>Mbps</small>
                </span>
              </div>
            </div>
            <Grafica
              etiqueta="Tráfico entrante y saliente"
              alto={96}
              tiempos={puntos.map((p) => p.ts)}
              series={[
                { nombre: "Entrante", valores: puntos.map((p) => p.redIn), color: AZUL, formato: (v) => `${num(v, 2)} Mbps` },
                { nombre: "Saliente", valores: puntos.map((p) => p.redOut), color: AMBAR, discontinua: true, formato: (v) => `${num(v, 2)} Mbps` },
              ]}
            />
            {m && (
              <div className="banda">
                <div className="banda__fila">
                  <span>Ancho de banda del ciclo</span>
                  <span className="mono tenue">
                    {bytes(m.red.mesB)} / {bytes(m.red.limiteB, 0)}
                  </span>
                </div>
                <Barra valor={m.red.pct} />
                <div className="banda__fila mono tenue chico">
                  <span>hoy ↓ {bytes(m.red.hoyRxB)}</span>
                  <span>hoy ↑ {bytes(m.red.hoyTxB)}</span>
                  <span>se reinicia en {m.red.diasParaCorte} d</span>
                </div>
              </div>
            )}
          </section>
        </div>

        <div id="catalogo" className="seccion-titulo">
          <h2>Catálogo Fersautos · usuarios en vivo</h2>
          <span className="tenue">Se actualiza al instante</span>
        </div>

        {estado && <Catalogo p={estado.presencia} ahora={ahora} />}

        <div className="fila">
          <section className="tarjeta tarjeta--angosta">
            <h2>Actividad reciente</h2>
            {estado && <Actividad eventos={estado.eventos} ahora={ahora} />}
          </section>
          {estado && <Servicios resumen={estado.servicios} />}
        </div>

        <Alertas />
      </main>
    </div>
  );
}

// ---------- Piezas ----------

function Barra({ valor }: { valor: number }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className="barra" role="presentation">
      <div className={v >= 80 ? "barra__relleno barra__relleno--alta" : "barra__relleno"} style={{ width: `${Math.max(v, 0.5)}%` }} />
    </div>
  );
}

function Kpis({ m }: { m: Instantanea }) {
  const tarjetas = [
    {
      titulo: "CPU",
      valor: num(m.cpu.pct),
      unidad: "%",
      porcentaje: m.cpu.pct,
      nota: `${m.cpu.nucleos} vCPU · carga ${num(m.cpu.carga[0], 2)} / ${num(m.cpu.carga[1], 2)} / ${num(m.cpu.carga[2], 2)}`,
    },
    {
      titulo: "RAM",
      valor: gib(m.ram.usadaB),
      unidad: `/ ${gib(m.ram.totalB, 0)} GB`,
      porcentaje: m.ram.pct,
      nota: `libre ${gib(m.ram.totalB - m.ram.usadaB)} GB · caché ${gib(m.ram.cacheB)} GB`,
    },
    {
      titulo: "Memoria auxiliar (swap)",
      valor: m.swap.totalB ? num(m.swap.usadaB / 1024 ** 2) : "–",
      unidad: m.swap.totalB ? `MB / ${gib(m.swap.totalB, 0)} GB` : "sin swap",
      porcentaje: m.swap.pct,
      nota: !m.swap.totalB ? "No hay swap configurada" : m.swap.pct > 50 ? "Hay presión de memoria" : "Sin presión de memoria",
    },
    {
      titulo: "Disco",
      valor: num(m.disco.usadoB / 1e9),
      unidad: `/ ${num(m.disco.totalB / 1e9)} GB`,
      porcentaje: m.disco.pct,
      nota: `lectura ${bytes(m.disco.lecturaBs)}/s · escritura ${bytes(m.disco.escrituraBs)}/s`,
    },
  ];
  return (
    <div className="kpis">
      {tarjetas.map((t) => (
        <div className="tarjeta kpi" key={t.titulo}>
          <div className="kpi__cabeza">
            <span>{t.titulo}</span>
            <span className="mono">{pct(t.porcentaje)}</span>
          </div>
          <div className="kpi__valor">
            <span className="cifra-grande">{t.valor}</span>
            <span className="tenue">{t.unidad}</span>
          </div>
          <Barra valor={t.porcentaje} />
          <div className="tenue chico">{t.nota}</div>
        </div>
      ))}
    </div>
  );
}

function Catalogo({ p, ahora }: { p: Presencia; ahora: number }) {
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

const COLOR_EVENTO: Record<Evento["tipo"], string> = {
  natalia_conectada: "punto--vivo-fijo",
  natalia_desconectada: "punto--apagado",
  formulario_abierto: "punto--ambar",
  formulario_enviado: "punto--lila",
  alerta: "punto--ambar",
  alerta_resuelta: "punto--apagado",
  servicio: "punto--vivo-fijo",
};

function Actividad({ eventos, ahora }: { eventos: Evento[]; ahora: number }) {
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
