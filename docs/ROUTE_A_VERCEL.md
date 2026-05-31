# Guía Detallada: Ruta A (Vercel + Backend Firebase)

Esta guía detalla la implementación y los pasos exactos para la **Ruta A** (despliegue de la aplicación Next.js y su API en Vercel, utilizando Firebase para la base de datos Firestore, almacenamiento en Firebase Storage y autenticación segura con Firebase Auth).

---

## Arquitectura de la Ruta A

El sistema está diseñado para ser totalmente autogestionado, modular y altamente escalable:

```
                      +-------------------+
                      |   Cliente (Web)   |
                      | Next.js / React 19|
                      +---------+---------+
                                |
                                | (HTTPS / JSON + Auth Token)
                                v
                      +-------------------+
                      |  Vercel Hosting  |
                      | Next.js Serverless|
                      +----+---------+----+
                           |         |
      (Consultas/Escritura)|         | (Llamadas IA)
                           v         v
                +---------------+  +---------------------+
                | Firebase Suite|  |     Google AI       |
                | - Auth        |  | (Gemini / Vertex AI)|
                | - Firestore   |  +---------------------+
                | - Storage     |
                +---------------+
```

- **Hosting & API Gateway**: Vercel ejecuta las páginas estáticas y los Route Handlers de Next.js como funciones serverless autocalibradas.
- **Persistencia**: Cloud Firestore se encarga de guardar colecciones de usuarios, perfiles, planes semanales, comidas consumidas y métricas de peso, glucemia y fatiga.
- **Storage**: Firebase Storage almacena las imágenes originales de las comidas para que la IA las pueda analizar.
- **Autenticación**: Firebase Auth maneja el inicio de sesión del usuario en el frontend y envía un token ID que se valida en el backend mediante `firebase-admin`.
- **Inteligencia Artificial**: El análisis de platos y las recomendaciones del Coach IA se gestionan mediante llamadas directas a la API de Gemini (o Vertex AI en Google Cloud).

---

## Configuración Completa de Variables de Entorno

Configura estas variables en el panel del proyecto de Vercel (**Settings** -> **Environment Variables**):

```bash
# Variables del Servidor (Firebase Admin & Gemini IA)
FIREBASE_PROJECT_ID="nombre-proyecto-firebase"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@xxxx.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQ..."
FIREBASE_STORAGE_BUCKET="nombre-proyecto-firebase.appspot.com"
GOOGLE_AI_BACKEND="gemini" # O "vertex" si se migra a Google Cloud Vertex AI
GEMINI_API_KEY="AIzaSy..." # Tu API Key real de Google AI Studio
GEMINI_MODEL="gemini-3-flash-preview"
GEMINI_MODEL_PLATE="gemini-3-flash-preview"
GEMINI_MODEL_COACH="gemini-3.1-pro-preview" # Modelo recomendado para Coach
GEMINI_FORCE_MOCK="false"
GEMINI_FALLBACK_TO_MOCK="true"
GEMINI_COACH_MAX_RETRIES="2"
GEMINI_COACH_RETRY_BASE_MS="350"
AUTH_DISABLED="false" # Cambiar a false para activar validación de token en API

# Variables Públicas de Frontend (Firebase Client)
NEXT_PUBLIC_APP_URL="https://endogym.vercel.app"
NEXT_PUBLIC_AUTH_DISABLED="false" # Cambiar a false para habilitar inicio de sesión en UI
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="nombre-proyecto-firebase.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="nombre-proyecto-firebase"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="nombre-proyecto-firebase.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="xxxxx"
NEXT_PUBLIC_FIREBASE_APP_ID="x:xxxxx:web:xxxxx"
```

> [!IMPORTANT]
> Al añadir `FIREBASE_PRIVATE_KEY` en Vercel, asegúrate de mantener los caracteres de escape `\n` para que el SDK de `firebase-admin` pueda interpretar la firma criptográfica correctamente.

---

## Comandos de Inicialización y Despliegue Manual

Si prefieres añadir las variables a través del CLI de Vercel en tu terminal, ejecuta los siguientes comandos de forma secuencial:

```bash
# 1. Iniciar sesión y vincular el proyecto
npx vercel login
npx vercel link --project Endogym

# 2. Agregar variables de entorno para producción
npx vercel env add FIREBASE_PROJECT_ID production
npx vercel env add FIREBASE_CLIENT_EMAIL production
npx vercel env add FIREBASE_PRIVATE_KEY production
npx vercel env add FIREBASE_STORAGE_BUCKET production
npx vercel env add GOOGLE_AI_BACKEND production
npx vercel env add GEMINI_API_KEY production
npx vercel env add GEMINI_MODEL production
npx vercel env add GEMINI_MODEL_PLATE production
npx vercel env add GEMINI_MODEL_COACH production
npx vercel env add GEMINI_FORCE_MOCK production
npx vercel env add GEMINI_FALLBACK_TO_MOCK production
npx vercel env add GEMINI_COACH_MAX_RETRIES production
npx vercel env add GEMINI_COACH_RETRY_BASE_MS production
npx vercel env add AUTH_DISABLED production

npx vercel env add NEXT_PUBLIC_APP_URL production
npx vercel env add NEXT_PUBLIC_AUTH_DISABLED production
npx vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production
npx vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production
npx vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production
npx vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production
npx vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production
npx vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production

# 3. Lanzar el despliegue a producción
npx vercel --prod
```

---

## Checklist de Verificación Post-Despliegue

Una vez completado el despliegue en Vercel, realiza los siguientes smoke tests:

1. **Estado de Salud de la API**:
   - Accede a `https://tu-app.vercel.app/api/health`. Debe responder en menos de 100ms con `{"status":"ok", "traceId": "..."}`.
2. **Autenticación en Frontend**:
   - Intenta registrarte/iniciar sesión. La UI debe cambiar al panel del Dashboard y guardar el token en la sesión.
3. **Flujo de Alimentación & Análisis**:
   - Sube una foto de un plato. Verifica que la imagen se almacene en Firebase Storage y que se obtenga el desglose nutricional (calorías, macros, carga glucémica) e impacto insulínico de forma instantánea.
4. **Flujo del Coach IA / Plan Semanal**:
   - Configura un perfil con alergias y nivel de fatiga. Genera el plan semanal y entra en el tab "Plan de hoy". El **Briefing de Sesión del Coach IA** debe cargarse explicando detalladamente la justificación de los ejercicios y la directriz ACSM del día.
5. **Observabilidad en la Consola**:
   - Abre la pestaña de Logs en Vercel y comprueba que todas las peticiones tengan su `traceId` correspondiente y registren latencias en milisegundos de manera limpia.
