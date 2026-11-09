# Operaciones — muestreo y estadísticas

Lectura vía `uber.py` / `pya.py monitor --json`. Sin Playwright.

## Base

- SQLite: `iterations/v1/data/ops.sqlite` (o `OPS_DB`)
- Script: `operations/panel_ops.py`

## Comandos

```bash
export OPS_CLI_HOME=/home/dev/panel-disputas/iterations/v1/sessions/home
python3 operations/panel_ops.py init
python3 operations/panel_ops.py sample --agregador uber
python3 operations/panel_ops.py resumen --agregador uber --agrupar dia
```

## Cron (cada 5 minutos)

```bash
crontab -e
```

Agregar:

```cron
*/5 * * * * OPS_CLI_HOME=/home/dev/panel-disputas/iterations/v1/sessions/home /home/dev/panel-disputas/operations/sample_all.sh >>/tmp/panel-ops-sampler.log 2>&1
```

O copiar `iterations/v1/ops-sampler.cron.example` y ajustar rutas.

## API del panel

- `POST /api/operaciones/estado/actualizar` — muestra en vivo + guarda en BD
- `GET /api/operaciones/resumen?agregador=&desde=&hasta=&agrupar=hora|dia|mes` — curvas y motivos

## Rappi

Responde `sin conexion` hasta tener adapter CLI.
