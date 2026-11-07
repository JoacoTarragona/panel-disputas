---
id: "PROB-001"
title: "Módulo de disputas"
status: "BORRADOR"
version: "1.0.0"
owner: "Equipo de operaciones"
created_at: "2026-11-06"
updated_at: "2026-11-06"
audit_1_passed: true
solution_type: "web_app"
delivery_channels:
  - web
project_mode: "construction"
---

# Módulo de disputas

## 1. Identificación

| Campo | Valor |
|-------|--------|
| Nombre | Módulo de disputas |
| Ruta del producto | Raíz del repositorio `panel-disputas` (`idea/`, `audits/`, `iterations/`, `final/`). Equivale a `proyectos/app/panel-disputas/` en el layout WIKA. |
| Dueño | Equipo de operaciones |
| Stakeholders | Equipo de operaciones (dueño). Zonal de tienda (usa V1). Equipo de aplicaciones (monitorea V1). |
| Estado de gate | `PENDIENTE_AUDITORIA_DOCUMENTACION` |
| Canal | `web_app` · `web` |

## 2. Problema

Hoy las disputas se hacen a mano, tienda por tienda.

Duele, en este orden:

1. No se hace la disputa.
2. Se pierde la disputa por falta de pruebas.

Si eso sigue igual, se sigue perdiendo el dinero que se disputa.

Estado deseado: automatizar y centralizar estas disputas.

La evidencia la toma el local con la app de delivery. En la base queda rotulada con agregador y número de pedido. Al agregar evidencia, el módulo busca sola la evidencia de ese número de pedido y de ese agregador. El navegador la carga y no la guarda.

## 3. RTM inicial

El módulo destino quedó en `idea/03-module-discovery.md`.

| ERR | Dolor | Impacto | FEAT | Módulo destino tentativo |
|-----|--------|---------|------|--------------------------|
| ERR-01 | No se hace la disputa. El trabajo es manual, tienda por tienda. | Se pierde el dinero que se podría disputar. | FEAT-01 | `dispute-list`, `dispute-submit`, `disputes-view` |
| ERR-02 | Se pierde la disputa por falta de pruebas. | Se pierde el dinero disputado. | FEAT-02 | `evidence-match`, `disputes-view` |

## 4. Audiencia

| Rol | Necesidad |
|-----|-----------|
| Zonal de tienda | Entrar al portal, revisar disputas sin abrir, cargar la evidencia y enviar la disputa. |
| Equipo de aplicaciones | Monitorear la primera versión. |
| Equipo de operaciones | Dueño del módulo. |
| Usuario `demo` | Único que entra en V1, con contraseña `demo`. |

En V1 el acceso es temporal: usuario `demo` y contraseña `demo`. No hay alta de más usuarios en esta versión.

### Out of scope de V1

Dicho por el cliente:

- Guardado de imágenes después de la disputa.
- Opinión del cliente.
- El valor de las disputas perdidas.
- Guardar la imagen en el navegador. El navegador solo la carga.

## 5. Objetivo medible

V1 cumple cuando el módulo:

- Lista y muestra los pedidos en disputa, incluidas las disputas sin abrir.
- Al agregar evidencia, busca en la base la evidencia de ese número de pedido y de ese agregador, y la carga.
- Conecta la API ya preparada y deja lista la automatización.
- Arma el request de disputa según el agregador: Uber en dry-run hasta `confirm=true`, PedidosYa en 501, Rappi sin conexión.
- Arroja un log de errores claro. Si no hay foto de ese pedido, la advertencia es «No hay imagen de ese pedido». Los otros textos cortos son «sin credencial», «bloqueo anti-bot», «fuente vacía» y «API caída».
- Muestra la disputa en verde cuando el request quedó armado y la imagen cargó. El rojo marca el error.

Beneficio buscado: dejar de operar tienda por tienda y pasar a una disputa automatizada y centralizada.

## 6. BDD

### Escenario principal

Dado que el zonal de tienda entró al portal con usuario `demo` y contraseña `demo`
Cuando revisa las disputas sin abrir
Entonces ve el listado de esos pedidos en disputa

Dado una disputa sin abrir, con agregador y número de pedido
Cuando presiona «Cargar evidencia»
Entonces el módulo busca solo la evidencia rotulada con el número de pedido de esa disputa y la carga en la pantalla

Dado el request armado y la imagen cargada
Cuando el módulo muestra esa disputa
Entonces la disputa se ve en verde

Dado la evidencia de ese pedido cargada y el usuario `demo`
Cuando arma el request de disputa
Entonces Uber queda en dry-run hasta `confirm=true`, PedidosYa responde 501 sin simular éxito, y Rappi no tiene conexión

### Escenarios de fallo

En todos, la disputa no queda enviada como si hubiera salido bien. El módulo deja el texto corto y marca la disputa en rojo.

