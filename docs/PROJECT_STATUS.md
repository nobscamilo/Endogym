# Estado real del proyecto Endogym

Ultima actualizacion: **3 de junio de 2026 (Integración de Strava y sincronización de GitHub)**.

## Resumen ejecutivo

Endogym es un MVP tecnico funcional con despliegue Vercel activo. La aplicacion compila, tiene tests automatizados y sus integraciones principales fueron verificadas end-to-end. El 3 de junio de 2026 se completaron dos hitos principales: la integración de una base de datos médica RAG (con 213 capítulos/libros parseados de PDFs a Firestore) y la integración completa de Strava (OAuth y sincronización bajo demanda) para incorporar automáticamente entrenamientos externos al cálculo de volumen y fatiga de la IA. El despliegue de producción se actualizó automáticamente mediante integración de GitHub a la última versión.

## Recuperacion realizada

El 31 de mayo de 2026 se corrigio una edicion local que habia reinsertado marcadores Git en 22 archivos. Se agrego una barrera local y de CI para impedir que vuelva a entrar una resolucion incompleta.

El 1 de junio de 2026 (sesión mañana) se resolvió el duplicado del mapa muscular interactivo y se rediseñó visualmente con la nueva paleta premium azul-magenta eléctrico sobre modelos clínicos `gymbro-front-crop.png` / `gymbro-back-crop.png`.

El 1 de junio de 2026 (sesión tarde/noche) se aplicaron los siguientes cambios de interfaz:
- Menú lateral convertido a hamburguesa desplegable para maximizar el área de contenido.
- Dashboard con lenguaje accesible para el usuario final: eliminación de jargón técnico (RPE, readiness, gate, etc.) y traducción a texto motivacional claro.
- Atlas anatómico: vistas frontal/posterior corregidas, posicionamiento de superposiciones musculares ajustado, colores primarios azul-magenta intenso y secundarios azul-magenta tenue sin desfasamientos.
- Tab "Hoy": integración del diseño "Entrenamiento del día" de Stitch con mapa muscular exclusivo en columna derecha, reordenando el Briefing de Sesión del Coach AI al final de la página e incrementando el breakpoint del spotlight a `1400px` para evitar solapamientos.
- Tab "Hoy" (check-in seguro): persiste síntomas booleanos, rehidrata estado por fecha y usa upsert Firestore `daily-YYYY-MM-DD`. Si hay síntomas de alarma, activa gate clínico conservador limitando RPE a `4`.
- Biblioteca: rediseño hacia tarjetas colapsables por categoría con modal de detalle.
- Demostraciones técnicas: embeds oEmbed verificados y fallbacks animados SVG locales.
- Landing pública: copy verificable, assets propios, favicon y recuperación Firebase.
- Hardening HTTP local: CSP sin `unsafe-eval`, HSTS, `nosniff`, referrer/permissions policies y framing denegado.

