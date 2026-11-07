---
id: "FEAT-001"
title: "Especificación de características"
status: "BORRADOR"
version: "1.0.0"
owner: "Equipo de operaciones"
created_at: "2026-11-06"
updated_at: "2026-11-06"
audit_1_passed: true
---

# Especificación de características

## 1. Identificación

| Campo | Valor |
|-------|--------|
| Documento base | `PROB-001` |
| Estado de gate | `PENDIENTE_AUDITORIA_DOCUMENTACION` |
| Dueño | Equipo de operaciones |
| Alcance de esta versión | Las cinco capacidades confirmadas entran en V1. No hay deseables. |

El control de acceso y el log de errores no tienen un `ERR` propio. Van como criterio de `FEAT-01` y `FEAT-02`, y como `NFR`. No se abre una feature sin dolor.

## 2. RTM 1:1

| FEAT | ERR | Nombre | Prioridad | Módulo destino |
|------|-----|--------|-----------|----------------|
| FEAT-01 | ERR-01 | Ver disputas sin abrir y enviarlas | Alta | `dispute-list`, `dispute-submit`, `disputes-view` |
| FEAT-02 | ERR-02 | Agregar evidencia por número de pedido y agregador | Alta | `evidence-match`, `disputes-view` |

Prioridad Alta en las dos: el cliente las marcó obligatorias de V1 y no ordenó una sobre la otra.

## 3. Obligatorias

### FEAT-01 — Ver disputas sin abrir y enviarlas

Cubre `ERR-01`. La usa el usuario `demo`.

Descripción: entra al portal y ve el tablero del agregador elegido. La consulta sigue siendo la del CLI ya documentado. La pantalla muestra cobros sin disputar, disputas abiertas, ganadas, perdidas, tasa de éxito y requests armados; debajo, las pestañas Pendientes, Abiertas, Cerradas ganadas, Cerradas perdidas y Todas, la búsqueda por pedido o tienda, y la tabla con pedido, tienda, fecha, problema, monto, estado y «Armar disputa».

El cliente confirmó que `idea/fuentes/especificacion-panel-delivery.md` y `idea/fuentes/API_Tarragona.md` describen esa API y la conexión con cada agregador.

Escenario feliz:

Dado el usuario `demo` en el portal
Cuando revisa las disputas sin abrir de Uber
Entonces ve los cobros pendientes, con tienda, `order_id`, fecha, monto CLP, issue/tag, state y ventana

Dado una disputa Uber lista para armar
Cuando pide el envío
Entonces el módulo arma `POST /api/disputes/uber/{order_id}/submit` con `workflow`, `restaurant`, `reason`, `description` si viene, `evidence_ids[]` y `confirm`. Sin `confirm=true` el request queda en dry-run y no se llama la escritura

Dado un pedido PedidosYa
Cuando se consulta la disputa
Entonces se muestran `isDisputeAllowed` y `dispute.status`, y los reclamos (`issues`) no se cuentan como disputas sin abrir

Dado un envío PedidosYa
Cuando el usuario lo pide
Entonces el módulo responde 501 y no simula éxito

Dado Rappi
Cuando se pide el listado o el envío
Entonces no hay conexión: la documentación lo deja pendiente, sin CLI ni credenciales

Escenario de error: la pantalla no se cae. La disputa no queda enviada como si hubiera salido bien. Se ve en rojo y el log muestra uno de estos textos: «sin credencial», «bloqueo anti-bot», «sin imagen», «fuente vacía», «API caída».

### FEAT-02 — Agregar evidencia por número de pedido y agregador

Cubre `ERR-02`. La usa el usuario `demo`.

Descripción: «Buscar imagen manual» hace que el servidor busque la foto rotulada con el número de pedido escrito en la búsqueda y el agregador activo. La clave de lectura va en el servidor. El navegador no la recibe y no guarda la imagen. Una foto de otro pedido no se muestra.

Fuente: `idea/fuentes/evidencia-server.py` y `idea/fuentes/test_evidencia.py`.

Request de lectura:

```text
GET /v1/evidencia?agregador={uber|pedidosya|rappi}&numero_orden={id de la disputa}
Authorization: Bearer <clave de lectura>
```

