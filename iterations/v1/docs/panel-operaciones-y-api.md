# Panel de operaciones y disputas — guía de funcionamiento

Documento de referencia para **panel-disputas** (`iterations/v1`): qué hace el producto, cómo se despliega, API HTTP, inyección de credenciales, precauciones y trabajo pendiente.

---

## 1. Qué es y qué módulos tiene

Aplicación web (Vite + React) servida por **Node 20** en `127.0.0.1` (puerto por defecto **8790**). No expone credenciales en respuestas JSON.

| Módulo (ruta) | Función |
|---------------|---------|
| **Operaciones** (`/operaciones`) | Estado en vivo de locales (Uber / PedidosYa) vía `uber.py` / `pya.py monitor`. KPIs, tarjetas por local, **abrir**, **cerrar/pausar**, **agotados** por tienda. |
| **Estadísticas** (`/estadisticas`) | Resumen histórico desde SQLite de operaciones (`operations/panel_ops.py`). |
| **Disputas** (`/disputas`) | Listado de incidencias Uber/PYA, emparejamiento con fotos de evidencia, armado de request (envío real en dry-run en v1). |
| **Captura** (`/captura`) | Subida de foto de pedido hacia la API de evidencia externa. |
| **Credenciales** (`/credenciales`) | Carga manual de cookie Uber, login + OTP PedidosYa, refresh/check. |

**Rappi:** sin conexión CLI en esta versión (listados y operaciones devuelven `sin conexion`).

**Login del panel (UI):** usuario `demo`, contraseña `demo`. Cookie de sesión `panel_session` (HttpOnly, en memoria del proceso — se pierde al reiniciar Node).

---

## 2. Arquitectura en el VPS

```
Navegador → Node (index.mjs) → spawn python3
                                ├── uber.py / pya.py (app-delivery)
                                ├── panel_ops.py (muestreo / SQLite ops)
                                └── playwright / scripts (solo login Uber opcional)

sessions/
  uber_cookie, pya_tokens.json   (chmod 0600)
  home/.uber_cookie → symlink
  home/.pya_tokens.json → symlink   ← HOME del CLI = sessions/home
```

- **`load-env.mjs`** lee `iterations/v1/.env` al arrancar el servidor.
- Tras **cambios en `server/`**, hay que **reiniciar Node**; si no, rutas nuevas pueden caer en el SPA y el front muestra «API caída».
- **`GET /healthz`** y **`GET /health`**: sin auth, para probes y túnel.

### Arranque típico

```bash
cd iterations/v1
npm install
npm run build          # genera dist/
node server/index.mjs  # escucha 127.0.0.1:8790
```

Acceso público opcional: túnel (p. ej. Cloudflare Quick Tunnel) hacia `127.0.0.1:8790`. La URL del túnel **cambia** cada vez que se reinicia `cloudflared`.

---

## 3. Autenticación de la API

Dos capas distintas:

| Mecanismo | Uso | Header / cookie |
|-----------|-----|------------------|
| **Sesión panel** | UI tras login demo | Cookie `panel_session` (automática con `credentials: 'include'`) |
| **M2M credenciales** | Inyectar cookie/tokens desde el PC (Grok, rutinas) | `Authorization: Bearer <CREDENTIALS_API_TOKEN>` |

- Casi todo `/api/*` exige **sesión panel**, salvo los endpoints M2M de credenciales y el login.
- `CREDENTIALS_API_TOKEN` vacío en `.env` → **503** en POST M2M (`Inyección de credenciales deshabilitada`).
- Fallos repetidos de Bearer → **429** (rate limit por IP, ventana 15 min).
- Rutas `/api/...` inexistentes responden **404 JSON**, no HTML.

---

## 4. Cómo se inyectan las credenciales

### 4.1 Desde la UI (`/credenciales`)

**Uber**

- Pegar cookie en textarea → **Probar** (`POST /api/credentials/uber/check`).
- **Conectar** / **Traer cookie**: login portal o archivos de rutina (`pullUberCookie` en `uber-cookie.mjs`).
- Al guardar: escribe `sessions/uber_cookie` y symlink en `sessions/home/.uber_cookie`.

**PedidosYa**

- `POST /api/credentials/pedidosya/login` → si hace falta OTP, `POST /api/credentials/pedidosya/otp`.
- Tokens en `sessions/pya_tokens.json` + symlink `.pya_tokens.json` en `home/`.

### 4.2 Desde el PC / Grok (M2M) — flujo recomendado

1. En el VPS, en `iterations/v1/.env`, definir un token largo aleatorio:

   ```bash
   CREDENTIALS_API_TOKEN=<hex-64-chars>
   ```

