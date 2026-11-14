import { useState, type FormEvent } from "react";
import { api, ErrorApi } from "../api.ts";
import { SelectorTema } from "../tema.tsx";
import { IconoAlerta, IconoCandado, IconoFlechaDerecha, IconoOjo, IconoOjoTachado, IconoPulso } from "../iconos.tsx";

type Props = { aviso?: string; alIngresar: (usuario: string) => void };

export function Login({ aviso, alIngresar }: Props) {
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ tipo: "error" | "bloqueado"; texto: string } | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setEnviando(true);
    setError(null);
    try {
      const r = await api<{ usuario: string }>("/sesion", {
        metodo: "POST",
        cuerpo: { usuario: datos.get("usuario"), clave: datos.get("clave") },
      });
      alIngresar(r.usuario);
    } catch (err) {
      if (err instanceof ErrorApi) setError({ tipo: err.estado === 429 ? "bloqueado" : "error", texto: err.message });
      else setError({ tipo: "error", texto: "No hay conexión con el servidor." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <section className="login__marca">
        <div className="logo">
          <span className="logo__icono">
            <IconoPulso tam={22} />
          </span>
          <span className="logo__texto">VPS Monitor</span>
        </div>

        <div className="login__titular">
          <h1>
            Tu servidor,
            <br />
            en una sola pantalla.
          </h1>
          <p>CPU, memoria, red y quién está usando tus proyectos en este momento. Todo en vivo, solo para ti.</p>
        </div>

        <div className="consola" aria-hidden="true">
          <div className="consola__puntos">
            <span />
            <span />
            <span />
          </div>
          <div>
            <b>srv</b> Hostinger KVM 2 · Ubuntu 26.04
          </div>
          <div>
            <b>app</b> catalogo-fersautos <em>activo</em>
          </div>
          <div>
            <b>app</b> notificaciones-anm <em>activo</em>
          </div>
          <div>
            <b>sse</b> esperando autenticación<span className="parpadeo">_</span>
          </div>
        </div>
      </section>

      <section className="login__lado">
        <div className="login__tema">
          <SelectorTema compacto />
        </div>
        <form className="login__form" onSubmit={enviar} noValidate>
          <div className="login__encabezado">
            <h2>Iniciar sesión</h2>
            <p>Acceso solo para el administrador del servidor.</p>
          </div>

          {aviso && !error && <div className="aviso aviso--info">{aviso}</div>}
          {error && (
            <div className="aviso aviso--alerta" role="alert">
              {error.tipo === "bloqueado" ? <IconoCandado tam={18} /> : <IconoAlerta tam={18} />}
              <span>{error.texto}</span>
            </div>
          )}

          <div className="campo">
            <label htmlFor="usuario">Usuario</label>
            <input id="usuario" name="usuario" type="text" autoComplete="username" required autoFocus spellCheck={false} />
          </div>

          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <div className="campo__clave">
              <input id="clave" name="clave" type={verClave ? "text" : "password"} autoComplete="current-password" required />
              <button
                type="button"
                className="campo__ojo"
                aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={verClave}
                onClick={() => setVerClave((v) => !v)}
              >
                {verClave ? <IconoOjoTachado tam={20} /> : <IconoOjo tam={20} />}
              </button>
            </div>
          </div>

          <button className="boton-principal" type="submit" disabled={enviando || error?.tipo === "bloqueado"}>
            {enviando ? "Verificando…" : "Entrar al panel"}
            {!enviando && <IconoFlechaDerecha tam={18} />}
          </button>

          <p className="login__pie">
            <IconoCandado tam={16} />
            <span>Conexión HTTPS · la sesión se cierra tras 30 min sin actividad</span>
          </p>
        </form>
      </section>
    </div>
  );
}
