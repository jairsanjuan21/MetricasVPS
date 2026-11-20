import { useEffect, useRef, useState } from "react";
import { SelectorTema } from "../tema.tsx";
import { useReloj, useVivo } from "../useVivo.ts";
import { enlace, navegar, useRuta } from "../ruta.ts";
import { Servicios } from "../componentes/Servicios.tsx";
import { Alertas } from "../componentes/Alertas.tsx";
import { General } from "../vistas/General.tsx";
import { Servidor } from "../vistas/Servidor.tsx";
import { Logs } from "../vistas/Logs.tsx";
import { Anm } from "../vistas/Anm.tsx";
import { PanelFersautos } from "./EnVivo.tsx";
import type { General as DatosGeneral, Proyecto } from "../tipos.ts";
import {
  IconoBuscar,
  IconoCampana,
  IconoCpu,
  IconoPulso,
  IconoResumen,
  IconoSalir,
  IconoServidor,
  IconoTerminal,
  IconoVentana,
} from "../iconos.tsx";

type Props = { usuario: string; alSalir: () => void };

const GENERALES = [
  { ruta: "general", texto: "Vista general", Icono: IconoResumen },
  { ruta: "servidor", texto: "Servidor", Icono: IconoCpu },
  { ruta: "logs", texto: "Logs en vivo", Icono: IconoTerminal },
  { ruta: "contenedores", texto: "Contenedores", Icono: IconoServidor },
  { ruta: "alertas", texto: "Alertas", Icono: IconoCampana },
] as const;