| Dado | Cuando | Entonces |
|------|--------|----------|
| Falta la credencial de la API | Se intenta cargar evidencia o enviar la disputa | Log «sin credencial». Disputa en rojo. La acción no se completa. |
| La API aplica un bloqueo anti-bot | Se intenta la llamada automática | Log «bloqueo anti-bot». Disputa en rojo. La acción no se completa. |
| No hay evidencia con el número de pedido de esa disputa | Se presiona «Cargar evidencia» | Advertencia «No hay imagen de ese pedido». Disputa en rojo. No se muestra una foto de otro pedido. |
| La fuente viene vacía | Se consulta la disputa o la evidencia | Log «fuente vacía». Disputa en rojo. La acción no se completa. |
| La API falla | Se consulta o se envía | Log «API caída». Disputa en rojo. La acción no se completa. |

### Escenario de presentación

Dado la pantalla del módulo
Cuando el zonal de tienda ve una acción
Entonces el botón es cuadrado, con borde definido, la pantalla muestra la marca Tarragona Chile, y el botón no lleva una descripción larga

Los nombres de token (`background`, `surface`, `text`, `textMuted`, `accent`, `error`, `border`) y los colores quedan [PENDIENTE] para `04-application-design.md`.

## 7. Restricciones

| Categoría | Límite | Impacto | Estándar |
|-----------|--------|---------|----------|
| Plataforma V1 | Panel web. La app de teléfono que toma la evidencia vive en `app-delivery`, fuera de este repositorio. | El artefacto de release es `dist/` estático. | `web_app` · canal `web` |
| Acceso | V1 entra con usuario `demo` y contraseña `demo`. Es temporal. | Sin esa pareja no se listan disputas, no se carga evidencia y no se arma el request. | Credencial de demostración, no un alta de usuarios |
| Evidencia en el navegador | El navegador carga la imagen y no la guarda. | La imagen no queda persistida en el cliente. | Solo lectura en pantalla |
| Estado visual | Verde: el request quedó armado y la imagen cargó. Rojo: error. | El zonal distingue el acierto del fallo sin un texto largo. | Hex y tokens formales en el documento 04 |
| Búsqueda de evidencia | «Cargar evidencia» pide `GET /v1/evidencia?agregador=&numero_orden=` con el número de pedido de la disputa en curso y la clave de lectura en el servidor. | Si ese número no coincide, no se muestra imagen. Rojo y advertencia «No hay imagen de ese pedido». | `idea/fuentes/evidencia-server.py` |
| Marca y controles | Aspecto moderno. Botones cuadrados con bordes definidos. Marca Tarragona Chile. Intuitivo, con poco texto en cada botón. | La pantalla se reconoce como Tarragona y las acciones se entienden sin un párrafo por botón. | Tokens formales en el documento 04 |
| Librerías prohibidas | [PENDIENTE] | [PENDIENTE] | [PENDIENTE] |

## 8. Supuestos y riesgos

| Id | Tipo | Enunciado | Mitigación |
|----|------|-----------|------------|
| S-01 | Confirmado | Zonal de tienda es quien usa V1. | — |
| S-02 | Confirmado | El modo es construction. | — |
| S-03 | Confirmado | La base guarda la evidencia que el local toma con la app de delivery. Cada evidencia va rotulada con agregador y número de pedido. El origen es la API de evidencia de `app-delivery`. | — |
| S-04 | Confirmado | `idea/fuentes/especificacion-panel-delivery.md` y `idea/fuentes/API_Tarragona.md` describen el request de disputa y la conexión con cada agregador. Uber lista y arma dry-run. PedidosYa no lista disputas y el envío responde 501. Rappi queda pendiente en esa API. | La lectura de la foto es `GET /v1/evidencia`, con clave de lectura. Rappi sí tiene evidencia y no tiene disputa. |
| S-05 | [SUPUESTO] | «sin credencial», «bloqueo anti-bot» y «fuente vacía» corresponden a cookie/token vencido, PerimeterX 403 y error de fuente sin convertir en cero. | El cliente confirma o corrige el emparejamiento. |
| R-01 | Riesgo | La API puede bloquear la llamada porque detecta automatización. | El fallo se muestra como «bloqueo anti-bot», en rojo. Cómo se evita el bloqueo sigue [PENDIENTE]. |
| R-02 | Riesgo | Cualquiera podría entrar al módulo. | V1 exige usuario `demo` y contraseña `demo`. La credencial es temporal y no se escribe en el log. |

## 9. Checklist de aceptación

El gate no se marca. `audit_1_passed` permanece `false`.

- [x] YAML con `id`, `status`, `owner` y fechas.
- [x] Problema, impacto, estado actual y estado deseado.
- [x] Audiencia.
- [x] Out of scope explícito.
- [x] Objetivo medible.
- [x] `ERR-01` y `ERR-02` con impacto. El texto de cada `FEAT` está en `02-features.md`.
- [x] BDD del flujo principal, de los cinco fallos y de la presentación.
- [x] Restricciones de acceso, evidencia, búsqueda y marca alineadas al canal web.
- [ ] Librerías prohibidas: [PENDIENTE]. No bloquea el paso a features; se cierra si el cliente nombra alguna.

## Firma del Arquitecto

```text
APROBADO
Arquitecto
2026-11-06
```
