---
id: "BUILD-001"
title: "Plan de construcción V1"
status: "BORRADOR"
version: "1.0.0"
owner: "Equipo de operaciones"
created_at: "2026-11-06"
updated_at: "2026-11-06"
audit_1_passed: true
audit_2_passed: true
visual_approval_passed: true
audit_3_passed: true
ready_for_construction: true
---

# Plan de construcción V1

## 1. Pre-requisitos

Leído en disco, no deseado:

| Documento | Flag | Leído |
|-----------|------|-------|
| `idea/01-problem.md` | `audit_1_passed` | true |
| `idea/02-features.md` | `audit_1_passed` | true |
| `idea/03-module-discovery.md` | `audit_2_passed` | true |
| `idea/04-application-design.md` | `visual_approval_passed` | true |
| `idea/04-application-design.md` | `audit_3_passed` | true |

En 04 el Arquitecto ya dejó `audit_3_passed` en true antes de este plan. Este archivo no lo copia: `audit_3_passed` y `ready_for_construction` salen en false. Construir espera este último en true.

## 2. Alcance

Entran en V1: `FEAT-01`, `FEAT-02`, acceso `demo` / `demo`, log de errores, `dispute-list`, `dispute-submit`, `evidence-match`, `disputes-view`.

No entran: guardar imágenes después de la disputa, opinión del cliente, valor de las disputas perdidas, guardar la imagen en el navegador, disputa Rappi, y los módulos de credenciales, tiendas, catálogo, reportes, automatizaciones y agentes.

## 3. Prototipo

Modo construction. `iterations/prototype/` no sustituye a `iterations/v1/`.

## 4. Canales

Web. El artefacto es `dist/` estático. `npm run dev` no es el release.

## 5. Cronograma

Cada paso queda `PENDIENTE`.

| Paso | Módulo | Feature | Archivos | Estándar | Estado |
|------|--------|---------|----------|----------|--------|
| 01 | toolchain | — | `package.json`, `tsconfig`, `vite.config`, `index.html` | Vite, React 18, TypeScript. `verify` = typecheck + test + build | HECHO |
| 02 | `dispute-list` | FEAT-01 | `src/engine/dispute-list/` | Sin React. Reclamo de PedidosYa no cuenta como disputa. | HECHO |
| 03 | `dispute-submit` | FEAT-01 | `src/engine/dispute-submit/` | Uber dry-run sin `confirm=true`. PedidosYa 501. Rappi sin llamada. | HECHO |
| 04 | `evidence-match` | FEAT-02 | `src/engine/evidence-match/` | Solo el `numero_orden` de esa disputa. Sin coincidencia: ninguna foto. | HECHO |
| 05 | theme | VIEW-01 | `src/constants/theme.ts` | Tokens de 04. Hex solo `#000000` y `#f70040`. | HECHO |
| 06 | `disputes-view` | FEAT-01, FEAT-02 | `src/modules/disputes-view/`, `src/routes/disputas.tsx` | Ruta `/disputas`. Fila de izquierda a derecha. Borde verde o rojo. Pollo ASCII mínimo 3 s con «revisando informacion». Vacío: «todo en orden hoy». | HECHO |
| 07 | integración | FEAT-01, FEAT-02 | servidor del panel | Clave de lectura solo en el servidor. `uber.py` y `pya.py` por subproceso. `GET /v1/evidencia`. | HECHO |
| 08 | verify | — | `dist/` | `npm run verify` y el directorio `dist/`. | HECHO |

## 6. Fases

| Fase | Para | Criterio de parada |
|------|------|--------------------|
| 1 | Toolchain | Typecheck limpio. |
| 2 | Engines | Smoke del engine en menos de 30 s. |
| 3 | Theme y pantalla | Cero hex suelto fuera de `theme.ts`. |
| 4 | Cierre | `npm run verify` y `dist/` generado. |

## 7. Dependencias

`vite`, `react`, `react-dom` y `typescript` con `~`, nunca `^`. No hay Expo ni React Native: este producto es solo web.

## 8. Pruebas

- Engine: el pedido 15 no muestra fotos del 16. Lista vacía no es éxito.
- Engine: un `issue` de PedidosYa no entra al conteo de disputas sin abrir.
- Engine: Uber sin `confirm=true` no escribe. PedidosYa responde 501 y no simula éxito.
- Pantalla, manual: pollo visible al menos 3 segundos, borde verde solo con la foto de ese pedido, borde rojo con «No hay imagen de ese pedido».
- `npm run verify` cubre typecheck, pruebas de engine y `vite build`.

## 9. Riesgos

| Riesgo | Contención |
|--------|------------|
| La clave de lectura queda en el bundle. | El paso 07 la deja en el servidor. El verify no debe encontrar la clave en `dist/`. |
| PerimeterX o cookie vencida. | Textos «bloqueo anti-bot» y «sin credencial». S-05 sigue abierto. |
| `confirm=true` de Uber no está probado en vivo. | V1 no lo dispara solo. |
| La espera de 3 segundos se recorta. | La sostiene `disputes-view`. |

## 10. Criterios de la iteración

Los juzga el Arquitecto. Este plan no los da por cumplidos.

- Las dos features obligatorias se recorren en `/disputas`.
- La foto mostrada lleva el número de pedido de esa línea.
- El release es `dist/`, sin servidor de desarrollo.
- No hay secretos en el repositorio ni en el log.

## 11. Checklist por paso

En cada paso, al cerrarlo: cero hex suelto, id de la RTM trazado, escenario BDD de ese paso, sin error de TypeScript. Los ocho pasos quedaron HECHO tras `npm run verify` en `iterations/v1`. El veredicto de la iteración sigue en `review.md`, vacío.

## Firma del Arquitecto

```text
veredicto: aprobado
auditor: joaquin
fecha: 06-11-2026
```