/** Consola del VPS: menú lateral fijo + la sección elegida. */
export function Dashboard({ usuario, alSalir }: Props) {
  const { estado, general, conectado, oyentesMuestra, oyentesEvento } = useVivo();
  const ruta = useRuta();
  const ahora = useReloj(15_000);
  const [tv, setTv] = useState(false);
  const [paleta, setPaleta] = useState(false);

  // Ctrl+K (o Cmd+K) abre la paleta para saltar a cualquier sección
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((p) => !p);
      }
      if (e.key === "Escape" && tv) salirTv();
    };
    addEventListener("keydown", alTeclear);
    return () => removeEventListener("keydown", alTeclear);
  });

  function entrarTv() {
    setTv(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
  function salirTv() {
    setTv(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  useEffect(() => {
    const alCambiar = () => !document.fullscreenElement && setTv(false);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  const proyectos = general?.proyectos ?? [];
  const servicios = estado?.servicios.servicios ?? [];
  const claveActiva = ruta.vista === "proyecto" ? `proyecto/${ruta.id}` : ruta.vista;

  let contenido: React.ReactNode;
  if (ruta.vista === "servidor") contenido = <Servidor m={estado?.metricas ?? null} oyentes={oyentesMuestra} />;
  else if (ruta.vista === "logs") contenido = <Logs proyectos={proyectos} params={ruta.params} />;
  else if (ruta.vista === "contenedores")
    contenido = (
      <>
        <header className="cabecera">
          <div className="cabecera__titulo">
            <h1>Contenedores</h1>
            <span className="tenue">Todos los contenedores Docker del VPS, con consumo, logs y reinicio</span>
          </div>
        </header>
        {estado && <Servicios resumen={estado.servicios} />}
      </>
    );
  else if (ruta.vista === "alertas")
    contenido = (
      <>
        <header className="cabecera">
          <div className="cabecera__titulo">
            <h1>Alertas</h1>
            <span className="tenue">Qué te avisa el bot de Telegram</span>
          </div>
        </header>
        <Alertas />
      </>
    );
  else if (ruta.vista === "proyecto" && ruta.id === "fersautos")
    contenido = (
      <>
        <header className="cabecera">
          <div className="cabecera__titulo">
            <h1>Fersautos · usuarios en vivo</h1>
            <span className="tenue">Catálogo de Natalia</span>
          </div>
          <div className="cabecera__acciones">
            <a className="boton boton--enlace" href={enlace("logs", { proyecto: "fersautos" })}>
              Ver logs
            </a>
            <button
              type="button"
              className="boton boton--icono-texto"
              onClick={() => window.open("/en-vivo", "fersautos-en-vivo", "popup,width=980,height=820")?.focus()}
            >
              <IconoVentana tam={16} /> Abrir en ventana aparte
            </button>
          </div>
        </header>
        <PanelFersautos estado={estado} ahora={ahora} />
      </>
    );
  else if (ruta.vista === "proyecto" && ruta.id === "anm")
    contenido = <Anm g={general} servicios={servicios.filter((s) => s.grupo === "anm")} ahora={ahora} />;
  else if (ruta.vista === "proyecto")
    contenido = (
      <>
        <header className="cabecera">
          <div className="cabecera__titulo">
            <h1>{ruta.id}</h1>
            <span className="tenue">Proyecto detectado automáticamente en Docker</span>
          </div>
          <a className="boton boton--enlace" href={enlace("logs", { proyecto: ruta.id })}>
            Ver logs
          </a>
        </header>
        {estado && <Servicios resumen={{ ...estado.servicios, servicios: servicios.filter((s) => s.grupo === ruta.id) }} />}
      </>
    );
  else contenido = <General estado={estado} general={general} ahora={ahora} oyentesEvento={oyentesEvento} alModoTv={entrarTv} />;

  return (
    <div className={tv ? "app app--tv" : "app"}>
      <aside className="lateral">
        <div className="logo logo--chico">
          <span className="logo__icono">
            <IconoPulso tam={18} />
          </span>
          <span className="logo__columna">
            <span className="logo__texto">VPS Monitor</span>
            <span className="mono tenue chico">{conectado ? "en vivo" : "reconectando…"}</span>
          </span>
        </div>

        <button type="button" className="lateral__buscar" onClick={() => setPaleta(true)}>
          <span>
            <IconoBuscar tam={14} /> Buscar o saltar a…
          </span>
          <kbd>Ctrl K</kbd>
        </button>

        <Menu activa={claveActiva} proyectos={proyectos} general={general} />

        <div className="lateral__pie">
          <div className="lateral__usuario">
            <strong>{usuario}</strong>
          </div>
          <SelectorTema />
          <button type="button" className="enlace-boton" onClick={alSalir}>
            <IconoSalir tam={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="contenido">
        {tv && (
          <button type="button" className="boton salir-tv" onClick={salirTv}>
            Salir de modo TV (Esc)
          </button>
        )}
        {contenido}
      </main>

      {paleta && <Paleta proyectos={proyectos} alCerrar={() => setPaleta(false)} />}
    </div>
  );
}

// ---------- Menú lateral ----------

function lineaProyecto(p: Proyecto, g: DatosGeneral | null) {
  if (p.id === "fersautos" && g) return { texto: `${g.fersautos.visitasHoy} visitas hoy`, aviso: false };
  if (p.id === "anm" && g?.anm.datos) {
    const urgentes = g.anm.datos.vencimientos.filter((v) => v.dias_habiles !== null && v.dias_habiles >= 0 && v.dias_habiles <= 1).length;
    return urgentes ? { texto: `${urgentes} vence${urgentes === 1 ? "" : "n"} ya`, aviso: true } : { texto: `${g.anm.datos.notificaciones.nuevas_hoy} nuevas hoy`, aviso: false };
  }
  return { texto: `${p.contenedores.bien}/${p.contenedores.total} arriba`, aviso: p.contenedores.bien < p.contenedores.total };
}

/**
 * La pastilla se desliza hasta la sección activa y el riel de la izquierda
 * se llena a medida que bajas por la página.
 */
function Menu({ activa, proyectos, general }: { activa: string; proyectos: Proyecto[]; general: DatosGeneral | null }) {
  const nav = useRef<HTMLElement>(null);
  const enlaces = useRef(new Map<string, HTMLAnchorElement>());
  const nuevosErrores = (general?.errores ?? []).filter((e) => e.nuevo && e.nivel === "error").length;

  useEffect(() => {
    const el = enlaces.current.get(activa);
    if (el) {
      nav.current?.style.setProperty("--y", `${el.offsetTop}px`);
      nav.current?.style.setProperty("--alto", `${el.offsetHeight}px`);
    }
  }, [activa, proyectos.length]);

  useEffect(() => {
    let cuadro = 0;
    const calcular = () => {
      cuadro = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      nav.current?.style.setProperty("--progreso", String(max > 0 ? Math.min(1, scrollY / max) : 0));
    };
    const alDesplazar = () => {
      cuadro ||= requestAnimationFrame(calcular);
    };
    calcular();
    addEventListener("scroll", alDesplazar, { passive: true });
    return () => {
      removeEventListener("scroll", alDesplazar);
      cancelAnimationFrame(cuadro);
    };
  }, []);

  const ref = (clave: string) => (el: HTMLAnchorElement | null) => {
    if (el) enlaces.current.set(clave, el);
  };

  return (
    <nav aria-label="Secciones" className="lateral__nav" ref={nav}>
      <span className="lateral__riel" aria-hidden="true" />
      <span className="lateral__indicador" aria-hidden="true" />
      <span className="lateral__grupo">General</span>
      {GENERALES.map(({ ruta, texto, Icono }) => (
        <a key={ruta} ref={ref(ruta)} className="nav" href={enlace(ruta)} aria-current={activa === ruta ? "page" : undefined}>
          <Icono /> {texto}
          {ruta === "logs" && nuevosErrores > 0 && (
            <span className="nav__insignia" title="Errores nuevos en las últimas 24 h" aria-label={`${nuevosErrores} errores nuevos`}>
              {nuevosErrores}
            </span>
          )}
        </a>
      ))}
      <span className="lateral__grupo">Proyectos</span>
      {proyectos.map((p) => {
        const l = lineaProyecto(p, general);
        const caido = p.contenedores.total > 0 && p.contenedores.bien < p.contenedores.total;
        const clave = `proyecto/${p.id}`;
        return (
          <a key={p.id} ref={ref(clave)} className="nav nav--proyecto" href={enlace(clave)} aria-current={activa === clave ? "page" : undefined}>
            <span className={caido ? "punto punto--caido" : l.aviso ? "punto punto--ambar" : "punto punto--vivo-fijo"} />
            <span className="nav__nombre">{p.nombre}</span>
            <span className={l.aviso ? "nav__dato texto-ambar" : "nav__dato"}>{l.texto}</span>
          </a>
        );
      })}
    </nav>
  );
}

// ---------- Paleta Ctrl+K ----------

function Paleta({ proyectos, alCerrar }: { proyectos: Proyecto[]; alCerrar: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const opciones = [
    ...GENERALES.map((g) => ({ texto: g.texto, destino: enlace(g.ruta) })),
    ...proyectos.map((p) => ({ texto: p.nombre, destino: enlace(`proyecto/${p.id}`) })),
    ...proyectos.map((p) => ({ texto: `Logs de ${p.nombre}`, destino: enlace("logs", { proyecto: p.id }) })),
    { texto: "Logs: solo errores", destino: enlace("logs", { nivel: "error" }) },
    { texto: "Fersautos en ventana aparte", destino: "ventana" },
  ];
  const filtradas = opciones.filter((o) => o.texto.toLowerCase().includes(q.toLowerCase()));
  const ir = (destino: string) => {
    if (destino === "ventana") window.open("/en-vivo", "fersautos-en-vivo", "popup,width=980,height=820")?.focus();
    else navegar(destino);
    alCerrar();
  };
  return (
    <div className="paleta__fondo" onClick={alCerrar}>
      <div className="paleta" role="dialog" aria-label="Saltar a una sección" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="search"
          placeholder="Escribe una sección, proyecto o “logs”…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setI((n) => Math.min(n + 1, filtradas.length - 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setI((n) => Math.max(n - 1, 0)));
            if (e.key === "Enter" && filtradas[i]) ir(filtradas[i]!.destino);
            if (e.key === "Escape") alCerrar();
          }}
        />
        <ul>
          {filtradas.map((o, n) => (
            <li key={o.texto}>
              <button type="button" className={n === i ? "paleta__opcion paleta__opcion--activa" : "paleta__opcion"} onClick={() => ir(o.destino)}>
                {o.texto}
              </button>
            </li>
          ))}
          {filtradas.length === 0 && <li className="tenue chico paleta__vacio">Nada coincide.</li>}
        </ul>
      </div>
    </div>
  );
}
