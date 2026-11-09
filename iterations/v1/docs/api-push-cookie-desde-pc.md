# API: empujar cookie Uber desde el PC (Grok / rutina local)

El panel **no devuelve** la cookie. Solo confirma que quedó guardada en `sessions/uber_cookie` y enlazada al CLI (`uber.py`).

## Auth

| Header | Valor |
|--------|--------|
| `Authorization` | `Bearer <CREDENTIALS_API_TOKEN>` |
| `Content-Type` | `application/json` |

El token es el mismo del `.env` del VPS (`CREDENTIALS_API_TOKEN`). **No** sirve el login `demo` del panel.

Si el token está vacío en el servidor → **503** `Inyección de credenciales deshabilitada`.

## Endpoint

```http
POST /api/credentials/uber
```

Query opcional:

- `?check=false` — guarda sin health check (más rápido; igual escribe el archivo).

### Body (JSON)

```json
{
  "cookie": "sid=...; jwt-session=...; ..."
}
```

También acepta `"value"` en lugar de `"cookie"`. Puede ir con prefijo `Cookie:`.

Máximo ~16 KiB.

### Respuesta OK (sin el secreto)

```json
{
  "ok": true,
  "platform": "uber",
  "saved_at": "2026-11-09T14:00:00-03:00",
  "length": 1234,
  "health": { "ok": true, "stores_sample": ["…"] }
}
```

Si `health.ok` es `false`, la cookie se guardó igual pero Uber no la aceptó (caducada o incompleta).

### Errores frecuentes

| HTTP | Significado |
|------|-------------|
| 401 | Bearer incorrecto |
| 503 | Token M2M no configurado en el VPS |
| 400 | Cookie vacía o mal formada |
| 413 | Cuerpo demasiado grande |

## Estado (sin secreto)

```bash
curl -sS -H "Authorization: Bearer $CREDENTIALS_API_TOKEN" \
  "$PANEL_URL/api/credentials/status"
```

---

## Uso desde el PC de Grok (curl)

Variables en el PC (no las subas a chats públicos):

```bash
export PANEL_URL="https://tu-dominio-o-tunel"
export CREDENTIALS_API_TOKEN="el-hex-del-vps"
```

Desde un archivo que dejó la rutina del navegador:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $CREDENTIALS_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  "$PANEL_URL/api/credentials/uber" <<EOF
{"cookie":"$(tr -d '\n' < /ruta/uber_cookie_header.txt)"}
EOF
```

Más seguro (evita límites de shell con cookies largas):

```bash
python3 - <<'PY'
import json, os, urllib.request
url = os.environ["PANEL_URL"].rstrip("/") + "/api/credentials/uber"
token = os.environ["CREDENTIALS_API_TOKEN"]
cookie = open("/ruta/uber_cookie_header.txt", encoding="utf-8").read().strip()
req = urllib.request.Request(
    url,
    data=json.dumps({"cookie": cookie}).encode(),
    method="POST",
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=120) as r:
    print(r.status, r.read().decode())
PY
```

---

## Script del repo (recomendado)

En el PC, con el repo o solo copiando `tools/push_credentials.py`:

```bash
export PANEL_URL="https://..."
export CREDENTIALS_API_TOKEN="..."

# Desde ~/.uber_cookie del box
python3 tools/push_credentials.py --uber

# Desde archivo exportado por el navegador (rutina Grok)
python3 tools/push_credentials.py --uber --from-file /tmp/uber_cookie_header.txt

# Sin health remoto
python3 tools/push_credentials.py --uber --from-file ./cookie.txt --no-check

# Solo ver si ya hay sesión en el VPS
python3 tools/push_credentials.py --status
```

---

## Flujo típico Grok en el PC

1. Abrir `merchants.ubereats.com` con sesión válida.
2. Exportar header **Cookie** a un archivo local (una línea), p. ej. `uber_cookie_header.txt`.
3. `POST /api/credentials/uber` con el script o curl de arriba.
4. En el panel, chip **Uber: cargada**; `uber.py monitor` usa `sessions/uber_cookie`.

No reintentar login en bucle si el health falla: renovar cookie en el navegador y volver a empujar.

---

## Setup en el VPS (admin, una vez)

```bash
openssl rand -hex 32   # pegar en iterations/v1/.env
```

```env
CREDENTIALS_API_TOKEN=...
SESSIONS_DIR=/home/dev/panel-disputas/iterations/v1/sessions
```

Reiniciar `node server/index.mjs`. El mismo token lo configura Grok en `CREDENTIALS_API_TOKEN` en el PC.