2. Reiniciar el servidor Node y comprobar en el log: `inyección M2M: activa`.

3. En el PC que tiene la cookie (nunca commitear ni pegar en chats públicos):

   ```bash
   export PANEL_URL="https://tu-tunel-o-dominio"
   export CREDENTIALS_API_TOKEN="<el-mismo-que-en-vps>"
   ```

4. **Uber** — una línea de cookie (acepta prefijo `Cookie:`):

   ```bash
   curl -sS -X POST "$PANEL_URL/api/credentials/uber?check=true" \
     -H "Authorization: Bearer $CREDENTIALS_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data-binary '{"cookie":"sid=...; jwt-session=..."}'
   ```

   Respuesta **no** incluye el secreto: `length`, `saved_at`, `health.ok`, muestra de tiendas si el check pasó.

   Query `?check=false` guarda sin probar contra Uber (más rápido).

5. **PedidosYa** — JSON con tokens del portal:

   ```bash
   curl -sS -X POST "$PANEL_URL/api/credentials/pya?check=true" \
     -H "Authorization: Bearer $CREDENTIALS_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"access":"...","refresh":"...","device":"..."}'
   ```

6. **Estado** (sesión o Bearer):

   ```bash
   curl -sS -H "Authorization: Bearer $CREDENTIALS_API_TOKEN" \
     "$PANEL_URL/api/credentials/status"
   ```

7. **Script del repo** (`tools/push_credentials.py`):

   ```bash
   python3 tools/push_credentials.py --uber --from-file /ruta/cookie.txt
   python3 tools/push_credentials.py --pya
   ```

   Usa las mismas variables `PANEL_URL` y `CREDENTIALS_API_TOKEN`.

Documento complementario: [api-push-cookie-desde-pc.md](./api-push-cookie-desde-pc.md).

---

## 5. Referencia de API HTTP

Base: `http://127.0.0.1:8790` (o URL del túnel). Cuerpos JSON salvo indicación.

### Sistema y auth UI

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/healthz`, `/health` | — | `{ ok, service }` |
| POST | `/api/login` | — | Body `{ user, password }` → Set-Cookie `panel_session` |
| GET | `/api/me` | sesión | `{ ok: true }` |

### Credenciales (M2M con Bearer; status también con sesión)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/credentials/uber` | Body `{ cookie }` o `{ value }`. Query `check=false` opcional. |
| POST | `/api/credentials/pya` | Body `{ access, refresh, device? }` |
| GET | `/api/credentials/status` | Uber/PYA configured, mtimes, health resumido |
| POST | `/api/credentials` | Sesión. Inyección combinada legacy (`injectCredentials`) |
| PUT | `/api/credentials/uber` \| `/pedidosya` | Sesión. Texto plano en `value` |

### Credenciales (solo sesión panel)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/credentials/uber/login` | Usuario/contraseña portal, fuerza renovación |
| POST | `/api/credentials/uber/refresh` | Traer cookie (rutina / archivo / login si hay user/pass) |
| POST | `/api/credentials/uber/check` | Probar cookie (opcional guardar) |
| POST | `/api/credentials/pedidosya/login` | Inicio login PYA; puede devolver `otp_required` |
| POST | `/api/credentials/pedidosya/otp` | Completa OTP |

### Operaciones

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/operaciones/estado/actualizar` | Body `{ agregador }` → `live` CLI + métricas del día |
| GET | `/api/operaciones/resumen` | Query `agregador`, `desde`, `hasta`, `agrupar` |
| POST | `/api/operaciones/local/abrir` | Body `{ agregador, store_id, name? }` → `activate --yes` |
| POST | `/api/operaciones/local/cerrar` | Body `{ agregador, store_id, name? }` → `pause --yes` |
| GET | `/api/operaciones/local/agotados` | Query `agregador`, `store_id`, `name` → `soldout-report --json` |

Errores habituales: `sin credencial` (401), `bloqueo anti-bot` (502 PYA), `sin conexion` (Rappi, 503), mensaje CLI truncado (502).

### Disputas y evidencia

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/disputes` | Query `agregador`, `estado`, `dias` |
| POST | `/api/disputas/armar` \| `/disputas/enviar` | Dry-run en v1 (`confirm: false`) |
| POST | `/api/captura/evidencia` | Base64 JPEG + orden |
| POST | `/api/evidencia` | Lista evidencia por pedido |
| GET | `/api/evidencia/:id/imagen` | Proxy a `EVIDENCIA_URL` |

---

## 6. Operaciones en pantalla

