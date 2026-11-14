# VPS Monitor

Panel privado para vigilar el VPS (Hostinger KVM 2) y los proyectos que corren en él:

- **Servidor en vivo**: CPU, RAM, memoria auxiliar (swap), disco, tráfico entrante/saliente y ancho de banda del ciclo.
- **Catálogo Fersautos en vivo**: si Natalia está conectada, cuántos visitantes ven el catálogo y cuántos están llenando el formulario de crédito.
- **Servicios**: estado de cada contenedor Docker, consumo, logs y reinicio (con confirmación).
- **Alertas**: CPU/RAM sostenidas, disco lleno, servicio caído, Natalia conectada, formulario enviado (en el panel y, si configuras SMTP, por correo).
- **Login** de un solo administrador: contraseña con hash scrypt, cookie httpOnly, bloqueo por intentos fallidos.

## Cómo funciona

```
Navegador del visitante ──latido cada 15 s──► Catálogo (Next.js) ──POST interno + token──► Monitor
                                                (sabe si es Natalia                       │
                                                 por su sesión)                           │ lee /proc del VPS (solo lectura)
                                                                                          │ habla con docker-proxy (permisos mínimos)
Tu navegador ◄──────────── SSE (datos en vivo cada 2 s) ──────────────────────────────────┘
```

| Pieza | Tecnología | Por qué |
|---|---|---|
| Servidor | Node 22.18+ con **Hono**, TypeScript ejecutado directo (sin compilar) | Liviano: el contenedor usa ~50 MB de RAM |
| Métricas | Lectura de `/proc` (stat, meminfo, net/dev, diskstats) | Es la fuente que usan `top`, `free` e `htop`; no necesita agentes |
| Historial | **SQLite** integrado en Node (`node:sqlite`) | Sin servidor de base de datos ni dependencias nativas |
| Tiempo real | **Server-Sent Events** | Solo el servidor habla; más simple que WebSocket y pasa por Caddy sin configurar nada |
| Frontend | **React + Vite**, gráficas en SVG propio | Sin librerías de gráficas: ~77 KB comprimido |
| Docker | `linuxserver/socket-proxy` | El socket de Docker directo equivale a ser root en el VPS |

```
server/
  index.ts       rutas HTTP, SSE y arranque
  config.ts      variables de entorno
  auth.ts        login, sesiones, bloqueo por intentos, CSRF
  clave.ts       hash scrypt de la contraseña
  metricas.ts    recolector de /proc (+ modo simulado para Windows)
  presencia.ts   usuarios en vivo del catálogo
  docker.ts      contenedores, estadísticas, logs, reinicio
  alertas.ts     umbrales sostenidos y correos
  eventos.ts     "Actividad reciente"
  db.ts          SQLite
web/src/         React: Login, Dashboard y componentes
```

## Desarrollo en tu PC (Windows)

En Windows no existe `/proc`, así que las métricas salen **simuladas** (se mueven solas). Todo lo demás es real.

```bash
npm install
npm run clave            # te pide una contraseña y te da ADMIN_CLAVE_HASH e INGESTA_TOKEN
copy .env.example .env   # pega ahí lo que te dio el paso anterior
```

Dos terminales:

```bash
npm run dev       # servidor en http://localhost:4000
npm run dev:web   # frontend en http://localhost:5173  ← abre este
```

Para ver usuarios en vivo en local, corre también el catálogo con `METRICAS_INGESTA_URL=http://localhost:4000/ingesta/presencia` y `METRICAS_TOKEN=<el mismo INGESTA_TOKEN>` en su `.env`.

Revisar tipos: `npm run typecheck`.

## Despliegue en el VPS

Sigue la misma estructura de la guía del VPS (`/opt/apps/<proyecto>`, red `proxy` de Caddy).

### 1. Clonar y configurar

```bash
cd /opt/apps
git clone https://github.com/jairsanjuan21/MetricasVPS.git metricas
cd metricas
cp .env.production.example .env.production
chmod 600 .env.production
docker compose -f compose.prod.yml build
docker compose -f compose.prod.yml run --rm --no-deps app node server/scripts/generar-clave.ts
nano .env.production     # pega ADMIN_CLAVE_HASH (con las comillas simples) e INGESTA_TOKEN
```

### 2. Levantar

```bash
docker compose -f compose.prod.yml up -d
docker compose -f compose.prod.yml ps        # app "healthy"
docker compose -f compose.prod.yml logs -f app
```

En los logs **no** debe aparecer `No se pudo leer 1/net/dev`. Si aparece, la red mostrada sería la del contenedor:
avísame y lo ajustamos.

### 3. Entrar al panel (túnel SSH, sin dominio)

El panel **no está publicado en internet**: solo escucha en `127.0.0.1:4000` dentro del VPS.
Para verlo, desde tu PC abres un túnel SSH que trae ese puerto a tu computador:

```powershell
ssh -N -L 4000:127.0.0.1:4000 jair@IP_DEL_VPS
```

Deja esa ventana abierta y entra a **http://localhost:4000**. Al cerrar la ventana, el panel deja de ser accesible.
Es la opción más segura: para llegar al login primero hay que tener tu llave SSH.

Desde el celular: apps como Termius permiten el mismo túnel ("Port Forwarding" local 4000 → 127.0.0.1:4000).

> ¿Algún día quieres abrirlo con dominio? Quita `ports:` del compose y agrega en Caddy un bloque con
> `@ingesta path /ingesta/*`, `respond @ingesta 404` y `reverse_proxy metricas-app:4000`.

### 4. Conectar el catálogo

En `/opt/apps/fersautos/.env.production` agrega:

```env
METRICAS_INGESTA_URL=http://metricas-app:4000/ingesta/presencia
METRICAS_TOKEN=<el mismo INGESTA_TOKEN>
```

y redespliega el catálogo (`git pull`, `build`, `up -d app`).

### Actualizar el monitor

```bash
cd /opt/apps/metricas && git pull
docker compose -f compose.prod.yml up -d --build
docker image prune -f
```

## Seguridad: decisiones y por qué

- **El panel no está en internet**: solo escucha en `127.0.0.1` del VPS y se entra por túnel SSH. La ingesta además pide token.
- **Contraseña**: solo se guarda el hash scrypt. 5 intentos fallidos por IP → bloqueo de 15 min. La sesión vence a los 30 min sin actividad (el dashboard abierto cuenta como actividad).
- **Cookie** `httpOnly` + `Secure` + `SameSite=Strict`, y además se verifica el `Origin` en peticiones que cambian algo.
- **CSP estricta**: la página solo carga recursos del propio servidor (las fuentes van empaquetadas, no se piden a Google).
- **Contenedor endurecido**: usuario sin privilegios (uid 10001), sistema de archivos de solo lectura, sin capacidades de Linux, `/proc` montado en solo lectura.
- **Docker**: el monitor nunca ve el socket. El proxy solo permite listar, estadísticas, logs y reiniciar; bloquea crear, ejecutar comandos y extraer archivos de otros contenedores.
- **Privacidad de visitantes**: no se guardan IPs ni datos personales; cada pestaña es un id aleatorio que se muestra abreviado (`V-7F2A`).
