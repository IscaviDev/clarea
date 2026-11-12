# Pruebas automáticas de Clarea

Abren Clarea en un navegador (tamaño iPhone) y comprueban lo principal: crear cuenta y elegir clase, el inicio y el buscador, el calendario y los avisos de un evento, Configuración, importar preguntas de examen y la página de un proyecto. En cada pantalla pasan además una revisión de accesibilidad (WCAG 2.1 AA, con axe-core): fallan si hay problemas graves.

## Antes de sacar una versión

```
cd C:\Users\32icv\estudio-examen-pj6\pwa
python build_clarea.py
cd ..\tests
npx playwright test
```

- Prueban la web ya construida en `C:\Users\32icv\clarea` (por eso primero `build_clarea.py`).
- No crean cuentas de verdad: usan `fbmock.py`, un sustituto local de Firebase, y `serve.py` para servir la web como GitHub Pages.
- Si algo falla, el detalle queda en `test-results/` (con una foto de la página en ese momento).
