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

## Estado confirmado el 2 de junio de 2026

- Vercel responde en `/` y `/api/health`; `/api/meals` sin token responde `401`. Producción fue redesplegada manualmente el 2 de junio de 2026 a `dpl_FJ2jWbaV8Ktjy9G57aKMDaVB4t9r`; vuelve a comprobarlo antes de afirmarlo en conversaciones futuras.
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
- El menú lateral es tipo hamburguesa desplegable (verificado localmente y en producción).
- El atlas anatómico usa `gymbro-front-crop.png` (vista frontal) y `gymbro-back-crop.png` (vista posterior); colores primarios azul-magenta intenso (#7c3aed / #a855f7) y secundarios azul-magenta tenue. Vistas corregidas y posicionamiento ajustado.
- La biblioteca muestra tarjetas colapsables por categoría con modal de detalle por ejercicio (verificado localmente y en producción).
- La landing retiró claims no sustentados, reemplazó imágenes remotas por assets propios y añadió recuperación de contraseña. Se verificó localmente y en producción con Playwright.
- El check-in diario persiste síntomas estructurados, usa upsert idempotente `daily-YYYY-MM-DD`, rehidrata estado por fecha y bloquea alta intensidad ante síntomas de alarma. La encuesta omitida conserva RPE, fatiga y sueño como `null`.
- El mapa de vídeos conserva solo las 14 asociaciones verificadas por YouTube oEmbed el 2 de junio; el resto usa fallback SVG local.
- Las cabeceras HTTP defensivas están activas en producción. La separación de rechazos auth esperados en logs está desplegada; no se reconsultaron Runtime Logs filtrados por limitación del CLI.
- `main` local está cinco commits por delante de `origin/main` y conserva cambios sin commit desplegados manualmente; sincroniza GitHub antes de tratar el runtime como reproducible desde el repositorio remoto.

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
- Conserva el upsert diario determinista `daily-YYYY-MM-DD`; no vuelvas a guardar subjetivos desconocidos como cero.
- Para cambios visibles de UI, toma screenshot si el entorno lo permita (usa el MCP de Chrome DevTools).
- Al modificar `DashboardPage.js` o `styles.css`, ejecuta `npm run build` localmente antes de considerar el cambio listo.
- Los componentes de atlas anatómico residen en `src/components/MuscleMapFigure.js`; las imágenes en `public/anatomy/`. No reemplaces los modelos 3D sin actualización explícita de coordenadas de superposición.

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
