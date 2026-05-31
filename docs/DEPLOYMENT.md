# Guía de Despliegue en Vercel (Proyecto: Endogym)

## Estado y Diagnóstico de Despliegue

El proyecto está configurado para un flujo de **Integración Continua (CI/CD)** automático a través de GitHub. Cada vez que se realiza un push a la rama `main` de GitHub, Vercel compila e implementa la aplicación automáticamente.

Si necesitas desplegar o vincular de forma manual utilizando el CLI de Vercel, sigue las instrucciones a continuación.

---

## Pasos para Despliegue Manual con Vercel CLI

### 1. Autenticar el CLI de Vercel
Inicia sesión en tu cuenta de Vercel desde la terminal:
```bash
npx vercel login
```

### 2. Vincular el Proyecto Local
Vincula este repositorio local al proyecto en Vercel con el nombre **Endogym**:
```bash
npx vercel link --project Endogym
```

### 3. Configurar Variables de Entorno en el Panel de Vercel
Es **crítico** configurar las siguientes variables de entorno en el panel de Vercel (Dashboard -> Settings -> Environment Variables) para que la API y la UI funcionen en producción. **No las incluyas en tu código ni en commits por razones de seguridad.**

#### Variables del Servidor (Firebase Admin & Gemini IA)
| Variable | Descripción | Valor Recomendado |
|---|---|---|
| `FIREBASE_PROJECT_ID` | ID de tu proyecto Firebase | Obtenido de Firebase Console |
| `FIREBASE_CLIENT_EMAIL` | Email de la cuenta de servicio | Obtenido del JSON de credenciales |
| `FIREBASE_PRIVATE_KEY` | Clave privada de la cuenta de servicio | Asegura mantener los saltos de línea `\n` |
| `FIREBASE_STORAGE_BUCKET` | Nombre del bucket de Firebase Storage | `[id-proyecto].appspot.com` |
| `GOOGLE_AI_BACKEND` | Selector del motor de inteligencia artificial | `gemini` o `vertex` |
| `GEMINI_API_KEY` | API Key de Google AI Studio | Tu API Key real de Gemini |
| `GEMINI_MODEL` | Modelo general para fallbacks | `gemini-3-flash-preview` |
| `GEMINI_MODEL_PLATE` | Modelo para análisis multimodal de comidas | `gemini-3-flash-preview` |
| `GEMINI_MODEL_COACH` | Modelo para el Coach IA interactivo | `gemini-3.1-pro-preview` |
| `GEMINI_FORCE_MOCK` | Forzar simulación de IA (fines de prueba) | `false` |
| `GEMINI_FALLBACK_TO_MOCK`| Permitir fallback heurístico si falla la IA | `true` |

#### Variables Públicas de Frontend (Firebase Client)
| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL de producción de la app en Vercel (ej: `https://endogym.vercel.app`) |
| `NEXT_PUBLIC_AUTH_DISABLED` | Habilitar/deshabilitar login real en UI (`false` para producción con login real) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | API Key pública del cliente Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Dominio de Firebase Auth para redirección |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ID del proyecto para inicializar Firebase en cliente |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`| Bucket público de almacenamiento |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`| Sender ID para notificaciones (opcional) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ID de la App Web de Firebase |

### 4. Lanzar Despliegue en Entorno de Desarrollo (Preview)
```bash
npx vercel
```

### 5. Lanzar Despliegue en Entorno de Producción
```bash
npx vercel --prod
```

---

## Recomendaciones Críticas de Producción

1. **Seguridad de Firebase Key**: Al ingresar la variable `FIREBASE_PRIVATE_KEY` en el dashboard de Vercel, asegúrate de copiarla exactamente incluyendo las comillas y los saltos de línea `\n`. Si Vercel experimenta problemas al analizar la clave privada, puedes almacenarla directamente reemplazando los saltos de línea físicos por `\n` literal en una sola línea.
2. **Autenticación en Producción**: Asegúrate de que `NEXT_PUBLIC_AUTH_DISABLED` esté configurada en `false` en Vercel. De lo contrario, cualquier persona podrá ingresar a la app sin autenticación y sin persistencia individualizada real de Firestore por UID.
3. **Optimización de Build**: Next.js 15+ utiliza optimizaciones estrictas de Webpack. El proyecto incluye un archivo `vercel.json` configurado correctamente para Next.js en Vercel.
