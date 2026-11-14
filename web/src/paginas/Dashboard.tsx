import { useEffect, useRef, useState } from "react";
import { SelectorTema } from "../tema.tsx";
import { useHistorial, useReloj, useVivo } from "../useVivo.ts";
import { bytes, duracion, gib, num, pct } from "../formato.ts";
import { Grafica } from "../componentes/Grafica.tsx";
import { Servicios } from "../componentes/Servicios.tsx";
import { Alertas } from "../componentes/Alertas.tsx";
import { Actividad, Catalogo } from "../componentes/Catalogo.tsx";
import type { Instantanea, Rango } from "../tipos.ts";
import {
  IconoAbajo,
  IconoArriba,
  IconoCampana,
  IconoPulso,
  IconoResumen,
  IconoSalir,
  IconoServidor,
  IconoUsuarios,
  IconoVentana,
} from "../iconos.tsx";

type Props = { usuario: string; alSalir: () => void };

const RANGOS: { id: Rango; texto: string; inicio: string }[] = [
  { id: "15m", texto: "15 min", inicio: "hace 15 min" },
  { id: "1h", texto: "1 h", inicio: "hace 1 h" },
  { id: "24h", texto: "24 h", inicio: "hace 24 h" },
];

// Colores desde las variables CSS: así las gráficas cambian solas con el tema claro/oscuro
const AZUL = "var(--azul)";
const LILA = "var(--lila)";
const AMBAR = "var(--ambar)";

const SECCIONES = [
  { id: "resumen", texto: "Resumen", Icono: IconoResumen },
  { id: "catalogo", texto: "Usuarios en vivo", Icono: IconoUsuarios },
  { id: "servicios", texto: "Servicios", Icono: IconoServidor },
  { id: "alertas", texto: "Alertas", Icono: IconoCampana },
] as const;

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
        <MenuSecciones />
        <div className="lateral__pie">
          <div className="lateral__usuario">
            <strong>{usuario}</strong>
            <span className="tenue">{conectado ? "Conectado en vivo" : "Reconectando…"}</span>
          </div>
          <SelectorTema />
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
          <button type="button" className="boton boton--icono-texto" onClick={abrirVentanaEnVivo}>
            <IconoVentana tam={16} /> Abrir en ventana aparte
          </button>
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

/** Abre /en-vivo en una ventana propia (si ya está abierta, la reutiliza en vez de abrir otra). */
function abrirVentanaEnVivo() {
  const w = window.open("/en-vivo", "fersautos-en-vivo", "popup,width=980,height=820");
  w?.focus();
}

/**
 * Menú lateral con "scroll spy": mientras bajas por la página, una pastilla se desliza hasta
 * la sección que estás viendo y el riel de la izquierda se va llenando con tu progreso.
 */
function MenuSecciones() {
  const [activa, setActiva] = useState(0);
  const nav = useRef<HTMLElement>(null);
  const enlaces = useRef<(HTMLAnchorElement | null)[]>([]);

  // ¿Qué sección está en la parte alta de la pantalla?
  useEffect(() => {
    let cuadro = 0;
    const calcular = () => {
      cuadro = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - innerHeight;
      const progreso = max > 0 ? Math.min(1, scrollY / max) : 0;
      nav.current?.style.setProperty("--progreso", String(progreso));

      // Al llegar al fondo, la última sección (puede ser muy corta para subir hasta arriba)
      if (progreso > 0.995) return setActiva(SECCIONES.length - 1);
      const linea = innerHeight * 0.35;
      let actual = 0;
      SECCIONES.forEach((sec, i) => {
        const el = document.getElementById(sec.id);
        if (el && (i === 0 || el.getBoundingClientRect().top <= linea)) actual = i;
      });
      setActiva(actual);
    };
    const alDesplazar = () => {
      cuadro ||= requestAnimationFrame(calcular);
    };
    calcular();
    addEventListener("scroll", alDesplazar, { passive: true });
    addEventListener("resize", alDesplazar);
    return () => {
      removeEventListener("scroll", alDesplazar);
      removeEventListener("resize", alDesplazar);
      cancelAnimationFrame(cuadro);
    };
  }, []);

  // Mueve la pastilla al enlace activo
  useEffect(() => {
    const el = enlaces.current[activa];
    if (el) nav.current?.style.setProperty("--y", `${el.offsetTop}px`);
  }, [activa]);

  return (
    <nav aria-label="Secciones" className="lateral__nav" ref={nav}>
      <span className="lateral__riel" aria-hidden="true" />
      <span className="lateral__indicador" aria-hidden="true" />
      {SECCIONES.map(({ id, texto, Icono }, i) => (
        <a
          key={id}
          ref={(el) => {
            enlaces.current[i] = el;
          }}
          className="nav"
          href={`#${id}`}
          aria-current={activa === i ? "true" : undefined}
        >
          <Icono /> {texto}
        </a>
      ))}
    </nav>
  );
}

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
