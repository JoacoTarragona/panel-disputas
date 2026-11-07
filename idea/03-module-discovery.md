---
id: "MOD-001"
title: "Descubrimiento de módulos"
status: "BORRADOR"
version: "1.0.0"
owner: "Equipo de operaciones"
created_at: "2026-11-06"
updated_at: "2026-11-06"
audit_1_passed: true
audit_2_passed: true
---

# Descubrimiento de módulos

## 1. Identificación

| Campo | Valor |
|-------|--------|
| Documentos base | `PROB-001`, `FEAT-001` |
| Estado de gate | `PENDIENTE_AUDITORIA_MODULOS` |
| Dueño | Equipo de operaciones |
| Gate 1 | Copiado de `idea/01-problem.md` y `idea/02-features.md`: `audit_1_passed: true` |

El cliente confirmó el corte: dos engines para `FEAT-01`, un engine para `FEAT-02`, una sola pantalla, el acceso `demo` dentro de esa pantalla, reutilizar los CLI y la API de evidencia, y dejar Rappi fuera de V1.

## 2. RTM

| MOD | FEAT | ERR | Nombre | Tipo | Responsabilidad única |
|-----|------|-----|--------|------|------------------------|
| MOD-01 | FEAT-01 | ERR-01 | `dispute-list` | engine | Armar el tablero con las filas y los contadores de la misma consulta. |
| MOD-02 | FEAT-01 | ERR-01 | `dispute-submit` | engine | Armar el request de disputa según el agregador. |
| MOD-03 | FEAT-02 | ERR-02 | `evidence-match` | engine | Buscar solo la foto rotulada con el número de pedido de esa disputa. |
| MOD-04 | FEAT-01, FEAT-02 | ERR-01, ERR-02 | `disputes-view` | UI | Pintar el tablero, las pestañas, la búsqueda y «Buscar imagen manual». |
| MOD-05 | FEAT-01 | ERR-01 | `credentials` | engine | Validar y guardar la cookie de Uber y los tokens de PedidosYa, sin devolver el valor. |

## 3. Módulos

### MOD-01 — `dispute-list`

Ruta: `src/engine/dispute-list/`.

Entradas: la salida de `uber.py disputes` y la de PedidosYa (`order`, `issues`). No recibe la contraseña.

Salidas:

- Uber: cobros pendientes, con tienda, `order_id`, fecha, monto CLP, issue/tag, state, ventana y `eligibility` si vino.
- PedidosYa: `isDisputeAllowed` y `dispute.status`. Los reclamos (`issues`) no entran al conteo de disputas sin abrir.
- Rappi: sin conexión y sin cifra inventada.

Dependencias: `uber.py` y `pya.py`, por subproceso. Este módulo no los reimplementa.

Aislamiento: no importa React ni `disputes-view`. No importa `dispute-submit` ni `evidence-match`.

### MOD-02 — `dispute-submit`

Ruta: `src/engine/dispute-submit/`.

Entradas: agregador, identificador del pedido y, en Uber, `workflow`, `restaurant`, `reason`, `description` si viene, `evidence_ids[]` y `confirm`. No recibe la contraseña.

Salidas:

- Uber: `POST /api/disputes/uber/{order_id}/submit`. Sin `confirm=true` el resultado es dry-run y no hay escritura.
- PedidosYa: 501. No se simula éxito.
- Rappi: no hay llamada.

Dependencias: los CLI ya existentes. Recibe el pedido elegido; no importa `dispute-list`.

Aislamiento: no importa React ni la pantalla.

### MOD-03 — `evidence-match`

Ruta: `src/engine/evidence-match/`.

Entradas: `agregador` y `numero_orden` de la disputa que está en pantalla. La clave de lectura se usa en el servidor y no sale en el resultado.

Salida con coincidencia: los JPEG de `GET /v1/evidencia?agregador=&numero_orden=`, de la más antigua a la más nueva, y cada uno con `GET /v1/evidencia/{id}/imagen`. Toda foto devuelta trae ese `numero_orden`.

