# Endogym

Endogym es un MVP full-stack para nutrición, seguimiento glucémico y entrenamiento adaptativo. Incluye una app Next.js, APIs HTTP, Firebase y adaptadores para Google AI. Sus estimaciones son educativas: no sustituyen diagnóstico, tratamiento ni seguimiento médico.

> **Nota de marca (3 de junio de 2026): nuevo nombre interno = "Ignios".**
> Se decidió renombrar el producto de "Endogym" a **Ignios** (raíz *ignite/ignis*, metáfora de combustión metabólica; legible en inglés y español). El cambio es **solo interno por ahora**: NO es un rebrand global, falta el logo, y el código, el dominio de producción (`endogym.vercel.app`), buckets, proyectos Firebase/GCP y configuración siguen usando "endogym". No hagas find-replace masivo de "Endogym" ni renombres recursos de infraestructura sin decisión explícita del usuario. Dominios candidatos disponibles a la fecha: `ignios.app` ($9.99/año), `ignios.io`, `ignios.ai`. Verificación de marca: búsqueda web sin conflicto activo en salud/fitness/software; único homónimo "Ignios Ltd" (semiconductores, Oxford, cerrado). Pendiente clearance formal en USPTO/EUIPO antes de registrar o lanzar globalmente (vigilar cercanía con IGNIO/Tata e IGNIS). Fallback descartado si Ignios fallara: "Emberfit".

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

Última verificación local documentada: **15 de junio de 2026** (prescripción desde Perfil + cambio de grupo muscular en Entreno, `251` tests y build OK). Último deploy público documentado: **12 de junio de 2026**, `dpl_AGJGm6iWwmRP3YLrd8N9pgk8HoQq` con alias manual a `endogym.vercel.app` y bundle `08bbcab4a0`. Última sonda integral `e2e:production`: **10 de junio de 2026**; las sondas básicas más recientes verificaron `/`, `/api/health` y rechazos `401` esperados.

- El árbol fue recuperado de una resolución de conflictos incompleta.
- `npm install`, `npm run check:conflicts`, `npm run audit`, `npm run smoke`, `npm test` y `npm run build` pasan localmente según la última verificación completa registrada. La suite actual documentada tiene `235` tests.
- `playwright` está instalado como devDependency y Chromium de Playwright está disponible para verificación visual local.
- `npm audit` devuelve `0` vulnerabilidades tras fijar overrides transitivos seguros para `postcss` y `uuid`.
- La producción Vercel responde en `/` y `/api/health`; `/api/meals` y `/api/coach-chat` sin token responden `401`. Producción más reciente documentada: `dpl_AGJGm6iWwmRP3YLrd8N9pgk8HoQq`.
- Firebase Authentication, la API key publica del cliente y Google OAuth para `endogym.vercel.app` se validaron con sondas reales.
- Firebase Admin y Firestore funcionan localmente y en producción con Firebase ID tokens reales.
- Las fotos de platos usan el bucket privado `endogym-vtety8-plates-eu` del proyecto Firebase/GCP; escritura y borrado fueron verificados.
- Gemini Developer API funciona en producción con una key restringida a `generativelanguage.googleapis.com`. La key expuesta previamente fue revocada y los servicios Vertex quedaron deshabilitados.
- `POST /api/analyze-plate` fue verificado end-to-end: guarda foto, obtiene inferencia Gemini real, persiste la comida y conserva fallback observable para fallos futuros.
- `POST /api/weekly-plan` genera coaching Gemini real con `gemini-2.5-flash`, presupuesto de latencia acotado y fallback heuristico observable.
- `POST /api/coach-chat` usa Gemini con contexto real del usuario y rate limiting persistente (`coach-chat`, 20 preguntas/h por defecto).
- El coach tiene persona única server-side, detector determinista de red flags sin Gemini/rate limit, RAG por pregunta, memoria conversacional acotada, digest nutricional/recuperación 7d y cierre del loop entre recomendaciones y evolución real.
- La prescripción de entrenamiento usa bloque estable de 21 días con overlay adaptativo, DAPRE por desempeño real, objetivos SMART medibles, calentamiento/vuelta a la calma dinámicos y restricciones de comorbilidad en la selección de ejercicios.
- Perfil muestra objetivos y disponibilidad como decisiones jerárquicas (objetivo, meta, modalidad/equipo, carrera y resumen microciclo/mesociclo), con `Flexible` en vez de `Mixto`; el chat móvil del coach se monta como modal a pantalla completa con input visible.
- La prescripción desde Perfil ahora guarda `trainingExperience` (`novice`/`intermediate`/`advanced`), modula volumen/series/descanso de fuerza y, al reducir `daysPerWeek`, preserva sesiones clave del microciclo (por ejemplo tirada larga + calidad + fuerza en `Correr + gym` con carrera) en vez de conservar simplemente los primeros días del calendario.
- Entreno permite cambiar el grupo muscular de la sesión de fuerza/mixta del día (`upper`/`push`/`pull`/`lower`/`full_body`) sin regenerar el bloque: el servidor reconstruye la sesión y bloquea cambios que repitan la familia muscular de días adyacentes.
- Nutrición usa calendario local de la app (`Europe/Madrid` por defecto) para seleccionar el día actual, calcular la semana cacheada y agrupar comidas de "hoy"; esto evita que después de medianoche siga mostrando el día UTC anterior.
- `POST /api/studio-nutrition` genera semana completa con Gemini, cachea por semana, valida kcal/proteína por día antes de guardar planes completos e invalida cache si cambia la huella del plan de entrenamiento.
- La raíz `/` entrega el Firebase ID token al iframe del Studio por `postMessage` de mismo origen para evitar que móvil/iframe muestre el entreno demo cuando la restauración interna de Firebase Auth se retrasa.
- Las cargas de ejercicios registradas conservan `exercise.id`, de modo que la progresión por `liftHistory` puede enlazar historial y catálogo por ID estable. Para datos legacy sin ID existe fallback por nombre normalizado.
- Los bloques activos de 21 días conservan estabilidad, pero exponen un overlay adaptativo diario para reflejar fatiga, FC o check-ins recientes sin regenerar todo el bloque.
- Las fotos caducan a los 30 días, el bucket no conserva copias recuperables tras borrado y las rutas IA tienen rate limiting persistente en Firestore.

- La interfaz de usuario fue rediseñada con menú hamburguesa lateral, dashboard con lenguaje accesible, atlas anatómico 3D con modelos clínicos `gymbro-front-crop.png` / `gymbro-back-crop.png` y vistas frontal/posterior corregidas, y biblioteca de ejercicios con tarjetas colapsables por categoría y modal de detalle.
- El cierre local del 2 de junio retiró claims no sustentados de la landing, sustituyó recursos remotos por assets propios, añadió recuperación de contraseña y conservó solo 14 embeds de YouTube verificados con fallback SVG para el resto.
- El check-in diario quedó estructurado e idempotente por fecha: rehidrata estado, no inventa ceros al omitir encuesta y bloquea alta intensidad en el siguiente plan si hay síntomas de alarma.
- Se añadieron CSP, HSTS, `nosniff`, política de referrer, permisos y framing; `withTrace()` separa rechazos auth esperados de fallos operativos. Las cabeceras están verificadas en producción.
- `npm run e2e:production` pasó tras el despliegue con Gemini live, Storage, rate limits y limpieza del usuario temporal.

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
