---
id: "DES-001"
title: "Diseño de aplicación"
status: "BORRADOR"
version: "1.0.0"
owner: "Equipo de operaciones"
created_at: "2026-11-06"
updated_at: "2026-11-06"
audit_1_passed: true
audit_2_passed: true
visual_approval_passed: true
audit_3_passed: true
---

# Diseño de aplicación

## 1. Identificación

| Campo | Valor |
|-------|--------|
| Documentos base | `PROB-001`, `FEAT-001`, `MOD-001` |
| Estado | `PENDIENTE_APROBACION_VISUAL` |
| Dueño | Equipo de operaciones |
| Canal | `web_app` · `web` |

`audit_1_passed` y `audit_2_passed` se copian de los documentos ya firmados. Este archivo no aprueba el visto visual.

## 2. Capas

```text
src/routes/disputas.tsx
        │
src/modules/disputes-view/
        │
src/engine/dispute-list/
src/engine/dispute-submit/
src/engine/evidence-match/
        │
src/constants/theme.ts
```

El engine no importa React. La pantalla no es importada por el engine. La espera mínima de 3 segundos vive en `disputes-view`, no en los engines.

## 3. Módulos

| MOD | Entra en V1 | Huérfano |
|-----|-------------|----------|
| MOD-01 `dispute-list` | sí | no |
| MOD-02 `dispute-submit` | sí | no |
| MOD-03 `evidence-match` | sí | no |
| MOD-04 `disputes-view` | sí | no |

Rappi no tiene módulo.

## 4. Flujo de datos

La pantalla comprueba usuario `demo` y contraseña `demo`. Si la pareja no coincide, no llama a los engines.

El cliente pidió rearmar la pantalla con el tablero de la referencia. Los flags de este documento no se modificaron.

Con acceso válido, `disputes-view` llama a `dispute-list` solo del filtro activo. Al entrar el filtro es Uber, la pestaña es Pendientes y el período es 30 días. Esa consulta es el mismo `uber.py disputes`. Las otras pestañas usan el `--status` que el CLI ya tiene, y solo cuando el zonal las pide. PedidosYa se consulta cuando el zonal pulsa ese filtro. Si PedidosYa responde con el anti-bot, la pantalla muestra «bloqueo anti-bot» y no vacía la lista de Uber ya cargada. Mientras espera, muestra el pollo en ASCII al menos 3 segundos, aunque la respuesta llegue antes. En cada disputa, «Agregar imagen» llama a `evidence-match` con el número de esa fila. «Armar disputa» queda habilitado cuando esa fila ya tiene imagen y genera el request con esos `evidence_ids`, sin escribir. «Enviar disputa» queda habilitado recién cuando ese request existe. El envío sigue en dry-run. «Buscar imagen manual» sigue disponible para el número escrito en la búsqueda.

«Mostrar» solo se pinta si esa línea ya trae imagen adjunta. No busca otra orden.

La foto no se guarda en el navegador. La clave de lectura no sale del servidor.

## 5. Flujo de usuario

| Estado | Qué ve el zonal |
|--------|-----------------|
| Sin acceso | Usuario y contraseña. Sin listado. Logo arriba. |
| Cargando listado o foto | Pollo en ASCII, como mínimo 3 segundos, con el texto «revisando informacion». |
| Tablero | Seis tarjetas: cobros sin disputar, disputas abiertas, ganadas, perdidas, tasa de éxito y requests armados. Debajo, incidencia reportada, no entregados y cancelados, y las tiendas con más cobros pendientes. |
| Listado con filas | Pestañas Pendientes, Abiertas, Cerradas ganadas, Cerradas perdidas y Todas. Tabla: pedido, tienda, fecha, problema, monto, estado y «Armar disputa». Búsqueda por pedido o tienda. |
| Listado vacío | El mismo pollo y el texto «todo en orden hoy». No es el error «fuente vacía». |
| Error de fuente | Borde rojo y uno de: «sin credencial», «bloqueo anti-bot», «fuente vacía», «API caída». |
| Foto del mismo pedido | La imagen en pantalla. El borde de esa línea queda verde. |
| Sin coincidencia | Ninguna foto de otro pedido. Borde rojo y «No hay imagen de ese pedido». |
| Envío Uber | Dry-run mientras `confirm` no sea `true`. |
| Envío PedidosYa | 501, sin simular éxito. |
| Rappi | Sin fila y sin búsqueda. |

El verde no es el color del botón. Es el borde de la línea de esa disputa.

