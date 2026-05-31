# Seguridad y manejo de secretos

## Regla principal

No guardes secretos reales en Git, documentacion, screenshots, logs ni payloads de ejemplo.

## Incidentes cerrados el 31 de mayo de 2026

1. La API key Gemini expuesta fue revocada. Produccion usa una key nueva restringida a `generativelanguage.googleapis.com` y guardada como secreto sensible en Vercel.
2. `FIREBASE_PRIVATE_KEY` fue sustituida por un PEM parseable y verificada en produccion.
3. Se auditaron tokens Vercel y se revocaron cinco sesiones web listadas; se conserva la sesion CLI actual.
4. Se eliminaron de Vercel y `.env.local` las variables auxiliares `FLAGS` y `FLAGS_SECRET`, no utilizadas por Endogym.
5. El token OIDC temporal descargado localmente fue eliminado de `.env.local`.
6. Se deshabilito `firebasevertexai.googleapis.com`; `aiplatform.googleapis.com` tampoco esta habilitado.

No copies secretos a documentacion, codigo, screenshots ni salida de terminal. Al crear o borrar API keys con `gcloud`, redirige la salida: la CLI puede incluir `keyString`.

## Autenticacion

- Produccion usa Firebase ID tokens.
- `AUTH_DISABLED=true` solo se permite localmente.
- `x-dev-user-id` no es una credencial.
- Google OAuth permite el dominio canonico `endogym.vercel.app`; no acumules URLs efimeras de deployments.
- El 31 de mayo de 2026 se verifico que `/api/meals` sin token devuelve `401`.

## Storage

Las fotos usan `endogym-vtety8-plates-eu`, bucket privado del mismo proyecto Firebase/GCP con acceso uniforme y prevencion publica obligatoria. Upload y borrado fueron verificados.

- La API valida tamaño, base64 y firma binaria JPEG, PNG o WEBP antes de almacenar o invocar Gemini.
- [`../infra/storage-lifecycle.json`](../infra/storage-lifecycle.json) elimina fotos `plates/` al superar 30 dias.
- Soft delete esta deshabilitado: borrar cuenta no conserva copias recuperables en el bucket operativo.
- La eliminacion de cuenta borra archivos, datos y contadores `rateLimits`.

## Rate limiting

- `POST /api/analyze-plate`: 10 solicitudes cada 600 segundos por usuario.
- `POST /api/weekly-plan`: 4 solicitudes cada 3600 segundos por usuario.
- Los contadores se guardan en Firestore para que funcionen entre instancias Vercel.
- HTTP `429` incluye `Retry-After`.

## Datos sensibles

Antes de usuarios reales define:

- consentimiento y privacidad;
- minimizacion de datos;
- retencion, exportacion y borrado;
- auditoria de accesos;
- disclaimer medico visible;
- revision legal por mercado.

## Configuracion Gemini

- Usa identificadores estables `gemini-*`; produccion fija `gemini-2.5-flash`.
- El transporte rechaza nombres de modelo invalidos antes de formar el endpoint.
- Los logs sustituyen identificadores invalidos por `<invalid-model>` para no persistir valores opacos.
- El coach limita timeout y reintentos para responder con fallback antes del limite de Vercel.

## Dependencias

`npm run audit` bloquea vulnerabilidades moderadas, altas o criticas en CI. El 31 de mayo de 2026 devuelve `0` vulnerabilidades. Los overrides de `postcss` y `uuid` corrigen dependencias transitivas sin aplicar los downgrades rompientes propuestos por npm.
