import { useRef, useState, type PointerEvent } from "react";
import { hora } from "../formato.ts";

export type Serie = { nombre: string; valores: number[]; color: string; discontinua?: boolean; area?: boolean; formato: (v: number) => string };

type Props = {
  series: Serie[];
  tiempos: number[];
  /** Máximo del eje Y. Sin él, se ajusta al valor más alto. */
  max?: number;
  alto: number;
  etiqueta: string;
  ejeY?: string[];
};

const W = 600;
const H = 160;

/**
 * Gráfica de líneas en SVG puro. viewBox fijo + preserveAspectRatio="none" la estira al ancho
 * del contenedor; vector-effect mantiene el grosor de línea aunque se estire.
 */
export function Grafica({ series, tiempos, max, alto, etiqueta, ejeY }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState<number | null>(null);
  const n = tiempos.length;
  const tope = max ?? Math.max(1, ...series.flatMap((s) => s.valores)) * 1.2;

  const x = (i: number) => (n <= 1 ? W : (i * W) / (n - 1));
  const y = (v: number) => H - (Math.min(v, tope) / tope) * (H - 10);
  const puntos = (vals: number[]) => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  function mover(e: PointerEvent<HTMLDivElement>) {
    const caja = ref.current?.getBoundingClientRect();
    if (!caja || n < 2) return;
    const rel = (e.clientX - caja.left) / caja.width;
    setIndice(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  const i = indice;
  const izquierda = i !== null ? (i / Math.max(1, n - 1)) * 100 : 0;

  return (
    <div className="grafica" style={{ height: alto }} ref={ref} onPointerMove={mover} onPointerLeave={() => setIndice(null)}>
      <svg role="img" aria-label={etiqueta} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[10, 47.5, 85, 122.5].map((yy) => (
          <line key={yy} x1="0" y1={yy} x2={W} y2={yy} className="grafica__guia" />
        ))}
        <line x1="0" y1={H} x2={W} y2={H} className="grafica__base" />
        {series.map((s) =>
          s.area && n > 1 ? <polygon key={s.nombre + "a"} points={`0,${H} ${puntos(s.valores)} ${W},${H}`} fill={s.color} fillOpacity={0.12} /> : null,
        )}
        {series.map((s) => (
          <polyline
            key={s.nombre}
            points={puntos(s.valores)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.discontinua ? "6 4" : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {ejeY && (
        <div className="grafica__eje" aria-hidden="true">
          {ejeY.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}

      {i !== null && tiempos[i] !== undefined && (
        <>
          <div className="grafica__cursor" style={{ left: `${izquierda}%` }} />
          <div className={`grafica__tip ${izquierda > 65 ? "grafica__tip--izq" : ""}`} style={{ left: `${izquierda}%` }}>
            <strong>{hora(tiempos[i]!)}</strong>
            {series.map((s) => (
              <span key={s.nombre}>
                <i style={{ background: s.color }} />
                {s.nombre} {s.formato(s.valores[i] ?? 0)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