## 6. Rutas

Tabla expo-router: `N/A`. Este producto es web.

| Ruta | Pantalla | MOD | FEAT |
|------|----------|-----|------|
| `/disputas` | `disputes-view` | MOD-04 | FEAT-01, FEAT-02 |

## 7. Evidencia Gate 3A

| Pieza | Valor |
|-------|--------|
| URL de preview | N/A |
| Capturas | N/A |
| Prototipo | N/A. Modo construction. `iterations/prototype/` no reemplaza este diseño. |
| Logo | `idea/assets/tarragona-logo.png` |

## 8. Tokens

Los nombres viven en `src/constants/theme.ts`. Ningún componente lleva un color suelto.

| Token | Uso en este módulo | Valor |
|-------|--------------------|-------|
| `background` | Fondo, el del logo | `#000000` |
| `surface` | Fila de disputa | Sin hex. Se distingue del fondo por el borde. |
| `text` | Número de orden, agregador, estado | Claro sobre negro. Sin hex. |
| `textMuted` | Texto secundario, corto | Claro atenuado. Sin hex. |
| `accent` | Marca Tarragona, tomada del logo | `#f70040` |
| `error` | Borde de la línea en fallo o sin foto de ese pedido | Rojo. Sin hex. |
| `border` | Borde definido del botón cuadrado | Sin hex. |
| `success` | Borde de la línea cuando la foto de ese pedido cargó | Verde. Sin hex. |

`success` no está en la lista base de siete tokens. Hace falta porque el verde de la línea no es el rosa de la marca. El cliente cerró el resto sin hex: verde y rojo bastan. Solo el logo aporta `#000000` y `#f70040`.

Reglas:

- Botones cuadrados, con borde definido y poco texto: «Mostrar» y «Cargar evidencia».
- Logo en `idea/assets/tarragona-logo.png`, palabra Tarragona en `#f70040` sobre negro.
- La carga muestra este pollo y no baja de 3 segundos:

```text
    __
  <(o )___
   ( ._> /
    `---'
```

- Si no hay disputas y la consulta respondió: el mismo pollo y «todo en orden hoy».

## 9. Matriz VIEW

| VIEW | MOD | Componente | Tokens | Wireframe |
|------|-----|------------|--------|-----------|
| VIEW-01 | MOD-04 | `disputes-view` | `background`, `surface`, `text`, `textMuted`, `accent`, `error`, `border`, `success` | §10 |

## 10. Wireframe

```text
+------------------------------------------------------------------+
| [logo]  Disputas · Uber Eats              Período 30 días  Actualizar |
|         Actualizado … (America/Santiago)   [Uber] [PedidosYa]    |
+------------------------------------------------------------------+
| Cobros sin disputar | Abiertas | Ganadas | Perdidas | Tasa | Requests |
+------------------------------------------------------------------+
| Pendientes | Abiertas | Cerradas ganadas | Cerradas perdidas | Todas |
| [Buscar pedido o tienda]                      [Buscar imagen manual] |
+------------------------------------------------------------------+
| PEDIDO | TIENDA | FECHA | PROBLEMA | MONTO | ESTADO | Armar disputa |
| D80C3  | …      | …     | …        | $…    | Pendiente |              |
| borde success de esta línea si la foto de ese pedido cargó         |
+------------------------------------------------------------------+

Carga, mínimo 3 segundos:

        __
      <(o )___
       ( ._> /
        `---' revisando informacion

Sin disputas:

        __
      <(o )___
       ( ._> /
        `---'
   todo en orden hoy
```

## 11. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Pintar el verde fuera de `theme.ts`. | El borde de la línea usa `success`. |
| Confundir el rosa del logo con el verde de la línea. | `accent` es `#f70040`. `success` es el borde verde. |
| Cortar el pollo antes de 3 segundos. | `disputes-view` sostiene esa espera aunque el engine ya haya respondido. |

## 12. Checklist 3A

`visual_approval_passed` y `audit_3_passed` permanecen `false`.

- [x] Capas y módulos de 03, sin huérfanos.
- [x] Flujo con acceso, carga, éxito, error, sin coincidencia y sin disputas.
- [x] Ruta web `/disputas`.
- [x] Hex de `success`, `error`, `surface`, `text`, `textMuted` y `border`.
- [x] Wireframe.
- [x] Grafo sin ciclos, copiado de 03.

## Firma del Arquitecto

```text
veredicto: aprobado
auditor: joaqui
fecha: 06-11-2026
```