Salida sin coincidencia: ninguna foto, color rojo y la advertencia «No hay imagen de ese pedido». Una lista vacía, un 404 de imagen o una foto de otro número son este caso.

V1 no lo invoca para Rappi: no hay fila de disputa. Si el agregador fuera `rappi`, no busca y no muestra foto.

No hace `POST /v1/evidencia`.

Dependencia: la API de evidencia ya existente. No importa los otros engines ni la pantalla.

### MOD-04 — `disputes-view`

Ruta: `src/modules/disputes-view/`. La ruta web concreta queda para `04-application-design.md`.

Entradas: los resultados de `dispute-list`, `dispute-submit` y `evidence-match`.

Salidas en pantalla: acceso con usuario `demo` y contraseña `demo`; tablero con las seis tarjetas, pestañas, búsqueda por pedido o tienda y tabla. «Armar disputa» delega en `dispute-submit`. «Buscar imagen manual» delega en `evidence-match` con el número escrito y el agregador activo. La foto de ese pedido deja la línea en verde. Sin coincidencia, la línea queda en rojo con «No hay imagen de ese pedido». La contraseña no se escribe en el log. Sin esa pareja no se llama a los engines.

Aislamiento: pinta y delega. La regla de coincidencia vive en `evidence-match`. El armado del request vive en `dispute-submit`. Qué es una disputa sin abrir vive en `dispute-list`. Ningún engine importa esta pantalla.

## 4. Grafo

Sin ciclos. Los tres engines no se importan entre sí.

```text
src/routes/          (ruta web, nombre en el documento 04)
        │ consume
disputes-view
        │ consume
dispute-list
dispute-submit
evidence-match
        │ no importa
theme.ts
```

`disputes-view` consume los tokens. Los engines no consumen el theme.

## 5. Riesgos

| Módulo | Riesgo | Mitigación |
|--------|--------|------------|
| `dispute-list` | Contar un reclamo de PedidosYa como disputa sin abrir. | Los `issues` salen aparte y no suman. |
| `dispute-submit` | Disparar la escritura de Uber sin prueba en vivo. | Sin `confirm=true` queda en dry-run. |
| `evidence-match` | Mostrar la foto de otro pedido. | Solo sale la rotulada con ese `numero_orden`. Si no hay coincidencia, rojo y «No hay imagen de ese pedido». |
| `disputes-view` | Filtrar la clave de lectura o la contraseña al navegador o al log. | La clave queda en el servidor. La contraseña no se registra. |
| Los tres engines | PerimeterX o credencial vencida en el agregador. | El texto corto lo pinta la pantalla: «bloqueo anti-bot», «sin credencial», «fuente vacía» o «API caída». El emparejamiento fino sigue en S-05. |

## 6. Reutilización

| Pieza | Decisión |
|-------|----------|
| `uber.py` | Reutilizar |
| `pya.py` | Reutilizar |
| API de evidencia (`GET /v1/evidencia`) | Reutilizar |
| `dispute-list`, `dispute-submit`, `evidence-match`, `disputes-view` | Crear nuevo |
| Adapter de disputa Rappi | Diferir. Fuera de los módulos de V1. |

## 7. Checklist Gate 2

`audit_2_passed` está en `true` en el frontmatter, puesto por el Arquitecto.

- [x] `FEAT-01` tiene `MOD-01` y `MOD-02`. `FEAT-02` tiene `MOD-03`.
- [x] Cada módulo tiene una responsabilidad.
- [x] Contratos de entrada y salida.
- [x] Aislamiento: engine sin React; la UI no es llamada por el engine.
- [x] Grafo sin ciclos.
- [x] Reutilización decidida en cada pieza.
- [x] YAML con Gate 1 en `true` y Gate 2 en `true`.

## Firma del Arquitecto

```text
veredicto: 
auditor: 
fecha: 
```
