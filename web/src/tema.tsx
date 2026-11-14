import { useEffect, useState } from "react";
import { IconoLuna, IconoMonitor, IconoSol } from "./iconos.tsx";

export type PreferenciaTema = "claro" | "oscuro" | "sistema";

const leer = (): PreferenciaTema => {
  try {
    const v = localStorage.getItem("tema");
    return v === "claro" || v === "oscuro" ? v : "sistema";
  } catch {
    return "sistema";
  }
};

const sistemaOscuro = () => matchMedia("(prefers-color-scheme: dark)").matches;

function aplicar(p: PreferenciaTema) {
  const oscuro = p === "oscuro" || (p === "sistema" && sistemaOscuro());
  document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
}

/** Preferencia de tema: se guarda en este navegador y, en "sistema", sigue al sistema operativo en vivo. */
export function useTema() {
  const [tema, setTema] = useState<PreferenciaTema>(leer);

  useEffect(() => {
    aplicar(tema);
    try {
      if (tema === "sistema") localStorage.removeItem("tema");
      else localStorage.setItem("tema", tema);
    } catch {
      /* modo privado: no se recuerda, pero funciona */
    }
    if (tema !== "sistema") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => aplicar("sistema");
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [tema]);

  return [tema, setTema] as const;
}

const OPCIONES: { valor: PreferenciaTema; texto: string; Icono: typeof IconoSol }[] = [
  { valor: "claro", texto: "Claro", Icono: IconoSol },
  { valor: "oscuro", texto: "Oscuro", Icono: IconoLuna },
  { valor: "sistema", texto: "Sistema", Icono: IconoMonitor },
];

export function SelectorTema({ compacto = false }: { compacto?: boolean }) {
  const [tema, setTema] = useTema();
  return (
    <div role="radiogroup" aria-label="Tema" className={compacto ? "tema tema--compacto" : "tema"}>
      {OPCIONES.map(({ valor, texto, Icono }) => (
        <button
          key={valor}
          type="button"
          role="radio"
          aria-checked={tema === valor}
          aria-label={compacto ? texto : undefined}
          title={texto}
          onClick={() => setTema(valor)}
        >
          <Icono tam={16} />
          {!compacto && <span>{texto}</span>}
        </button>
      ))}
    </div>
  );
}
