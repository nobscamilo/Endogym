# Estado real del proyecto Endogym

Ultima actualizacion: **1 de junio de 2026 (sesión tarde)**.

## Resumen ejecutivo

Endogym es un MVP tecnico funcional con despliegue Vercel activo. La aplicacion compila, tiene tests automatizados y sus integraciones principales fueron verificadas end-to-end. El hardening tecnico inmediato ya esta aplicado: audit limpio, validacion MIME por firma, rate limiting persistente y retencion corta de fotos. La interfaz de usuario fue rediseñada con menú hamburguesa lateral, dashboard con lenguaje accesible para el usuario final, atlas anatómico 3D con modelos clínicos realistas corregidos y sistema de biblioteca de ejercicios premium completamente rediseñado. Antes de usuarios reales todavia necesita revision legal humana y una decision de plan de observabilidad.

## Recuperacion realizada

El 31 de mayo de 2026 se corrigio una edicion local que habia reinsertado marcadores Git en 22 archivos. Se agrego una barrera local y de CI para impedir que vuelva a entrar una resolucion incompleta.

El 1 de junio de 2026 (sesión mañana) se resolvió el duplicado del mapa muscular interactivo y se rediseñó visualmente con la nueva paleta premium azul-magenta eléctrico sobre modelos clínicos `gymbro-front-crop.png` / `gymbro-back-crop.png`.

El 1 de junio de 2026 (sesión tarde) se aplicaron los siguientes cambios de interfaz:
- Menú lateral convertido a hamburguesa desplegable para maximizar el área de contenido.
- Dashboard con lenguaje accesible para el usuario final: eliminación de jargón técnico (RPE, readiness, gate, etc.) y traducción a texto motivacional claro.
- Atlas anatómico: vistas frontal/posterior corregidas (la imagen frontal muestra la vista delantera y viceversa), posicionamiento de superposiciones musculares ajustado a la geometría real de las imágenes, colores primarios azul-magenta intenso y secundarios azul-magenta tenue sin desfasamientos.
- Tab "Hoy": integración del diseño "Entrenamiento del día" de Stitch con mapa muscular exclusivo en columna derecha.
- Biblioteca: rediseño hacia tarjetas colapsables agrupadas por categoría con modal de detalle por ejercicio (verificado localmente y desplegado a producción).

## Matriz de estado

