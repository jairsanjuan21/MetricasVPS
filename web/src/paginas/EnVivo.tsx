import { useEffect } from "react";
import { useReloj, useVivo } from "../useVivo.ts";
import { Actividad, Catalogo } from "../componentes/Catalogo.tsx";
import { SelectorTema } from "../tema.tsx";
import { hora } from "../formato.ts";
import { IconoPulso } from "../iconos.tsx";
import type { Evento } from "../tipos.ts";

/** Solo lo que pasa en el catálogo: así la actividad de servidores no se mezcla aquí. */
const DEL_CATALOGO: Evento["tipo"][] = ["natalia_conectada", "natalia_desconectada", "formulario_abierto", "formulario_enviado"];

/**
 * Ventana aparte con los usuarios en vivo del catálogo Fersautos (ruta /en-vivo).
 * Pensada para dejarla abierta en un lado de la pantalla o en otro monitor.
 */
export function EnVivo() {
  const { estado, conectado } = useVivo();
  const ahora = useReloj(5_000);
  const p = estado?.presencia;

  // El título de la pestaña también avisa: se ve aunque la ventana esté minimizada en la barra de tareas
  useEffect(() => {
    if (!p) return;
    const enFormulario = p.conteo.formulario ? ` · ${p.conteo.formulario} en formulario` : "";
    document.title = `(${p.conteo.conectados}) Fersautos en vivo${enFormulario}`;
    return () => {
      document.title = "VPS Monitor";
    };
  }, [p]);

  return (
    <div className="en-vivo-pagina">
      <header className="en-vivo-pagina__cabeza">
        <div className="logo logo--chico">
          <span className="logo__icono">
            <IconoPulso tam={18} />
          </span>
          <div className="en-vivo-pagina__titulo">
            <h1>Fersautos · usuarios en vivo</h1>
            <span className="en-vivo">
              <span className={conectado ? "punto punto--vivo" : "punto punto--apagado"} />
              {conectado ? `En vivo · ${hora(ahora)}` : "Reconectando…"}
            </span>
          </div>
        </div>
        <SelectorTema compacto />
      </header>

      {!p ? (
        <p className="tenue">Conectando con el servidor…</p>
      ) : (
        <>
          <Catalogo p={p} ahora={ahora} />
          <section className="tarjeta">
            <h2>Actividad del catálogo</h2>
            <Actividad eventos={estado.eventos.filter((e) => DEL_CATALOGO.includes(e.tipo))} ahora={ahora} />
          </section>
        </>
      )}
    </div>
  );
}
