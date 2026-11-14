import { useEffect, useState } from "react";
import { api, configurarSesionVencida } from "./api.ts";
import { Login } from "./paginas/Login.tsx";
import { Dashboard } from "./paginas/Dashboard.tsx";
import { EnVivo } from "./paginas/EnVivo.tsx";

/** /en-vivo abre solo los usuarios del catálogo (ventana aparte); cualquier otra ruta, el dashboard. */
const esVentanaEnVivo = location.pathname.startsWith("/en-vivo");

type Estado = { tipo: "cargando" } | { tipo: "fuera"; aviso?: string } | { tipo: "dentro"; usuario: string };

export function App() {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  useEffect(() => {
    configurarSesionVencida(() => setEstado({ tipo: "fuera", aviso: "Tu sesión se cerró por inactividad. Vuelve a ingresar." }));
    api<{ usuario: string }>("/sesion")
      .then((r) => setEstado({ tipo: "dentro", usuario: r.usuario }))
      .catch(() => setEstado({ tipo: "fuera" }));
  }, []);

  if (estado.tipo === "cargando") return <div className="cargando" aria-busy="true" />;
  if (estado.tipo === "fuera")
    return <Login aviso={estado.aviso} alIngresar={(usuario) => setEstado({ tipo: "dentro", usuario })} />;
  if (esVentanaEnVivo) return <EnVivo />;
  return (
    <Dashboard
      usuario={estado.usuario}
      alSalir={async () => {
        await api("/sesion", { metodo: "DELETE" }).catch(() => {});
        setEstado({ tipo: "fuera" });
      }}
    />
  );
}
