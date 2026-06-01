# Estado real del proyecto Endogym

Ultima actualizacion: **1 de junio de 2026**.

## Resumen ejecutivo

Endogym es un MVP tecnico funcional con despliegue Vercel activo. La aplicacion compila, tiene tests automatizados y sus integraciones principales fueron verificadas end-to-end. El hardening tecnico inmediato ya esta aplicado: audit limpio, validacion MIME por firma, rate limiting persistente y retencion corta de fotos. El mapa anatómico interactivo ahora utiliza los modelos clínicos 3D realistas en escala de grises con resaltados azul-magenta eléctrico. Antes de usuarios reales todavia necesita revision legal humana y una decision de plan de observabilidad.

## Recuperacion realizada

El 31 de mayo de 2026 se corrigio una edicion local que habia reinsertado marcadores Git en 22 archivos. Se agrego una barrera local y de CI para impedir que vuelva a entrar una resolucion incompleta. El 1 de junio de 2026 se resolvió el duplicado del mapa muscular interactivo para mostrarse de forma exclusiva en la columna de activación del día, y se rediseñó visualmente con la nueva paleta premium.

## Matriz de estado

| Area | Estado | Evidencia |
|---|---|---|
| Atlas anatómico 3D | Verificado localmente | Modelos clínicos gray 3D alineados matemáticamente con capas vectoriales, eliminando duplicados y aplicando paleta azul-magenta brillante. |
| App Next.js | Verificada localmente | `npm run build` con Next `16.2.6`. |
| Conflictos Git | Verificado | `npm run check:conflicts`. |
| Dependencias | Verificado | `npm run audit`: 0 vulnerabilidades. |
| Tests core y APIs | Verificado localmente | `npm run smoke`; `npm test`: 61 tests. |
| Vercel | Verificado end-to-end | `/` y `/api/health` responden HTTP `200`. |
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