| Area | Estado | Evidencia |
|---|---|---|
| Atlas anatómico 3D | Verificado localmente y en producción | Modelos clínicos `gymbro-front-crop.png` / `gymbro-back-crop.png` con superposiciones CSS azul-magenta. Vistas frontal/posterior corregidas, colores primarios intensos y secundarios tenues, sin desfasamiento. Verificado tras el último redespliegue. |
| App Next.js | Verificada en producción | Compilada y desplegada en Vercel exitosamente con Next `16.2.6` y Turbopack. |
| UI dashboard | Verificado localmente y en producción | Menú hamburguesa lateral, bento cards con lenguaje de usuario, tab "Hoy" con mapa muscular en columna derecha. Verificado tras el último redespliegue. |
| Biblioteca de ejercicios | Verificado localmente y en producción | Rediseño hacia tarjetas por categoría + modal de detalle (músculo, técnica, progresiones, video) completamente funcional y verificado. |
| Conflictos Git | Verificado | `npm run check:conflicts` con 0 marcadores de conflicto. |
| Dependencias | Verificado | `npm run audit`: 0 vulnerabilidades. |
| Tests core y APIs | Verificado localmente | `npm run smoke`; `npm test`: 61 tests exitosos. |
| Vercel | Verificado end-to-end | Aliasing activo, producción lista en `https://endogym.vercel.app`. |
| Firebase Auth cliente | Verificado end-to-end | Usuario temporal, custom token e ID token; Google OAuth para `endogym.vercel.app` devuelve URI de autenticacion. |
| Firebase Admin local | Verificado | La private key local parsea correctamente. |
| Firestore local | Verificado end-to-end | Escritura, lectura y borrado temporal. |
| Firebase Admin produccion | Verificado end-to-end | `FIREBASE_PRIVATE_KEY` corregida en Vercel; `/api/profile` autenticado responde `200`. |
| APIs autenticadas produccion | Verificado end-to-end | `/api/profile`, `/api/meals` y `/api/analyze-plate` probados con usuario temporal eliminado. |
| Firebase Storage / Cloud Storage | Verificado end-to-end | Bucket privado `endogym-vtety8-plates-eu`, acceso uniforme y prevencion publica; upload y borrado confirmados. |
| Gemini local | No asumido | La key local legacy estaba expirada y no se reutilizo. Produccion usa secreto sensible separado. |
| Gemini produccion | Verificado end-to-end | Key rotada y restringida a `generativelanguage.googleapis.com`; servicios Vertex deshabilitados; plato analizado con `source=gemini`, `mode=live`, sin fallback. |
| Analisis de plato | Verificado end-to-end | HTTP `201`, `traceId`, foto guardada, comida persistida y limpieza posterior confirmada. |
| Coaching semanal IA | Verificado end-to-end | HTTP `201`, `coachSource=gemini`, `gemini-2.5-flash`, un intento y sin fallback. |
| Validacion MIME | Verificado end-to-end | Bytes falsos declarados como JPEG responden `400` sin guardar archivo ni comida. |
| Rate limiting | Verificado end-to-end | Firestore persistente; plato responde `429` tras agotar 10/600s y plan semanal tras 4/3600s. |
| Retencion Storage | Configurado externamente | `plates/` caduca a 30 dias; soft delete deshabilitado. |
| Observabilidad | Parcialmente operativa | Logs estructurados disponibles; Alerts y Log Drains bloqueados por plan Vercel `hobby`. |

## Deployment verificado

- Proyecto Vercel: `endogym`.
- Deployment Production inspeccionado: `dpl_GFtrsxf5mxEgrPhXUHAeJr74BSKF`, estado `Ready`.
- Alias público: `https://endogym.vercel.app`.
- El alias público responde directamente, sin redirecciones.
- `/api/meals` sin token responde HTTP `401`.
- La key pública Firebase permite obtener ID tokens.
- Firebase Auth autoriza `endogym.vercel.app` para Google OAuth; la sonda publica obtiene URI de autenticacion con HTTP `200`.
- `/api/profile` y `/api/meals` autenticados responden `200`.
- `/api/analyze-plate` autenticado responde `201`, guarda la foto y usa Gemini live sin fallback.
- `/api/weekly-plan` autenticado responde `201` y genera coaching Gemini live sin fallback.
- Runtime Logs registra `plate_analysis_result` con modelo resuelto, estado de fallback y persistencia Storage.
- Runtime Logs registra `weekly_plan_coach_result` live con `gemini-2.5-flash`, un intento y duracion aproximada de 10 segundos.
- `npm run e2e:production` valida tambien Google OAuth, coaching semanal live, MIME falso y ambos rate limits con limpieza automatica.
- El deployment manual sirve el working tree actualizado. Vercel conserva `e92cc9b` como metadato de Source hasta que los cambios locales se commiteen y suban a GitHub.
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
- Vercel esta en plan `hobby`; alertas automaticas y Log Drains requieren cambio de plan o proveedor externo.
- Conviene añadir una variante E2E con emuladores para CI; la sonda controlada de produccion ya existe.
- La UI rediseñada (menú hamburguesa, dashboard usuario, atlas anatómico, biblioteca) requiere verificación local completa (`npm run smoke`, `npm test`, `npm run build`) y redeploy a producción.
- La biblioteca muestra iconos de Material Symbols solo si el font se carga en el HTML head; verificar que no haya regresión de iconos en producción.
