# Endogym

Endogym es un MVP full-stack para nutrición, seguimiento glucémico y entrenamiento adaptativo. Incluye una app Next.js, APIs HTTP, Firebase y adaptadores para Google AI. Sus estimaciones son educativas: no sustituyen diagnóstico, tratamiento ni seguimiento médico.

## Leer primero

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
4. [`docs/API.md`](docs/API.md)
5. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
6. [`docs/SECURITY.md`](docs/SECURITY.md)
7. [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md)
8. [`docs/ROADMAP.md`](docs/ROADMAP.md)

## Estados que usamos

- **Implementado en código**: existe una ruta o módulo revisable.
- **Verificado localmente**: pasó los checks locales.
- **Verificado end-to-end**: se probó contra servicios reales.
- **Bloqueado externamente**: requiere configuración o rotación fuera del repositorio.

No confundas estos estados. Que exista integración no implica que el proveedor esté operativo.

## Estado resumido

Última verificación: **1 de junio de 2026 (sesión tarde)**.

- El árbol fue recuperado de una resolución de conflictos incompleta.
- `npm run check:conflicts`, `npm run audit`, `npm run smoke`, `npm test` y `npm run build` pasan localmente.
- `npm audit` devuelve `0` vulnerabilidades tras fijar overrides transitivos seguros para `postcss` y `uuid`.
- La producción Vercel responde en `/` y `/api/health`.
- Firebase Authentication, la API key publica del cliente y Google OAuth para `endogym.vercel.app` se validaron con sondas reales.
- Firebase Admin y Firestore funcionan localmente y en producción con Firebase ID tokens reales.
- Las fotos de platos usan el bucket privado `endogym-vtety8-plates-eu` del proyecto Firebase/GCP; escritura y borrado fueron verificados.
- Gemini Developer API funciona en producción con una key restringida a `generativelanguage.googleapis.com`. La key expuesta previamente fue revocada y los servicios Vertex quedaron deshabilitados.
- `POST /api/analyze-plate` fue verificado end-to-end: guarda foto, obtiene inferencia Gemini real, persiste la comida y conserva fallback observable para fallos futuros.
- `POST /api/weekly-plan` genera coaching Gemini real con `gemini-2.5-flash`, presupuesto de latencia acotado y fallback heuristico observable.
- Las fotos caducan a los 30 días, el bucket no conserva copias recuperables tras borrado y las rutas IA tienen rate limiting persistente en Firestore.

- La interfaz de usuario fue rediseñada con menú hamburguesa lateral, dashboard con lenguaje accesible, atlas anatómico 3D con modelos clínicos `gymbro-front-crop.png` / `gymbro-back-crop.png` y vistas frontal/posterior corregidas, y biblioteca de ejercicios con tarjetas colapsables por categoría y modal de detalle. El rediseño está implementado en código; pendiente verificación local y redespliegue.

Consulta el detalle en [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md).

## Arquitectura elegida

Se mantiene la **Ruta A**:

- **Vercel**: frontend y Route Handlers Next.js.
- **Firebase Authentication**: identidad.
- **Firestore**: persistencia.
- **Firebase Storage / Cloud Storage**: fotos de platos en bucket privado del mismo proyecto.
- **Gemini Developer API**: inferencia. Vertex AI está deshabilitado por decisión de arquitectura.

## Ejecutar en local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Checks mínimos:

```bash
npm run check:conflicts
npm run audit
npm run smoke
npm test
npm run build
```

No guardes secretos reales en Git. `AUTH_DISABLED=true` solo está permitido en desarrollo local.
