# Pruebas automáticas de Clarea

Abren Clarea en un navegador (tamaño iPhone) y comprueban cada parte: Inicio y «Para hoy», Estudiar, Agenda y calendario, Notas, Amigos y grupos, la IA («Pregúntale a tu IA», el conector de Claude), preguntas de examen, proyectos, horario y faltas. En cada pantalla pasan además una revisión de accesibilidad (WCAG 2.1 AA, con axe-core), **en claro y en oscuro**: fallan si hay problemas graves, como poco contraste.

## Antes de sacar una versión

```
cd C:\Users\32icv\Clarea\pwa
python build_clarea.py
cd ..\tests
npx playwright test
```

- Prueban la web ya montada en `C:\Users\32icv\clarea-web` (por eso primero `build_clarea.py`).
- Para probar tu rama sin tocar clarea-web: `CLAREA_OUT=<carpeta>` al montar y `CLAREA_ROOT=<carpeta>` al pasar las pruebas.
- Si algo falla, el detalle queda en `test-results/` (con una foto de la página en ese momento).

## Qué se simula (nada real)

| Qué | Cómo |
|---|---|
| Cuentas (Firebase) | `fbmock.py`, en el puerto 9299. |
| La web | `serve.py`, en el puerto **8156** (`CLAREA_PORT` para otro). |
| El servidor de Clarea | `wrangler dev --local` en el puerto **8797**, con su propio almacén (`.wrangler-pruebas/`). Se arranca solo. Amigos y grupos usan pases de prueba `dev\|uid\|usuario`, que el servidor solo acepta en 127.0.0.1. |
| Gemini | `fakeGemini()` en `helpers.js`: responde lo que diga cada prueba, también «saturado» (503). Sin clave ni internet. |
| Claude | La prueba hace de Claude: llama a las herramientas del conector (`clarea_pendiente`, `clarea_leer`, `clarea_guardar`). Claude no se abre: solo se mira el enlace. |

En GitHub no está el servidor: allí las pruebas que lo necesitan se saltan. Pásalas en este ordenador antes de cada versión.

## Cuenta (`cuenta.spec.js`)

Cambiar la contraseña, la sesión que se cierra si cambia en otro dispositivo y el código de recuperación. El código necesita el servidor local con el sustituto de Firebase:

```
cd ..\push-worker
npx wrangler dev --local --port 8797 --var FB_MOCK:http://127.0.0.1:9299
```

Sin él, esa prueba se salta. Puertos distintos: `CLAREA_FB` y `CLAREA_WORKER`.