`numero_orden` es el identificador del pedido en la disputa, recortado, de 1 a 80 caracteres, sin `/`, `\` ni nulo. `agregador` sale de la disputa y solo vale `uber`, `pedidosya` o `rappi`. `pedya` responde 400.

Respuesta 200: `{"images":[{id, created_at, agregador, numero_orden, url}]}`. Varias fotos de la misma pareja vienen de la más antigua a la más nueva. La `url` no lleva secreto. Cada imagen se pide aparte:

```text
GET /v1/evidencia/{id}/imagen
Authorization: Bearer <clave de lectura>
```

Esa respuesta es `image/jpeg`. La ficha `GET /v1/evidencia/{id}` aporta `content_type`, `byte_size` e `imagen_url`, también con la clave de lectura.

El módulo no hace `POST /v1/evidencia`. Esa vía es de la app, con la clave de subida. La clave de subida no lista ni descarga. La clave de lectura no sube. Falta de clave, clave distinta o rol distinto responden igual: 401 `{"error":"no autorizado"}`.

Escenario feliz:

Dado una disputa con agregador y número de pedido, y el usuario `demo`
Cuando presiona «Buscar imagen manual»
Entonces el servidor arma el GET con el número de pedido de esa disputa, recibe solo imágenes de ese número, descarga el JPEG con la clave de lectura, lo muestra, y la disputa queda en verde

Escenario de error: la imagen no queda en el navegador. La disputa queda en rojo.

| Respuesta de la API | Log | Color |
|---------------------|-----|-------|
| 401 `no autorizado` | sin credencial | rojo |
| 200 con `images: []`, u otra orden que no coincide | No hay imagen de ese pedido | rojo |
| 404 al pedir la imagen | No hay imagen de ese pedido | rojo |
| 500 | API caída | rojo |
| 400 `Falta un agregador válido` o `Falta el número de orden` | el texto que devuelve la API | rojo |

`GET /healthz` no lleva clave y responde `{"ok": true}`. Sirve para saber si la API está caída antes de marcar «API caída».

El bloqueo anti-bot no sale de esta API. Sigue en la API del agregador.

Los agregadores aceptados son los de la documentación entregada (`idea/fuentes/especificacion-panel-delivery.md` y `idea/fuentes/API_Tarragona.md`).

| Agregador | Qué dice la documentación | Envío de disputa |
|-----------|---------------------------|------------------|
| `uber` | `uber.py disputes` lista cobros pendientes (sin disputar). El detalle con fotos es `dispute-photos`. Campos públicos: tienda, `order_id`, fecha, monto CLP, issue/tag, state, ventana y `eligibility` si vino. | `POST /api/disputes/uber/{order_id}/submit` con `workflow`, `restaurant`, `reason`, `description` opcional, `evidence_ids[]` y `confirm`. En v1 el default es dry-run. `confirm=true` no está verificado en vivo. |
| `pedidosya` | No hay listado de disputas. `issues` son reclamos o descuentos, no disputas pendientes. El detalle de un pedido expone `isDisputeAllowed` y `dispute.status`. Las fotos salen de `pya.py order <id> --photos`; una lista vacía es válida. | No hay endpoint. El panel responde 501. El flujo real citado es Help Center / `cases-api`, sin cablear. |
| `rappi` | Integración pendiente. No hay CLI ni `client_id` / `client_secret`. Sin cifras. | Fuera de esta documentación. |

Esas dos fuentes describen el request de la disputa y la conexión con el agregador. La lectura de la foto del local es la otra API, ya entregada.

Rappi acepta evidencia (`agregador=rappi`) y no tiene listado ni envío de disputa. Sin una disputa Rappi en pantalla, no hay desde dónde disparar esa búsqueda.

## 3.1 Rol de las fuentes

| Tema | Estado |
|------|--------|
| Request de disputa y conexión con el agregador | Confirmado. Lo definen las dos fuentes de `idea/fuentes/`. |
| Uber | Listado de cobros pendientes. Envío en dry-run hasta `confirm=true`. |
| PedidosYa | Sin listado de disputas. Reclamo no es disputa. Envío 501, sin simular éxito. |
| Rappi | Pendiente en la documentación. Sin conexión de disputa en V1. |
| Evidencia del local | Confirmada. `GET /v1/evidencia` con clave de lectura en el servidor. Agregadores `uber`, `pedidosya`, `rappi`. |
| Fotos que la API de disputa ya devuelve | Uber `dispute-photos` y PedidosYa `order --photos`. Siguen en el contrato del agregador. No reemplazan la API de evidencia. |
| Credenciales de Uber y PedidosYa | Entran. Sin ellas el listado no puede consultar las plataformas. El valor no vuelve al navegador. |
| Acceso V1 | Confirmado y temporal: usuario `demo`, contraseña `demo`. |

[SUPUESTO] S-05: los textos cortos ya confirmados se corresponden con esas fallas de la documentación. El cliente lo corrige si el emparejamiento no es el suyo.

## 4. Deseables V1.1+

| FEAT | Nombre | Motivo |
|------|--------|--------|
| — | Ninguna | El cliente marcó todas las capacidades de esta versión como obligatorias. |

## 5. Fuera de alcance

Igual que `01-problem.md`:

- Guardado de imágenes después de la disputa.
- Opinión del cliente.
- El valor de las disputas perdidas.
- Guardar la imagen en el navegador. El navegador solo la carga.

## 6. NFR medibles

| ID | Categoría | Criterio | Validación |
|----|-----------|----------|------------|
| NFR-01 | Rendimiento | Smoke del engine en menos de 30 s. Estándar WIKA del canal. | `npm run verify`, cuando exista el proyecto |
| NFR-02 | Build | Artefacto de release `dist/` estático. | Script declarado en `05-build-plan.md` |
| NFR-03 | Fidelidad visual | Borde verde de la línea cuando la foto de ese pedido cargó. Borde rojo cuando hay error. Botones cuadrados, marca Tarragona, poco texto. | Documento 04 |
| NFR-04 | Offline | N/A. Listar, cargar evidencia y enviar dependen de la API. | No hay flujo principal sin red |
| NFR-05 | Acceso | V1 entra solo con usuario `demo` y contraseña `demo`. | Otra pareja no lista, no carga evidencia y no arma la disputa. La credencial no aparece en el log. |
| NFR-06 | Evidencia | «Buscar imagen manual» usa el número de pedido escrito y el agregador activo. Toda foto mostrada trae ese `numero_orden`. Sin coincidencia: rojo y «No hay imagen de ese pedido». | Pedido 15 no muestra fotos del 16. Con foto del mismo número, JPEG visible y disputa en verde. |
| NFR-07 | Errores | Sin foto de ese pedido: «No hay imagen de ese pedido». Los otros textos cortos siguen siendo «sin credencial», «bloqueo anti-bot», «fuente vacía» y «API caída». | Log visible y disputa en rojo |

## 7. Mapeo UI

| FEAT | Componente | Pantalla | Token | Mockup |
|------|------------|----------|--------|--------|
| FEAT-01 | Listado de disputas sin abrir. Acción de enviar. | [PENDIENTE] la ruta | Rojo = error | [PENDIENTE] |
| FEAT-02 | Botón «Buscar imagen manual». | `/disputas` | Verde = foto del mismo número de pedido. Rojo = sin coincidencia u otro error | Tablero de disputas |

Las rutas y el catálogo de tokens se cierran en `04-application-design.md`, después del Gate 2.

## 8. Checklist Gate 1

`audit_1_passed` permanece `false`. Gate 1 se aprueba junto con `01-problem.md`.

- [x] Cada `ERR` de 01 tiene un `FEAT`.
- [x] Cada obligatoria tiene escenario feliz y escenario de error.
- [x] Deseables en tabla aparte. En esta versión no hay.
- [x] Fuera de alcance igual al de 01.
- [x] Cada `NFR` tiene criterio y validación.
- [x] Catálogo de agregadores tomado de la documentación: `uber`, `pedidosya`, `rappi` pendiente.
- [x] Rol de las fuentes confirmado: request de disputa y conexión con agregadores.
- [x] Contrato HTTP de la API de evidencia, tomado de `idea/fuentes/evidencia-server.py` y `test_evidencia.py`.
- [x] Acceso V1: usuario `demo` y contraseña `demo`.

## Firma del Arquitecto

```text
APROBADO
Arquitecto
2026-11-06
```
