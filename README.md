# Panel de disputas

Panel web para **operaciones** (estado de locales, abrir/cerrar, agotados), **estadísticas**, **disputas** (Uber y PedidosYa), captura de evidencia y **credenciales**. Rappi no tiene conexión en esta versión.

**Guía completa (API, M2M, precauciones, pendientes):** [`iterations/v1/docs/panel-operaciones-y-api.md`](iterations/v1/docs/panel-operaciones-y-api.md).

La app del teléfono y la API de evidencia siguen en `app-delivery`. Este repositorio no guarda cookies, tokens ni la base de fotos.

## Uso

Requisitos: Node 20 y los CLI ya instalados en la máquina.

```bash
cd iterations/v1
npm install
npm run verify
npm run server
```

El panel escucha en `http://127.0.0.1:8790/disputas`. `npm run dev` no es la entrega: la release es `dist/` servida por `node server/index.mjs`.

Acceso temporal de la pantalla: usuario `demo`, contraseña `demo`. No se escribe en el log. La sesión vive en memoria y se pierde al reiniciar el proceso.

Al entrar se cargan las disputas de Uber de los últimos 30 días. PedidosYa se consulta solo si se pulsa ese filtro. El período puede ser 7, 30 o 90 días.

En cada fila el orden es fijo:

1. **Agregar imagen.** Busca la foto de ese pedido y de ese agregador. Sin coincidencia, la fila queda en rojo con «No hay imagen de ese pedido» y no muestra otra orden.
2. **Armar disputa.** Se habilita cuando esa fila ya tiene imagen. Genera el request con esos `evidence_ids`.
3. **Enviar disputa.** Se habilita cuando el request ya existe. En esta versión no escribe en Uber: la respuesta es dry-run (`confirm` queda en false). PedidosYa responde 501.

Las credenciales se guardan en `iterations/v1/sessions/` (o `SESSIONS_DIR`).

- **Uber:** cookie en el módulo **Credenciales**.
- **PedidosYa:** usuario y contraseña del portal en **Credenciales**; si el portal pide OTP, el código se ingresa en la misma pantalla. El servidor ejecuta el login del `pya.py` y escribe `pya_tokens.json` para el CLI.
- **M2M opcional (box):** `Bearer` con `CREDENTIALS_API_TOKEN` para empujar cookies/tokens sin UI.

```http
POST /api/credentials/uber
POST /api/credentials/pya
GET  /api/credentials/status
Authorization: Bearer <CREDENTIALS_API_TOKEN>
```

Uber: `{"cookie":"..."}` (opcional prefijo `Cookie:`). PedidosYa: `access`, `refresh` obligatorios; `device` opcional. No se devuelve el secreto; la respuesta trae `length`, `health` y `mtime` en status.

Desde el box: `tools/push_credentials.py` (`PANEL_URL`, `CREDENTIALS_API_TOKEN`). Ver también el doc de inyección en uploads del proyecto.

Si PedidosYa responde con el anti-bot, la pantalla muestra «bloqueo anti-bot» y la lista de Uber ya cargada sigue disponible.

## Variables

Copiar `iterations/v1/.env.example` a `iterations/v1/.env`. Ese archivo no se versiona.

| Variable | Uso |
|----------|-----|
| `PANEL_PORT` | Puerto del panel. Default `8790`, solo en `127.0.0.1`. |
| `SESSIONS_DIR` | Carpeta de `uber_cookie` y `pya_tokens.json`. Default `iterations/v1/sessions`. |
| `CREDENTIALS_API_TOKEN` | Bearer hex para inyectar desde el box. Vacío = M2M deshabilitado. |
| `UBER_CLI` | Ruta de `uber.py`. Si no está, usa el CLI de `app-delivery`. |
| `PYA_CLI` | Ruta de `pya.py`. Misma regla. |
| `EVIDENCIA_URL` | API de fotos. Default `http://127.0.0.1:8787`. |
| `EVIDENCIA_READ_KEY` | Clave de lectura. Sin ella, «Agregar imagen» responde «sin credencial». |

El panel no sube fotos. La clave de subida no entra aquí.

## Datos que guarda este panel

No hay SQLite ni otro motor dentro del panel.

- La cookie de login `panel_session` está en memoria del proceso, `HttpOnly` y `SameSite=Lax`.
- Uber se guarda en `iterations/v1/sessions/uber_cookie`, modo `0600`.
- PedidosYa se guarda en `iterations/v1/sessions/pya_tokens.json`, modo `0600`. Solo quedan `access`, `refresh` y `device`.
- `iterations/v1/sessions/home` tiene los enlaces `.uber_cookie` y `.pya_tokens.json` para que los CLI los lean por `HOME`.
- `sessions/` está en `.gitignore`. No subir esos archivos.

Los listados de Uber y PedidosYa no se persisten: cada consulta vuelve a ejecutar el CLI.

## Base de la evidencia

Las fotos no están en este repositorio. Las guarda la API de `idea/fuentes/evidencia-server.py`. En esta máquina el directorio es `/home/dev/app-delivery/captura/data/`.

| Archivo | Qué es |
|---------|--------|
| `evidencia.sqlite` | Base SQLite. Modo WAL: lo recién escrito puede estar en `evidencia.sqlite-wal` hasta el checkpoint. |
| `files/` | JPEG en disco. El nombre es `{id}.jpg`. |
| `read-key` | Clave de lectura, modo `0600`. Es la que usa el panel. |
| `upload-key` | Clave de subida, modo `0600`. La usa la app del teléfono, no este panel. |

Tabla `evidencia`:

| Columna | Tipo | Regla |
|---------|------|--------|
| `id` | TEXT | Clave primaria. UUID. |
| `agregador` | TEXT | Solo `uber`, `pedidosya` o `rappi`. |
| `numero_orden` | TEXT | Recortado, de 1 a 80 caracteres, sin `/`, `\` ni nulo. |
| `storage_name` | TEXT | Único. Apunta al archivo en `files/`. |
| `content_type` | TEXT | JPEG. |
| `byte_size` | INTEGER | Tamaño del archivo. Máximo 8.000.000 bytes. |
| `created_at` | TEXT | UTC, `YYYY-MM-DDTHH:MM:SSZ`. |

Índice `evidencia_clave_idx` sobre `(agregador, numero_orden, created_at)`. Varias fotos del mismo pedido salen de la más antigua a la más nueva.

La lectura es `GET /v1/evidencia?agregador=&numero_orden=` con `Authorization: Bearer` de la clave de lectura. La imagen es `GET /v1/evidencia/{id}/imagen`. Falta de clave, clave distinta o rol distinto responden igual: `401 {"error":"no autorizado"}`.
