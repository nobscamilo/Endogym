# AGENTS.md - Guia para agentes que trabajen en Endogym

## Proposito

Endogym es un MVP en construccion para nutricion, seguimiento glucemico y entrenamiento. Antes de modificar codigo, lee:

1. `README.md`
2. `docs/PROJECT_STATUS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/API.md`
5. `docs/DEPLOYMENT.md`
6. `docs/SECURITY.md`
7. `docs/OBSERVABILITY.md`
8. `docs/ROADMAP.md`

## Regla de verdad

Distingue siempre entre:

- implementado en codigo;
- verificado localmente;
- verificado end-to-end con servicios reales;
- bloqueado por configuracion externa.

Actualiza los `.md` afectados al finalizar cambios. Evita reescribir documentos sin motivo: genera ruido y aumenta el riesgo de conflictos.

## Estado confirmado el 31 de mayo de 2026

- Vercel responde en `/` y `/api/health`; vuelve a comprobarlo antes de afirmarlo en conversaciones futuras.
- Firebase Auth, la API key publica del cliente y Google OAuth para `endogym.vercel.app` se verificaron con sondas reales.
- Firebase Admin y Firestore funcionan localmente y en produccion.
- Las fotos de platos usan el bucket privado `endogym-vtety8-plates-eu`; upload y borrado fueron verificados.
- Gemini Developer API funciona en produccion con una key restringida. Los servicios Vertex estan deshabilitados: no los habilites.
- `POST /api/analyze-plate` fue verificado con Gemini live y conserva fallback heuristico observable para fallos futuros.
- `POST /api/weekly-plan` fue verificado con coaching Gemini live; usa `gemini-2.5-flash`, timeout acotado y fallback ACSM observable.
- Las fotos caducan a los 30 dias y el bucket no conserva soft delete.
- Las rutas IA aplican rate limiting persistente en Firestore.
- `npm run audit` devuelve `0` vulnerabilidades.
- El frontend tiene Firebase Client Auth implementado; `x-dev-user-id` solo pertenece al modo local explicito.
- Las estimaciones nutricionales, glucemicas e insulinicas no son diagnostico medico.

## Arquitectura acordada

Usa **Ruta A**:

- Vercel ejecuta app y Route Handlers.
- Firebase Authentication gestiona identidad.
- Firestore conserva datos.
- El bucket privado `endogym-vtety8-plates-eu` conserva fotos mediante Firebase Admin.
- Google AI debe usar exclusivamente Gemini Developer API mediante adaptadores inyectables.

No migres a Firebase Hosting o App Hosting sin decision explicita del usuario.
No habilites Vertex AI.

## Seguridad obligatoria

- Nunca agregues secretos, tokens, API keys ni `.env` reales al repositorio.
- Usa `.env.example` solo como plantilla.
- `AUTH_DISABLED=true` es exclusivamente local.
- Si aparece un secreto en chat, logs o commits, recomienda revocarlo y rotarlo.
- Revisa `docs/SECURITY.md` antes de tocar auth, uploads o IA.

## Reglas de implementacion

- Mantiene Route Handlers en `src/app/api/**/route.js`.
- Centraliza Firebase Admin en `src/lib/firebaseAdmin.js`.
- Centraliza Firestore en `src/lib/repositories/firestoreRepository.js`.
- Usa `withTrace()` para operaciones HTTP nuevas.
- Valida inputs antes de persistir o llamar proveedores.
- Conserva fallbacks explicitos y observables.
- Para cambios visibles de UI, toma screenshot si el entorno lo permite.

## Verificacion minima

```bash
npm install
npm run check:conflicts
npm run audit
npm run smoke
npm test
npm run build
```

Cuando cambie configuracion externa, ejecuta ademas el checklist de `docs/DEPLOYMENT.md`.