El 3 de junio de 2026 se completaron las siguientes mejoras en la base de datos de conocimiento y personalización clínica:
- **Parseo de PDFs de Libros Médicos:** Se implementó `scripts/parse_pdf.py` para escanear y extraer de forma estructurada páginas y textos de capítulos individuales (como *Braddom's Physical Medicine and Rehabilitation* y *DeLee, Drez, & Miller's Orthopaedic Sports Medicine*), guardándolos en subcarpetas JSON en `docs/guidelines-json/`.
- **Seeding de Firestore:** Se diseñó `scripts/upload_guidelines.js` que subió automáticamente 213 capítulos parseados a la colección global `guidelines` en la base de datos Firestore de producción.
- **RAG de Directrices Clínicas:** Se implementó `src/services/guidelinesRetriever.js` para extraer en tiempo real los fragmentos más relevantes de la literatura médica basándose en las condiciones de salud y objetivos del usuario. Estos fragmentos se inyectan dinámicamente como contexto de alta prioridad en el prompt del Coach IA.
- **Optimización de Despliegue:** Se creó `.vercelignore` para evitar que los archivos PDF originales (681MB) se carguen a Vercel, limitando la subida a sólo 8.1MB y logrando compilaciones instantáneas.
- **Volumen de Entrenamiento Dinámico:** Se implementó lógica en [exerciseLibrary.js](file:///Users/camilosar/Documents/antigravity/fearless-davinci/src/core/exerciseLibrary.js) para calcular el número de ejercicios por sesión de forma dinámica en base a la intensidad seleccionada (`desiredIntensity` de preparticipación) y el tipo de objetivo del usuario (ej. objetivos de alto volumen como pérdida de peso, recomposición, hipertrofia o fuerza escalan a 6 o 7 ejercicios si la intensidad es vigorosa, mientras que un gate clínico de alto riesgo 'stop' capa a un máximo de 4 ejercicios por seguridad). El slice de ejercicios enviados al Coach IA en [exerciseCoachPrompt.js](file:///Users/camilosar/Documents/antigravity/fearless-davinci/src/services/exerciseCoachPrompt.js) fue incrementado de 6 a 10.

## Matriz de estado

| Area | Estado | Evidencia |
|---|---|---|
| Base de Datos de Directrices Médicas (RAG) | **Verificado localmente y en producción** | `guidelinesRetriever.js` realiza coincidencia semántica de palabras clave sobre metadatos y recupera dinámicamente los capítulos correspondientes de Firestore. Verificado mediante tests en `guidelines-retriever.test.js`. |
| Parseo y Seeding de Libros | **Exitoso** | 213 capítulos de libros de referencia en PDF procesados a JSON y subidos a la colección `guidelines` de Firestore usando la clave de servicio de producción. |
| Integración con Strava | **Verificado localmente y desplegado** | Flujo completo de OAuth, sincronización bajo demanda (últimos 14 días) con ID determinista de prevención de duplicados, y desconexión segura. Verificado mediante tests en `strava-integration.test.js`. |
| Demostraciones interactivas de técnica | Verificado localmente | `ExerciseVisualPlayer` usa 14 embeds oEmbed verificados y 4 fallbacks SVG; los 37 IDs no resolubles fueron retirados. |
| Atlas anatómico 3D | Verificado localmente y en producción | Modelos clínicos con superposiciones CSS azul-magenta. Vistas frontal/posterior corregidas, colores primarios intensos y secundarios tenues, sin desfasamiento. |
| App Next.js | Verificada en producción | Compilada y desplegada en Vercel exitosamente con Next `16.2.6` y Turbopack. |
| UI dashboard | Rediseño base verificado; check-in nuevo verificado por tests | Menú hamburguesa, lenguaje de usuario y mapa muscular fueron verificados tras el redespliegue anterior. |
| Landing | Verificada localmente y en producción | Playwright contra `next start` y `https://endogym.vercel.app`: copy verificable, assets propios, recuperación de contraseña visible, favicon y consola sin errores. |
| Cabeceras HTTP | Verificadas localmente y en producción | Vercel sirve CSP sin `unsafe-eval`, HSTS, `nosniff`, referrer policy, permissions policy y framing denegado; no expone `X-Powered-By`. |
| Conflictos Git | Verificado | `npm run check:conflicts` con 0 marcadores de conflicto. |
| Dependencias | Verificado | `npm run audit`: 0 vulnerabilidades. |
| Tests core y APIs | Verificado localmente | `npm run smoke`; `npm test`: 83 tests exitosos (incluyendo tests RAG y de integración con Strava). |
| Vercel | Verificado públicamente | Alias `https://endogym.vercel.app` operativo y actualizado automáticamente mediante push a GitHub. |
| Firebase Auth cliente | Verificado end-to-end | Usuario temporal, custom token e ID token; Google OAuth para `endogym.vercel.app` devuelve URI de autenticacion. |
| Firebase Admin produccion | Verificado end-to-end | `FIREBASE_PRIVATE_KEY` corregida en Vercel; `/api/profile` y carga de guidelines a Firestore operativas. |
| APIs autenticadas produccion | Verificado end-to-end | `/api/profile`, `/api/meals` y `/api/analyze-plate` probados con usuario temporal eliminado. |
| Firebase Storage / Cloud Storage | Verificado end-to-end | Bucket privado `endogym-vtety8-plates-eu` con retención de fotos a 30 días y prevención pública. |
| Gemini produccion | Verificado end-to-end | Key rotada y restringida; Coach IA semanal genera ajustes en tiempo real con inyección de RAG médica sin fallbacks. |

## Deployment verificado

- Proyecto Vercel: `endogym`.
- Deployment Production inspeccionado el 3 de junio de 2026 tras redespliegue manual: `dpl_9H6Y1zwHA977rPH7RshiSoC2iWm8`, estado `Ready`.
- Alias público: `https://endogym.vercel.app`.
- El alias público responde directamente, sin redirecciones.
- `/api/meals` sin token responde HTTP `401`.
- La sonda pública del 2 de junio confirmó `/` `200`, `/api/health` `200` y `/api/meals` sin token `401`.
- `npm run e2e:production` pasó tras el despliegue: Google OAuth, Auth, Firestore, Storage, Gemini live, firma MIME, rate limits y limpieza del usuario temporal.
- La key pública Firebase permite obtener ID tokens.
- Firebase Auth autoriza `endogym.vercel.app` para Google OAuth; la sonda publica obtiene URI de autenticacion con HTTP `200`.
- `/api/profile` y `/api/meals` autenticados responden `200`.
- `/api/analyze-plate` autenticado responde `201`, guarda la foto y usa Gemini live sin fallback.
- `/api/weekly-plan` autenticado responde `201` y genera coaching Gemini live sin fallback.
- Runtime Logs registra `plate_analysis_result` con modelo resuelto, estado de fallback y persistencia Storage.
- Runtime Logs registra `weekly_plan_coach_result` live con `gemini-2.5-flash`, un intento y duracion aproximada de 10 segundos.
- `npm run e2e:production` valida tambien Google OAuth, coaching semanal live, MIME falso y ambos rate limits con limpieza automatica.
- El deployment manual inspeccionado sirve el working tree local actualizado. Vercel/GitHub siguen sin ser reproducibles desde remoto hasta que los cambios se commiteen y suban.
- Los checks GitHub `build (20.x)` y `build (22.x)` de `e92cc9b` estan completados con `success`; un indicador amarillo persistente en la UI de Vercel no representa el estado del runtime.

## Seguridad cerrada el 31 de mayo de 2026

1. Se reemplazo `FIREBASE_PRIVATE_KEY` en Vercel por el PEM parseable.
2. Se revoco la API key Gemini expuesta y se creo una nueva key restringida.
3. Se auditaron tokens Vercel y se revocaron cinco sesiones web; se conserva la sesion CLI actual.
4. Se eliminaron variables Vercel Flags no utilizadas.
5. Se provisiono y verifico el bucket privado `endogym-vtety8-plates-eu`.
6. Se deshabilito `firebasevertexai.googleapis.com`; `aiplatform.googleapis.com` tampoco esta habilitado.
7. Se anadio `endogym.vercel.app` a los dominios autorizados de Firebase Auth y se retiraron dos URLs efimeras antiguas.
8. Se reemplazo un valor opaco incorrecto en `GEMINI_MODEL_COACH` por `gemini-2.5-flash`; el transporte rechaza identificadores invalidos antes de llamar al proveedor.
9. Se acoto la llamada del coach a 10 segundos por intento, un reintento y `thinkingBudget=0` para conservar margen antes del timeout de Vercel.
10. Se limpio el contador semanal del usuario afectado por los fallos previos para permitir reintento inmediato.

## Deuda conocida

- Falta revision legal humana por mercado para privacidad, consentimiento y disclaimer medico.
- Vercel esta en plan `hobby`; Vercel Pro no es viable por ahora. Alertas automáticas y Log Drains quedan bloqueados salvo proveedor externo/gratuito alternativo.
- Conviene añadir una variante E2E con emuladores para CI; la sonda controlada de produccion ya existe.
- Mantener verificación periódica manual mientras no haya alertas automáticas.
- Sincronizar GitHub con producción: **Completado el 3 de junio de 2026** (repositorio local y remoto de GitHub completamente alineados y al día).
- Diseñar un flujo explícito de reevaluación o clearance para levantar el gate diario de síntomas; hoy la señal conservadora desaparece al salir de la ventana reciente.
- La biblioteca muestra iconos de Material Symbols solo si el font se carga en el HTML head; conservar una comprobación visual tras despliegues.
