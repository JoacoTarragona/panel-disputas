# Pedido al admin del VPS (Ubuntu, root)

**Objetivo:** que el panel en `iterations/v1` pueda **iniciar sesión en Uber Eats Manager** con Playwright, guardar la cookie en `sessions/` y alimentar `uber.py`.

**Alcance:** solo preparación en el servidor. El operador usa después la pantalla **Credenciales** (sin root).

---

## 1. Node.js 20

```bash
apt update
apt install -y ca-certificates curl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # esperado: v20.x
```

## 2. Dependencias del proyecto

```bash
cd /home/dev/panel-disputas/iterations/v1
npm install
```

## 3. Chromium y librerías (Playwright)

No usar `sudo npx` si `npx` no está en el PATH de root. Usar el binario local del proyecto (como root no hace falta `sudo`):

```bash
cd /home/dev/panel-disputas/iterations/v1
./node_modules/.bin/playwright install-deps chromium
./node_modules/.bin/playwright install chromium
```

Si `install-deps` falla, instalar paquetes en Ubuntu y repetir:

```bash
apt install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0
```

En Ubuntu 24.04 el paquete de audio puede llamarse `libasound2t64` en lugar de `libasound2`.

## 4. Variables de entorno (opcional)

Archivo `iterations/v1/.env` (modo `600`, no versionar):

```bash
PANEL_PORT=8790
SESSIONS_DIR=/home/dev/panel-disputas/iterations/v1/sessions
UBER_CLI=/ruta/en/el/vps/uber.py
PYA_CLI=/ruta/en/el/vps/pya.py
```

Opcional — rutina que deja `/tmp/uber_cookie_header.txt` y el panel la importa con **Traer cookie**:

```bash
UBER_FETCH_CMD='python3 /ruta/a/refresh_uber_cookie.py --from-file /tmp/uber_cookie_header.txt'
```

## 5. Permisos de sesiones

```bash
mkdir -p /home/dev/panel-disputas/iterations/v1/sessions/home
chmod 700 /home/dev/panel-disputas/iterations/v1/sessions
chmod 700 /home/dev/panel-disputas/iterations/v1/sessions/home
# Si el servicio corre con un usuario dedicado:
# chown -R USUARIO:USUARIO sessions
```

## 6. Arrancar o reiniciar el panel

```bash
pkill -f "node server/index.mjs" 2>/dev/null
sleep 1
cd /home/dev/panel-disputas/iterations/v1
node server/index.mjs
```

**Producción (ejemplo con log):**

```bash
cd /home/dev/panel-disputas/iterations/v1
nohup node server/index.mjs >> /var/log/panel-disputas.log 2>&1 &
```

El panel escucha por defecto en **127.0.0.1:8790** (no exponer a Internet sin reverse proxy/TLS).

## 7. Comprobación

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8790/credenciales
./node_modules/.bin/playwright --version
```

Debe devolver **200** en el curl.

## 8. Uso posterior (operador, sin root)

1. Abrir el panel → **Módulos → Credenciales**.
2. Uber: correo y contraseña de **Uber Eats Manager** → **Conectar Uber**.
3. Si falla (2FA/captcha): pegar el header `Cookie` desde Chrome en merchants.ubereats.com → **Guardar cookie pegada** → **Probar sesión**.

PedidosYa: usuario/contraseña + código OTP en la misma pantalla (Python, no Playwright).

## Notas de seguridad

- No commitear `.env`, cookies ni tokens.
- Archivos en `sessions/` modo **0600**; directorio **0700**.
- Si Uber exige 2FA frecuente, conviene la rutina del navegador + `UBER_FETCH_CMD` o pegado manual de cookie.

## Checklist para el admin

- [ ] Node 20 instalado
- [ ] `npm install` en `iterations/v1`
- [ ] `playwright install-deps` + `install chromium` OK
- [ ] Rutas `UBER_CLI` / `PYA_CLI` en `.env`
- [ ] Panel reiniciado y `curl` a `/credenciales` → 200
- [ ] Operador probó **Conectar Uber** o pegado de cookie