1. **Actualizar** → `estado/actualizar` (muestrea y persiste en `data/ops.sqlite` vía `panel_ops.py`).
2. **KPIs** → contadores por `kind` (`open`, `paused`, `closed`, `offhours`). Clic en la tarjeta despliega nombres.
3. **Por local:** **Abrir** / **Cerrar** (confirmación en navegador). **Agotados** consulta menú (puede tardar; timeout servidor hasta 180 s en reporte).
4. Escrituras reales en agregadores: equivalen a CLI con `--yes`.

Sampler en producción: ver `operations/README.md` y ejemplos `ops-sampler.*.example`.

---

## 7. Variables de entorno (resumen)

Ver `iterations/v1/.env.example`. **No versionar** `.env` ni `sessions/`.

| Variable | Rol |
|----------|-----|
| `PANEL_PORT` | Puerto (default 8790) |
| `SESSIONS_DIR` | Carpeta de cookies/tokens |
| `CREDENTIALS_API_TOKEN` | Bearer M2M |
| `UBER_CLI`, `PYA_CLI` | Rutas a scripts |
| `UBER_FETCH_CMD`, `UBER_LOGIN_CLI`, … | Rutinas opcionales cookie Uber |
| `EVIDENCIA_URL`, `EVIDENCIA_READ_KEY` | API de fotos para disputas |
| `OPS_DB` | SQLite operaciones (opcional) |

---

## 8. Precauciones y seguridad

1. **Nunca** subir a git: `.env`, `sessions/`, `data/ops.sqlite` con datos reales, cookies, tokens.
2. **Rotar** `CREDENTIALS_API_TOKEN` si se filtró; reiniciar Node.
3. El login `demo/demo` es **temporal** — no usar en internet abierto sin túnel con acceso restringido o auth real.
4. Node solo en **127.0.0.1**; el túnel expone todo el panel — proteger URL del túnel y M2M.
5. **Abrir/Cerrar** afecta tiendas reales; siempre hay confirmación en UI, pero M2M de operaciones no existe (solo sesión).
6. Tras deploy o pull, **reiniciar Node** y **hard refresh** del navegador (`dist/` nuevo).
7. Cookies Uber cortas (< 32 chars) se rechazan en refresh automático.
8. Playwright (login Uber en servidor) puede requerir deps del SO; preferir inyección M2M desde PC con sesión válida.
9. Rate limit en Bearer M2M: evitar brute force del token.
10. Los secretos **no** aparecen en logs del panel ni en respuestas `health`/`status` (solo longitudes y mtimes).

---

## 9. Pendientes / roadmap

| Área | Estado |
|------|--------|
| Login panel real (usuarios, roles) | Pendiente |
| Envío real de disputas Uber (`confirm: true`) | Dry-run solo |
| Disputas PedidosYa | 501 / no implementado |
| Rappi (monitor, disputas, ops) | Sin conexión |
| `activate-menu` / soldout / instock por ítem desde UI | Solo reporte agotados + abrir/cerrar |
| Auth en escrituras operaciones (auditoría) | Solo sesión demo |
| HTTPS terminación propia (sin túnel) | Pendiente ops |
| Playwright deps en Ubuntu VPS | Puede faltar `install-deps` |
| Sampler systemd/cron | Ejemplos en repo; activación manual |
| Documentar evidencia-upload key en captura móvil | Parcial en README raíz |
| Unificar especificación `idea/fuentes/especificacion-panel-delivery.md` con rutas reales v1 | Parcial |

---

## 10. Diagnóstico rápido

| Síntoma | Causa probable |
|---------|----------------|
| «API caída» en operaciones locales | Node viejo sin rutas → reiniciar servidor |
| 503 inyección M2M | Falta `CREDENTIALS_API_TOKEN` en `.env` |
| 401 en API UI | Sesión expirada (re-login) |
| 401 Bearer | Token distinto al del VPS |
| HTML en vez de JSON en `/api/*` | Proceso antiguo (ya mitigado con 404 JSON) |
| Uber ok en CLI pero no en panel | Symlink `sessions/home/.uber_cookie` roto |
| PYA «bloqueo anti-bot» | IP/datacenter; reintentar o login desde red distinta |

---

## 11. Enlaces internos del repo

- [README raíz](../../../README.md) — disputas y evidencia
- [api-push-cookie-desde-pc.md](./api-push-cookie-desde-pc.md) — curl M2M detallado
- [pedido-admin-vps-ubuntu.md](./pedido-admin-vps-ubuntu.md) — checklist VPS
- [operations/README.md](../../../operations/README.md) — muestreo SQLite

---

*Última actualización: alineado con `iterations/v1` (operaciones abrir/cerrar/agotados, M2M credenciales, PanelShell).*
