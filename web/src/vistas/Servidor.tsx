import { useState } from "react";
import { useHistorial } from "../useVivo.ts";
import { bytes, gib, num, pct } from "../formato.ts";
import { Grafica } from "../componentes/Grafica.tsx";
import { Barra } from "../componentes/Barra.tsx";
import { IconoAbajo, IconoArriba } from "../iconos.tsx";
import type { Instantanea, Rango } from "../tipos.ts";

const RANGOS: { id: Rango; texto: string; inicio: string }[] = [
  { id: "15m", texto: "15 min", inicio: "hace 15 min" },
  { id: "1h", texto: "1 h", inicio: "hace 1 h" },
  { id: "24h", texto: "24 h", inicio: "hace 24 h" },
];

// Colores desde las variables CSS: así las gráficas cambian solas con el tema claro/oscuro
const AZUL = "var(--azul)";
const LILA = "var(--lila)";
const AMBAR = "var(--ambar)";

/** Detalle del VPS: CPU, RAM, swap, disco y red con sus gráficas. */
export function Servidor({ m, oyentes }: { m: Instantanea | null; oyentes: Set<(m: Instantanea) => void> }) {
  const [rango, setRango] = useState<Rango>("15m");
  const puntos = useHistorial(rango, oyentes);

  return (
    <>
      <header className="cabecera">
        <div className="cabecera__titulo">
          <h1>Servidor</h1>
          <span className="tenue">Hostinger KVM 2 · {m ? `${m.cpu.nucleos} vCPU · ${gib(m.ram.totalB, 0)} GB RAM` : "…"}</span>
        </div>
        <div role="group" aria-label="Rango de tiempo" className="segmentado">
          {RANGOS.map((r) => (
            <button key={r.id} type="button" aria-pressed={rango === r.id} onClick={() => setRango(r.id)}>
              {r.texto}
            </button>
          ))}
        </div>
      </header>

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
            alto={220}
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
            alto={110}
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
    </>
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
