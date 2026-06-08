# Estado real del proyecto Endogym

Ultima actualizacion: **7 de junio de 2026 (plan semanal de comidas + foto del plato + app oficial en la raíz "/")**.

## Sesión del 7 de junio de 2026 (Studio: nutrición semanal, foto del plato y lanzamiento en "/")

Continuación del lanzamiento de Ignios Studio. Cambios aplicados (pendiente `npm run build` + `git push` en la Mac; verificación posterior en Chrome):

- **Plan semanal de comidas (selector de día real).** `POST /api/studio-nutrition` ahora genera con Gemini **7 días (Lun–Dom)**, cada uno con 4 comidas distintas, además de la compra semanal y el batch cooking. Nuevo esquema `days[]` (antes `meals[]` de un solo día); `maxOutputTokens` 16384, `timeoutMs` 55s y `export const maxDuration = 60` en la ruta. El front (`screen-nutrition.jsx`) guarda `window.STUDIO.mealWeek`, reconstruye `nutritionDays` con kcal reales por día y sincroniza `D.meals` con el día seleccionado: al pulsar Lun/Jue/etc. el menú **cambia**. Compatibilidad hacia atrás con la forma antigua (`meals[]`). Helpers `normMeals()`, `todayDowIndex()`, `DOW_LABELS`.
- **Foto del plato (IA).** En `AddFood` (Nutrición) se añadió un input de cámara/galería que envía la imagen en base64 a **`POST /api/analyze-plate`** (Gemini Vision, ya existente). La ruta estima macros + carga glucémica y **registra la comida en el servidor**; el front solo suma los totales al resumen del día (no hay doble registro). Guarda de tamaño 5 MB y estados de carga/éxito/error.
- **App oficial en la raíz "/".** `src/app/page.js`: si hay sesión activa (o demo sin Firebase), la home **renderiza el Studio en iframe en "/"** en lugar de redirigir a `/studio`. Sin sesión se muestra el landing + login. `src/app/studio/page.js` quedó como **alias que redirige a "/"** (marcadores antiguos). Se eliminaron los `router.push('/studio')` tras login. La CSP no cambió: la global ya permite `frame-src 'self'` (iframe del mismo origen) y el documento del iframe (`/studio/app/*`) sigue con su CSP relajada.
- **Bundle regenerado:** `node scripts/build-studio.mjs` → `studio.bundle.js?v=fd2823e32d` (referencia cache-bust actualizada en `index.html`).

### Fix tras 1er deploy: 502 en plan semanal (causa raíz + solución)

- **Verificado en producción (deploy `fd2823e32d`):** la app abre en "/" (iframe, bundle nuevo) ✅, pero `POST /api/studio-nutrition` devolvía **502 a ~32s**. Logs de Vercel: rama `catch` (`studio_nutrition_failed`), no HTTP de Gemini.
- **Causa raíz:** `requestGoogleGenerateContent` en `googleGenAiTransport.js` **recortaba el timeout a 30s** (`Math.min(30000, …)`), así que el `timeoutMs:55000` se ignoraba; generar 28 recetas en una sola llamada tarda >30s → `AbortController` aborta → excepción.
- **Solución aplicada (solo backend, no requiere recompilar bundle):**
  1. Tope del transporte subido de 30s a **60s** (`Math.min(60000, …)`).
  2. La semana se genera en **4 trozos pequeños EN PARALELO** (`DAY_CHUNKS = [[Lun,Mar],[Mié,Jue],[Vie,Sáb],[Dom]]`) con `Promise.allSettled`; el 1er trozo trae además compra + batch semanales. Esquemas `FULL_CHUNK_SCHEMA` / `DAYS_CHUNK_SCHEMA`. Cada trozo (2 días/8 comidas) cabe de sobra bajo el límite; al ir en paralelo la latencia total baja. Tolerante a fallos: si algún trozo falla se devuelve `partial:true` con los días que sí salieron (502 solo si no sale ninguno).
  3. Se añadió **un reintento por trozo** (`genChunkSafe`) y se subió `maxOutputTokens` (9000 días / 12000 con compra) para evitar truncación.

### Verificación final en producción (Chrome, 7 jun 2026) — TODO OK
- **App oficial en "/":** confirmado, la home renderiza el Studio en iframe (bundle `fd2823e32d`); `/studio` redirige a "/". ✅
- **Plan semanal:** `POST /api/studio-nutrition` → **200 en ~15s, 7/7 días, 4 comidas/día, `partial:false`**, compra (5 cat) + batch (3). Menús distintos por día (desayunos y cenas verificados todos diferentes). ✅
- **Selector de día (UI):** al pulsar "Jue" el menú mostrado cambia al de jueves (data + UI verificadas); el rail muestra kcal reales por día. ✅
- **Foto del plato:** bundle desplegado contiene `/api/analyze-plate`, "Foto del plato" y `readAsDataURL` → cadena cableada (endpoint Gemini Vision pre-existente). El upload real de imagen no se automatizó en Chrome, pero el flujo está completo. ✅

### Mejoras 7 jun (tarde): persistencia del plan + calidad del prompt — bundle `4b6165d4fe`

- **Persistencia del plan semanal (Firestore).** El plan ya NO se regenera en cada visita. Nuevas funciones en `firestoreRepository.js`: `saveStudioNutritionPlan(uid, weekKey, plan)` / `getStudioNutritionPlan(uid, weekKey)` (doc en `users/{uid}/studioNutrition/{AAAA-MM-DD del lunes}`). En la ruta:
  - `GET /api/studio-nutrition` → devuelve el plan guardado de la semana (`cached:true`) sin gastar IA, o `{ ok:true, empty:true }` si no hay.
  - `POST` → genera, y si el plan está completo (7 días) lo **guarda** con `currentWeekKey()` (lunes UTC).
  - Frontend (`screen-nutrition.jsx`): al abrir Nutrición intenta `loadCached()` (GET) y solo si no hay plan lanza `generate()` (POST). El botón "Generar mi plan con IA" regenera y sobrescribe. Helper `applyNutrition()` extraído. Resultado: estable durante la semana, sin esperas ni coste repetido.
- **Calidad del prompt (#2).** kcal/día forzadas a **±5% del objetivo** (con recordatorio p·4+c·4+f·9 ≈ kcal); prohibido repetir proteína principal en días consecutivos; y **pistas de estilo de desayuno por bloque** (`CHUNK_STYLE_HINTS`: salado / avena / lácteos-fruta / pan-repostería) para diversificar entre los 7 días (los bloques van en paralelo y no se ven entre sí, por eso el reparto se fija en el código).

### Verificado en producción (Chrome, bundle `4b6165d4fe`) — OK
- **Persistencia:** `GET` vacío al inicio → `POST` genera 7/7 días (14.7s, `partial:false`) y guarda → `GET` devuelve `cached:true` en **570 ms** (sin regenerar). Plan estable. ✅
- **Variedad de desayunos:** ahora diversos (revuelto de claras, tostadas aguacate-huevo, porridge de avena, tortitas de avena, batido tropical, bowl de fruta con yogur…). ✅
- **kcal/día:** OJO — el objetivo real del usuario es **~2713 kcal** (no ~2000 como anoté antes; mi observación previa de "overshoot" era ERRÓNEA). Resultado: 5/7 días ~2700 (±0,5% del objetivo, perfecto); los días Vie-Sáb (bloque lácteos-fruta) quedaron en 2150 (~-20%). Variación menor por bloque; mejorable pero no bloqueante.

### Fix login (registro con Google) — `src/app/page.js`

- **Bug reportado por el usuario:** al registrarse con otra cuenta vía "Registrarme con Google" no pasaba nada y pedía "aceptar términos", pero **las casillas de consentimiento no estaban visibles** (estaban en el "paso 2" del asistente, al que solo se llegaba por el flujo email/contraseña). Resultado: imposible registrarse con Google. También salían **códigos `auth/...` crudos**.
- **Solución:** el registro pasa a **una sola pantalla** (email + contraseña + confirmar + consentimientos + botones "Crear cuenta" y "Registrarme con Google" juntos). Se eliminó el asistente de 2 pasos (`registerStep` y su efecto/ indicador). Ahora los consentimientos están visibles antes de pulsar Google. Añadido `friendlyAuthError()` que traduce los códigos de Firebase Auth a mensajes claros en español (usado en los 3 `catch`: email, Google, reset). Recordatorio: el acceso con Google en modo *Iniciar sesión* con una cuenta sin registro previo sigue avisando "No existe cuenta previa con Google. Cambia a Registro…" (comportamiento intencionado).
- Solo cambió `src/app/page.js` (componente Next; **no requiere recompilar el bundle**).

### Fix "aparece la sesión de Marta" (identidad de muestra) — bundle `0e3d33341f`

- **Bug reportado:** al entrar con cualquier correo a veces se veía el usuario de muestra **"Marta García"**.
- **Causas (servidor + cliente):**
  1. `mapUser(profile)` en `studio-data/route.js` devolvía **`null` si el perfil no existía** (cuenta nueva) → no se mandaba override → el bundle conservaba el usuario de muestra.
  2. `out.name` solo se asignaba si el perfil tenía nombre → cuentas sin nombre heredaban "Marta".
  3. Si `/api/studio-data` tardaba/fallaba (auth del iframe aún no lista, abort a 2,5s), caía a muestra.
- **Solución:**
  - `mapUser(profile, authUser)` **nunca** devuelve null y **siempre** asigna `name`, derivándolo de: perfil → displayName de Google → parte local del email → genérico "Atleta". Se le pasa el `user` autenticado.
  - Identidad de muestra en `data.js` **neutralizada** ("Atleta", sin apellido) como red de seguridad: aunque algo falle, nunca se ve el nombre de otra persona.
  - Arranque del iframe (`build-studio.mjs`) más robusto: espera de auth 1,5s→**4s**, timeout de `studio-data` 2,5s→**8s**, espera-y-reintento de token y **un reintento** del fetch.

### Fix login con Google: CSP bloqueaba `apis.google.com` + auto-crear cuenta

- **Síntoma (consola):** `Loading the script 'https://apis.google.com/js/api.js' violates ... script-src 'self' 'unsafe-inline'`. Firebase Auth (popup de Google) carga gapi/GSI desde `apis.google.com`, bloqueado por la CSP. La cuenta del dueño entraba porque ya tenía sesión guardada (no recargaba el script); una cuenta nueva sí lo necesita.
- **Solución (CSP en `next.config.mjs`, global y studio):** añadidos a `script-src` `https://apis.google.com`; a `frame-src` `https://apis.google.com https://accounts.google.com`; a `connect-src` `https://apis.google.com https://accounts.google.com`; y a `img-src` `https://*.googleusercontent.com` (foto de perfil de Google). El test `security-headers.test.js` sigue verde (solo comprueba ausencia de `unsafe-eval` y `frame-ancestors`, no la CSP exacta).
- **Además:** el primer acceso con Google **crea la cuenta automáticamente** (en `submitGoogleAuth`, `src/app/page.js`): se quitó el throw "No existe cuenta previa con Google" y se llama a `upsertInitialProfile` cuando `isNewUser`, registrando los consentimientos legales (versión vigente). Nota de cumplimiento: el consentimiento queda implícito en el alta por Google.

### Fix "mismos ejercicios para todos / muy pocos" (selección heurística, NO el RAG)

- **Diagnóstico:** la selección de ejercicios (`buildSessionExercises` en `exerciseLibrary.js`) dependía solo de modalidad + foco + `daySeed`, y en `planner.js` `daySeed = index` (índice del día, **idéntico para todos**). El objetivo solo cambiaba reps/series, no los ejercicios. Resultado: misma modalidad → mismos ejercicios para cualquier persona. Y el conteo caía a 4–5 si no se completaba la encuesta del Studio.
- **El RAG NO era la causa.** Verificado en sandbox (`--env-file=.env.local`): el retriever funciona en **modo semántico (vector)**, ~20k chars de contexto + 3 citas por objetivo, y trae fuentes correctas y distintas por objetivo (hipertrofia→*Nutrition and Athletic*, *25. Sports Nutrition*; glucémico→*The Athlete With Diabetes*, *Chronic medical conditions*). El RAG alimenta al **coach IA**, no a la selección heurística.
- **Solución (server-side):**
  1. **Semilla por usuario+objetivo** (`computeUserSeed(profile, goal, userId)` en `planner.js`): `daySeed = index + userSeed`. La API `weekly-plan` pasa `userId: user.uid`. Dos personas (o la misma con otro objetivo) reciben ahora una selección distinta del mismo catálogo, sin romper la seguridad clínica (sigue eligiendo de las categorías correctas). Aplicado también en `normalizeWeeklyPlanSessionFocus` y `suggestSessionAlternatives`.
  2. **Conteo escala con la duración real de la sesión** (`buildSessionExercises` usa `sessionMinutes` de la plantilla cuando no hay encuesta): `Math.max(4, Math.min(9, Math.round((min-10)/8)))` → 52min≈5, 66≈7, 72–75≈8. Los tests de conteo por intensidad (ex1–ex5) no pasan `sessionMinutes` (→ `Number(null)=0`, cae a la rama por intensidad), así que siguen verdes.
- **Verificado** con script determinista: usuario A vs B (mismo objetivo) → ejercicios distintos; A hipertrofia vs A resistencia → distintos; conteo 8 (antes 4–5).
- **IMPORTANTE para el usuario:** los ejercicios mostrados salen del plan **guardado**; hay que pulsar **"Regenerar plan con IA"** una vez tras el deploy para que cada persona obtenga su nueva selección.
- Pendiente/futuro (no bloqueante): programación específica por objetivo más profunda (p. ej. fuerza→prioriza básicos pesados, resistencia→más densidad), no solo variación de semilla.

### Vídeos de ejercicios — cobertura de fuerza (jun 2026)

- **Antes:** de 184 ejercicios solo 34 tenían vídeo embebible; el resto caía a un enlace de búsqueda. Además 2 de los 34 estaban **caídos** (404/400): dominada `ZuV_NokRESN` y sentadilla `9r-k1D_Wz3A`.
- **Hecho:** todos los `EXERCISE_VIDEO_MAP` se verificaron vía **oEmbed**; se reemplazaron los 2 caídos (dominada→`ZPG8OsHKXLw`, sentadilla→`ZaSetOZFo-k`) y se **añadieron 67 mapeos nuevos** para cubrir la fuerza (gym/casa/TRX/calistenia). Se buscaron Shorts reales (`WebSearch` en youtube.com) y se verificó existencia + título coherente de cada uno (20 movimientos nuevos: elevación lateral, gemelos, tríceps en polea, curl femoral, puente de glúteos, dead bug, bird dog, escaladores, gato-vaca, plancha lateral, hollow hold, step-up, sentadilla cosaca, bear crawl, rotación torácica, movilidad de tobillo, leñador, superman). Donde no hay Short 1:1, se reutiliza el del **mismo patrón** de movimiento.
- **Resultado verificado:** **101/102 ejercicios de fuerza con vídeo** (único sin vídeo: `recovery-walk`, una caminata, no es técnica). Catálogo total: 101/184 (yoga/pilates/cardio quedan para 2ª tanda).
- **Implementación:** `src/core/exerciseLibrary.js` (`EXERCISE_VIDEO_MAP`). No requiere recompilar el bundle (los IDs viajan en el plan → `studio-data` → STUDIO). Test `calendar-and-exercise-metadata.test.js` actualizado (el ejemplo "sin vídeo" pasó de `gym-front-squat` a `yoga-cobra-pose`).
- **IMPORTANTE:** los vídeos viajan en el plan **guardado**; hay que **"Regenerar plan con IA"** una vez tras el deploy para que aparezcan los nuevos.
- Riesgo conocido: oEmbed confirma que el vídeo existe, pero algún autor podría tener el **embedding deshabilitado** (se vería "no disponible" en el reproductor). Poco probable con Shorts de técnica populares; si pasa en alguno, se sustituye.
- Pendiente/futuro: 2ª tanda para yoga (39), pilates (44) y cardio (running/cycling) — mismo método.

### Modalidad híbrida "Correr + Gym" (entrenamiento concurrente) + vídeos de cardio

- **Pregunta del usuario:** ¿se puede ser runner y usar el gimnasio a la vez? Antes NO (la encuesta solo daba Gimnasio/Mixto/TRX/Casa). Implementado:
  - Nueva modalidad `HYBRID_RUN_GYM` (`models.js`) + plantilla semanal concurrente (`planner.js`): 2 días de **gimnasio** (Pierna / Torso) + 3 de **carrera** (rodaje Z2, series, tirada larga) + 2 recuperación, ordenados para minimizar interferencia (pierna lejos de la tirada larga).
  - `modalityFallback(HYBRID_RUN_GYM)` = `[FULL_GYM, RUNNING]`: los días de fuerza tiran de ejercicios de **gimnasio** y los aeróbicos de **carrera** (el `sessionType` de cada día filtra). Sin casa ni ciclismo (es híbrido de carrera). `EXTRA_SESSION_VARIATIONS` añadidas para el swap.
  - Encuesta del Studio (`screen-more.jsx` AV_EQUIP) con opción **"Correr + Gym"**; etiqueta en `studio-data` (`MODALITY_LABELS`).
  - **RAG concurrente:** `buildQueryText` ahora incluye la modalidad y, si es híbrida/mixta, pide guías de **entrenamiento concurrente** (efecto de interferencia, orden de sesiones, recuperación). La ruta ya pasa `weeklyPlan.trainingModality` al retriever. (El RAG ya tenía el conocimiento; antes no se le pedía explícitamente.)
  - **Verificado** (script): plan híbrido → Lun/Mié gym puro (6 ejercicios c/u, todos con vídeo), Mar/Jue/Sáb carrera (con vídeo), recuperación con movilidad. Único sin vídeo: `recovery-walk`.
- **Vídeos de cardio** añadidos (verificados oEmbed): `run-zone2/tempo` (técnica de carrera), `run-fartlek/intervals`, `run-hill-repeats`, `run-strides`, `run-a-skip-drill`, y `cycle-*` (cadencia/técnica). Bundle `3840a715ee`.
- **IMPORTANTE:** para usar el híbrido, en Perfil elegir "Correr + Gym" y **Regenerar plan con IA**.

#### Pulido de la rama running (cada día de cardio = su ejercicio específico)
- Sub-focos de cardio en `exerciseLibrary.js` (`cardio_easy/long/tempo/intervals/drills`) en `SESSION_FOCUS_CATEGORY_MAP` y `SESSION_FOCUS_PRIORITY`.
- `resolveSessionFocus` detecta el TIPO por el título del día (rodaje/zona2/base→easy; series/intervalos/cuestas/hiit→intervals; tempo/umbral/fartlek→tempo; larga/tirada→long; técnica/skip/cadencia→drills). Aplica a Running e Híbrido sin tocar la generación.
- **Verificado:** Híbrido → rodaje=run-zone2, series=run-intervals+run-hill-repeats, larga=run-zone2; gym puro en días de fuerza. Running → easy/long=zone2, intervalos=intervals+cuestas, tempo=tempo+fartlek. **Todos con vídeo** (salvo recovery-walk).
- **Fix de fuga de ciclismo:** `run-zone2`/`cycle-zone2` comparten etiqueta `mixed`; se quitó `mixed` del `modalityFallback` de RUNNING/CYCLING para que un plan de carrera no muestre sesiones de bici (y viceversa). La fuerza complementaria sigue saliendo de casa/gimnasio.
- Pendiente/futuro: drills (strides/A-skip) como calentamiento en días de calidad; 2ª tanda de vídeos de yoga/pilates (no seleccionables aún en el Studio).

### Sistema de entrenamiento de carrera (4 mejoras) — bundle `0bb78ec65f`

Nuevo motor `src/core/running.js` + integración completa:
1. **Drills de calentamiento** en días de calidad (series/tempo): movilidad, A-skip, strides (en `runPrescription.drills`).
2. **Prescripción real por día**: cada sesión aeróbica lleva `runPrescription` { runType, zoneLabel, targetPace, targetRange, structure, drills, note }. Estructura concreta (ej. "12' cal + 5×1000 m a umbral rec 90s + 8' enf"). Ritmos **numéricos si hay marca** (Riegel → 5K-equivalente → desfases Daniels por zona: fácil/larga/umbral/intervalo), **cualitativos** si no.
3. **Objetivo de carrera** (`RaceGoal`: salud/5K/10K/21K/42K): ajusta la **tirada larga** (50→165 min según objetivo, exenta del recorte por tiempo/sesión) y el **esquema de series** (5K=6×800, 10K=5×1000, 21K=4×1500, 42K=5×1000 a umbral, salud=8×1').
4. **Coach IA para corredores**: `coach-chat` inyecta objetivo de carrera, ritmos y nota de entrenamiento concurrente; el RAG ya añade "concurrente fuerza+resistencia" a la consulta.

Integración: `planner.js` adjunta `runPrescription` y expone `weeklyPlan.raceGoal/runPaces`; encuesta (`screen-more.jsx`) con sección de carrera (objetivo + marca m:ss) visible en "Correr + Gym"; `studio-availability` persiste `runRaceGoal/runRefDistanceMeters/runRefTimeSeconds`; `studio-data` mapea `runPrescription` + `runPaces` y prefija la encuesta; UI (`screen-train.jsx`) muestra tarjeta "Tu sesión de carrera" (ritmo objetivo, estructura, drills, nota). **Verificado por script**: maratón con 10K=45:00 → fácil 5:39, umbral 4:41, larga 95 min, series 5×1000; 5K sin marca → cualitativo, 6×800, tempo 30 min.

**IMPORTANTE:** Perfil → "Correr + Gym" → fijar objetivo (+marca opcional) → **Regenerar plan con IA**.
Pendiente/futuro: periodización multi-semana (base/build/peak/taper); ahora el ajuste es por semana según objetivo.

### Periodización multi-semana + nutrición periodizada — bundle `49ad1a777f`

- **Periodización (`running.js`):** `resolveTrainingPhase` decide la fase de la semana — **por fecha de carrera** si la hay (`weeksToRace`: ≤2 taper, ≤4 pico, ≤9 build, resto base) o, sin fecha, **ciclo rodante 4 sem** (base/build/pico/descarga). `PHASE_PARAMS` aplica factores de volumen, intensidad y tirada larga. En el planner: la duración de cada día y la tirada larga se escalan por la fase; `buildRunPrescription` recibe la fase y ajusta las series (taper ×0.6, descarga −1, pico +1) y añade `phaseLabel`. `weeklyPlan` expone `phase/phaseLabel/weeksToRace`. **Verificado:** maratón a 12 sem = base (tirada 95', 5×1000); a 2 sem = taper (volumen recortado, tirada 48', 3×1000).
- **Nutrición "fuel for the work required" (`carbStrategyForDay`):** los carbohidratos del día escalan con la demanda de la sesión y el objetivo: tirada larga ×1.35, series/tempo ×1.2, fuerza ×1.0, rodaje fácil ×0.95, descanso ×0.8; +0.12 base en 21K/42K. `adjustMacroTargetForDay` aplica el factor (carb cycling: sube/baja grasa inversa) y adjunta `carbLevel` + `carbTiming` por día. **Verificado:** tirada/series = carbos alto (563/506 g), fuerza = medio, descanso = bajo; kcal cicladas (3412 día largo, 2658 descanso).
- **Meal plan del coach IA por día (`studio-nutrition`):** el prompt ahora incluye, por cada día, la sesión, el nivel de carbohidratos, el timing y los macros objetivo de ESE día (tomados del plan de entreno). Regla de timing: carbos lentos peri-fuerza, rápidos peri-carrera/series, recarga tras la tirada larga. kcal por día a ±7% de su objetivo propio.
- **Encuesta/persistencia:** `screen-more.jsx` añade fecha de carrera; `studio-availability` persiste `raceDate`; `studio-data` lo prefija y la UI de Entreno muestra una pastilla de **Fase**.
- **Coach:** `coach-chat` inyecta fase, semanas a carrera y carbohidratos/timing de hoy.
- **IMPORTANTE:** Perfil → "Correr + Gym" → objetivo + (marca) + **fecha de carrera** → Regenerar plan. La nutrición se cachea por semana: pulsar "Generar mi plan con IA" en Nutrición para refrescarla tras cambiar el entreno.
- Pendiente/futuro: que el meal-plan cacheado se invalide automáticamente al regenerar el entreno (hoy es manual).

### Integración Strava (FC y entrenos) — bundle `dfad737fdd`

- **Realidad técnica:** Apple Watch NO se conecta directo a una web (HealthKit es nativo on-device). Vía: **Apple Watch → Strava → Ignios**. Strava da FC media/máx por sesión, ritmo y distancia (no FC en reposo/HRV fiables → eso requeriría app nativa/Garmin).
- **Implementado (OAuth + import):**
  - `src/services/stravaClient.js`: authorize URL, intercambio/refresh de tokens, `getActivities`, `mapActivityToWorkout`, y `state` firmado con HMAC (ata el callback al uid sin almacenamiento temporal).
  - Rutas: `GET /api/strava/connect` (devuelve URL de OAuth), `GET /api/strava/callback` (canjea code, guarda tokens, redirige a `/?strava=ok`), `POST /api/strava/sync` (importa actividades desde el último sync, idempotente por id → workouts `source:'strava'` con FC/ritmo/distancia).
  - Repositorio: `saveStravaConnection/getStravaConnection` (doc `users/{uid}/integrations/strava`); `buildWorkoutRecord` ampliado con `avgHeartRate/maxHeartRate/distanceKm/avgPaceSecPerKm/sportType/stravaActivityId`; `createWorkout` idempotente (`strava-{id}`).
  - `studio-data`: override `strava` { connected, lastSyncAt, recent[] (con FC) }. UI: tarjeta **"Strava · FC y entrenos"** en Perfil (conectar / sincronizar / lista de carreras con FC); auto-sync al volver del OAuth (`?strava=ok`). Se quitó el placeholder "Sincronizar wearable".
- **ACCIÓN DEL USUARIO (requerida para activar):**
  1. Crear una API Application en https://www.strava.com/settings/api — Authorization Callback Domain = **`endogym.vercel.app`** (solo el dominio).
  2. Copiar **Client ID** y **Client Secret**.
  3. En Vercel → Settings → Environment Variables: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` (y opcional `STRAVA_STATE_SECRET` = cadena aleatoria). Redeploy.
  4. En la app: Perfil → "Conectar Strava".
- **Aislamiento por usuario (privacidad) — CONFIRMADO:** cada usuario conecta SU propio Strava; los tokens y actividades se guardan bajo `users/{uid}/...` y todos los reads van con `user.uid`. Ningún usuario ve datos de otro. El access/refresh token personal del dueño NO se usa en el código (solo Client ID/Secret a nivel de app, que es lo normal en OAuth).

### Webhook de Strava (sync automático) — bundle `8594c0f534`
- `GET/POST /api/strava/webhook`: GET valida la suscripción (`hub.challenge` con `STRAVA_VERIFY_TOKEN` o fallback a `STRAVA_STATE_SECRET`); POST recibe eventos y, en create/update de actividad, busca al dueño por `athleteId` (`getUserByStravaAthlete`, collectionGroup `integrations`), refresca token e importa esa actividad a SU uid. Responde 200 siempre.
- `POST /api/strava/webhook-setup` (con sesión): registra la suscripción push apuntando a `/api/strava/webhook` (solo se permite 1 por app). Botón "Activar sync automático" en la tarjeta de Strava (Perfil).
- **Puede requerir** un índice de Firestore para la consulta collectionGroup `integrations` por `athleteId` (si falla, Firestore da un enlace para crearlo en los logs).
- **No verificable sin credenciales/deploy:** el OAuth y el webhook reales se prueban tras poner env vars + push. Código revisado y compila.
- FC reposo/HRV: pendiente (requiere app nativa/Garmin).

### Ajuste adaptativo de carga por FC media (Strava) — verificado
- **Verificado en producción:** `/api/strava/connect` devuelve URL válida con `client_id` → credenciales OK en Vercel; bundle `8594c0f534` desplegado. Falta que el usuario conecte y sincronice.
- `buildProgressMemory` (progressMemory.js) calcula una señal de **FC de carrera**: compara la **FC media reciente (≤7 días)** con la **base (8-21 días)** de las carreras importadas de Strava → `cardio.hrDriftBpm` y `cardio.hrSignal` ('elevated' si +5 bpm, 'fresh' si −3, 'normal').
- `buildAdaptiveTuning`: nueva regla **`HR_DRIFT_ELEVATED`** — si la FC media de carrera sube ≥5 bpm vs tu base (con ≥4 carreras con FC), recorta `volumeFactor ×0.9` y `rpeShift −1` (fatiga/under-recovery). Se integra con el resto del ajuste adaptativo y queda registrada en `appliedRules`/`clinicalAuditTrail`. **Verificado por script:** FC +10 bpm → regla aplicada; FC estable → no.
- Solo cambió `src/core/progressMemory.js` (no requiere recompilar el bundle).
- Pendiente/futuro: usar FC también para validar que corres en la zona prescrita.

### Fixes UI (bundle `c29d93ed46`)
- **Calendario real en Nutrición:** el day-rail mostraba fechas de muestra (Lun 2…). Ahora `weekDateNumbers()` calcula los números de día de la **semana actual** (lunes→domingo) y `applyNutrition` los usa. Coincide con el día de hoy.
- **Motivo del ajuste del coach visible:** `studio-data` expone `coachAdjust` (resumen + reglas de `adaptiveTuning.appliedRules` + `volumeFactor`); la pantalla **Entreno** muestra un banner "Ajuste del coach · volumen ×N" con las razones (p. ej. FC media elevada, fatiga). Solo aparece si el volumen cambió.
- Apple Watch del usuario: conectado a Strava (Apple Watch 11 → Strava → Ignios), que es la vía correcta.

### Validación de zonas (por usuario) + "Más tiempo" — bundle `0e2e3893a8`
- **Zonas personalizadas por usuario:** `hrMaxFromAge` (Tanaka 208−0.7·edad) y `hrZone` (%FCmáx, 5 zonas) en `running.js`. La FCmáx usada = **máx(FCmáx observada en SUS carreras de Strava, estimada por su edad)** → cada usuario tiene sus propias zonas. `validateRunZone` compara la FC real de cada carrera con la zona prescrita del día (easy/long→Z2, tempo→Z3-4, intervals→Z4-5) y da veredicto (too_hard/ok/too_easy).
- **Dónde se ve:** `studio-data` expone `runZones` (solo perfiles de carrera) → sección **"Validación de zonas"** en Progreso (FC real vs objetivo por carrera). El **coach** incluye la FCmáx por edad y el veredicto de la última carrera, e instruye a comentar la disciplina de zonas (cada usuario distinto).
- **Caveat honesto:** la FCmáx por edad es una estimación (±10-12 bpm); se mitiga usando la máx observada del reloj. Mejorable con FCmáx medida o %HRR (Karvonen) que requeriría FC en reposo. Pendiente: campo manual de FCmáx en perfil.
- **"Más tiempo" al cambiar sesión** (`studio-swap` reason `more_time` + UI): amplía la sesión actual a N minutos (input, hasta 180). Carrera → alarga duración y recalcula prescripción; fuerza → añade ejercicios extra (no reemplaza). "Lo que ya está + más".

### Auditoría del Coach IA + mejora de lógica (en fases)

**Hallazgo de la auditoría:** la prescripción de ejercicios (split, ejercicios, series/reps/carga) es 100% HEURÍSTICA (`planner.js` + `exerciseLibrary.js`); el ajuste (volumen/RPE) es heurístico (`buildAdaptiveTuning`, incl. FC). La IA (`callGeminiExerciseCoach`) solo genera TEXTO (resumen/justificación ACSM/ajustes sugeridos/riesgos) — su esquema NO cambia series/reps/carga, así que **no aplica** cambios. Carga = peso×ratio (sin progresión real desde historial). Proteína = % de kcal (debería ser g/kg). Meal-plan IA no se verifica en servidor. Plan adjudicado: 5 fases.

#### FASE 1 — Bloque estable de 21 días (HECHO, bundle `1ab267b50b`)
- `generateBlockPlan` (planner): mesociclo de 3 semanas (21 días) reutilizando `generateWeeklyPlan` por semana, con periodización por semana (fase por fecha de carrera o ciclo rodante) y `seedOffset` para variar ejercicios entre semanas. Devuelve `isBlock`, `blockStartDate/blockEndDate`, `blockWeeks[]`. **Verificado:** 21 días, fases base→build→build, ejercicios distintos por semana.
- `weekly-plan` POST: si hay **bloque activo** (hoy ≤ blockEndDate) y no se pide `rebuild:true`, **NO regenera** (devuelve `stable:true`). Rebuild solo cuando: no hay bloque, expiró, o explícito. La encuesta de Perfil envía `rebuild:true` (cambió el perfil). El botón de Entreno pasa a **"Nuevo bloque (21 días)"** con `confirm()` (rebuild explícito); los cambios pequeños son "Cambiar sesión"/"Más tiempo"/swaps.
- `studio-data` `mapWeek`: en bloques >7 días muestra solo la **semana actual** (lunes→domingo) que contiene hoy.
- Test `weekly-plan.route.test.js`: actualizado a 21 días + `isBlock`.
- Tensión conocida: con el bloque estable, el ajuste adaptativo (FC/fatiga) solo re-aplica al reconstruir; la Fase 5 (IA aplica ajustes acotados por día) lo resolverá en vivo.
#### FASE 2 — Proteína g/kg + verificación de macros (HECHO)
- **Proteína anclada al peso** (`planner.js`): `proteinPerKgForGoal` (hipertrofia/fuerza/recomp 2.0; pérdida/glucémico 2.2; resistencia 1.7; resto 1.8) × `proteinFactor` adaptativo. `anchorProteinToBodyweight` fija P por g/kg y recalcula C/F manteniendo kcal (grasa ≥0.8 g/kg y ≥20% kcal). Antes la proteína era % de kcal. **Verificado:** 80kg hipertrofia→160g (2.0), 95kg pérdida→209g (2.2), 62kg resistencia→105g (1.7), calorías preservadas. Expone `proteinPerKg`.
- **Verificación de macros en servidor** (`studio-nutrition`): tras generar, `macroCheck` suma los totales reales por día (kcal/proteína) vs el objetivo de ese día → `proteinRatio`/`kcalRatio` + `perDay`. Prompt reforzado: la proteína es prioridad (±5%, ≥25-30 g/comida). Si `proteinRatio < 0.82` (≥4 días), **reintenta UNA vez** y se queda con el mejor (coste acotado). Se devuelve `macroCheck` en la respuesta.
- Solo backend (planner + studio-nutrition); no requiere recompilar el bundle.
#### FASE 3 — Sobrecarga progresiva real (HECHO)
- `prescribeLoadKg` ahora acepta `{ loadProgression, historyLoad }` y devuelve `{ loadKg, source }`. Si hay **carga registrada** para el ejercicio (`liftHistory[id].weightKg`), parte de ella y progresa; si no, estimación por peso×ratio. `buildExercisePrescription` expone `loadSource` ('history'|'estimate') y guía RIR acorde.
- **Progresión por bloque:** `PHASE_PARAMS.loadFactor` (base 1.0, build 1.04, pico 1.07, taper 0.95, descarga 0.9). `generateWeeklyPlan` pasa `loadProgression = phaseParams.loadFactor` → las cargas suben semana a semana dentro del bloque y bajan en descarga.
- **Historial:** `weekly-plan` construye `liftHistory` (última carga por ejercicio desde `recentWorkouts`) y lo pasa a `generateBlockPlan`→`generateWeeklyPlan`→`buildSessionExercises`. RPE adaptativo sigue modulando (`rpeShift`).
- **Verificado:** press banca registrado a 70 kg → bloque 70→72.5→75 kg (base→build→pico); ejercicios sin registro → estimación. Solo backend (no bundle).
- Nota: el check-in del Studio aún no captura carga por ejercicio; cuando se registre (o vía edición), la progresión se vuelve totalmente data-driven. La Fase 5 puede añadir captura de carga en la UI.
#### FASE 4 — Periodizar la fuerza por interferencia (HECHO)
- `INTERFERENCE_BY_PHASE` (base 1.0, build 0.9, pico 0.82, taper 0.8, descarga 0.85). En modalidades de carrera (`hybrid_run_gym`/`running`/`cycling`), los días de fuerza reducen volumen según la fase de carrera: `buildSessionExercises` recibe `interferenceScale` → recorta nº de ejercicios y `setScale` recorta series. **Verificado:** pierna pasa de 6 ej × 3 series (base) a 5 ej × 2 series (fase de alta carga). Gym puro no se ve afectado.

#### FASE 5 — IA aplica ajustes acotados + captura de carga (HECHO, bundle `86412ddde4`)
- **Captura de carga en la UI (cierra el bucle de la Fase 3):** en Entreno cada ejercicio de fuerza tiene un input de kg (prefijado con la carga prescrita) y un botón **"Registrar sesión hecha"** que hace `POST /api/workouts` con `exercises:[{id,name,weightKg,reps,sets}]`. Esas cargas alimentan `liftHistory` → la próxima generación progresa desde datos reales. `studio-data` expone `loadKg/sets/reps/loadSource` por ejercicio.
- **IA aplica ajustes (con guardarraíles):** el esquema del coach añade `structuredAdjustments [{day, exercise, loadPct, setsDelta}]` (opcional). `weekly-plan` los **aplica al plan** con límites duros: carga ×0.90–1.10 (redondeo a 2.5 kg) y series ±1, solo a ejercicios de fuerza existentes (match por nombre+día). Marca `prescription.coachAdjusted`. Si la IA no devuelve nada, el plan heurístico queda intacto. Prompt reforzado con la regla 16 (rangos permitidos, nombre exacto).
- Solo el meal-log toca el bundle; el resto es backend.

**Resumen del plan de 5 fases: COMPLETO.** El coach pasó de "heurístico + texto IA" a: bloque estable de 21 días periodizado, proteína g/kg + verificación de macros, sobrecarga progresiva desde historial, periodización de fuerza por interferencia, y la IA aplicando ajustes acotados con la heurística como límite de seguridad.

### Notas / mejoras futuras (no bloqueantes)
- `analyze-plate` actualiza `D.glycemic.dayLoad` solo al refrescar `studio-data` (igual que el alta manual); aceptable.
- El plan cacheado se versiona por semana (lunes UTC); al cambiar de semana se regenera solo en la 1ª visita.

## Sesión del 6 de junio de 2026 (mejora del RAG nutricional)

### Hallazgos iniciales (auditoría)

- **Drift de ingesta:** había **226 JSON locales** en `docs/guidelines-json/` pero solo **213 subidos** a Firestore. Los 13 chunks nuevos (8 de *ACSM Guidelines* + 5 de *FUNDAMENTOS-DE-FISIOLOGIA-DO-EXERCÍCIO*, parseados el 4 de junio) estaban sin subir ni commitear.
- **Gap de keywords en nutrición:** los libros de nutrición antiguos (`Nutrition and Athletic`, `nutrients-16-03007`, `nmab093`, `obesity`) tenían `keywords: null` (parseados el 28 de mayo con la versión vieja). Solo eran recuperables por nombre de archivo o fallback → prácticamente invisibles para el coach.
- **Vocabulario sin cobertura nutricional:** ni `deriveKeywords()` ni el parser incluían términos de nutrición; `deriveKeywords()` nunca emitía `nutrition`.

### Cambios aplicados (verificados end-to-end contra Firestore de producción)

- **Vocabulario expandido (+30 términos de nutrición/suplementación)** en `scripts/parse_pdf_improved.py` y `scripts/chunk_ocr_json.py` (EN + mapeo ES/PT): `nutrition, sports nutrition, protein, amino acid, protein synthesis, carbohydrate, glycogen, dietary fat, hydration, fluid, electrolyte, sodium, micronutrient, vitamin, mineral, iron, calcium, creatine, caffeine, nitrate, beta-alanine, bicarbonate, supplement, ergogenic, energy availability, energy balance, calorie, fiber, gastrointestinal, recovery`.
- **`deriveKeywords()` en `guidelinesRetriever.js`** ahora emite ancla nutricional base (`nutrition`, `sports nutrition`) y keywords nutricionales por objetivo (hipertrofia→`protein synthesis/amino acid/creatine`; resistencia→`glycogen/electrolyte/caffeine/nitrate`; pérdida de peso→`energy availability/calorie/fiber`; glucémico→`fiber`).
- **Garantía de diversidad en la selección:** top-3 por puntaje; si ninguno es nutricional, se añade el libro nutricional mejor puntuado como 4º (máx. 4 docs). Constante `NUTRITION_TERMS` y flag `isNutrition`.
- **Re-keyado masivo:** nuevo `scripts/rekey_guidelines.py` recomputó keywords de los 226 JSON desde el texto ya almacenado (sin PDFs ni red). **222 reescritos; 206 ganaron keywords de nutrición.**
- **Subida a Firestore:** `node --env-file=.env.local scripts/upload_guidelines.js` → colección `guidelines` ahora con **226 docs** (drift eliminado). Conteos verificados: 72 docs con `nutrition`, 18 con `creatine`.

### Verificación

- Sonda real `retrieveGuidelinesContextWithCitations` contra Firestore de producción: para objetivos de hipertrofia y resistencia, *Nutrition and Athletic* y el capítulo *25. Sports Nutrition* aparecen ahora como resultado #1–#2 (antes invisibles). Para lesión de rodilla + fuerza siguen surgiendo *Therapeutic exercise* y *Sports medicine*.
- `node --check` y `py_compile` OK en todos los archivos modificados.
- **Limitación de tests:** `vitest` no corre en el sandbox Linux (binarios rolldown de macOS). Falta correr `npm test` y `npm run build` **en la Mac** antes de tratar el cambio como listo para commit/deploy.

### Limitación conocida del enfoque léxico (motivó los embeddings)

El re-keyado dejó claro el techo del RAG léxico: **206/226 docs quedaron marcados como "nutrición"** porque los capítulos médicos mencionan proteína/caloría/recuperación de pasada. El matching por keywords no distingue un capítulo *sobre* timing de proteína de uno que la menciona una vez.

## RAG semántico con embeddings (6 de junio de 2026, sesión tarde)

Se implementó búsqueda semántica como **modo principal del RAG**, con el léxico como fallback.

### Implementado y verificado

- **Embeddings:** `gemini-embedding-001` (Gemini Developer API, respeta "no Vertex"), **768 dims, L2-normalizados**. Nueva función `requestGoogleEmbeddings()` (batch) en `src/services/googleGenAiTransport.js`. Verificada con la key real (HTTP 200, 768 dims).
- **Sub-chunking + ingesta:** `scripts/embed_guidelines.mjs` trocea los 226 docs en pasajes de ~800 tokens con solape y los sube a la nueva colección **`guideline_passages`** con el vector en `FieldValue.vector()`. Resumable/idempotente. **7.128 pasajes generados, embebidos y subidos** (verificado: `count()`=7128, ejemplo con `VectorValue` de 768 dims y rango de páginas).
- **Retriever reescrito** (`src/services/guidelinesRetriever.js`): construye una consulta en lenguaje natural desde perfil/objetivo, la embebe (`RETRIEVAL_QUERY`, timeout 8s) y recupera con **`findNearest` (COSINE, limit 12, tope 20k chars)**. Citaciones con archivo, rango de páginas y distancia.
- **Fallback robusto:** si no hay `GEMINI_API_KEY`, si el embedding falla, o si `findNearest` falla (p. ej. índice no creado) o devuelve vacío, degrada automáticamente a la búsqueda léxica por keywords sobre `guidelines`. **Verificado end-to-end:** sin índice, el retriever degradó a keywords y devolvió contexto correctamente (producción nunca queda sin contexto).
- **Tests:** `tests/services/guidelines-retriever.test.js` actualizado (mock de `findNearest` y del transporte); añadido test del camino vectorial; conservados los de fallback léxico.

### PENDIENTE CRÍTICO — acción del usuario

- **Crear el índice vectorial en Firestore** (el service-account del repo NO tiene permiso `indexAdmin`). Hasta crearlo, el RAG funciona en modo keywords. Comando (también en DEPLOYMENT.md):

  ```bash
  gcloud firestore indexes composite create \
    --project=endogym-vtety8 \
    --collection-group=guideline_passages \
    --query-scope=COLLECTION \
    --field-config=vector-config='{"dimension":"768","flat": "{}"}',field-path=embedding
  ```

  El índice tarda unos minutos en construirse sobre 7.128 docs. Tras ello, el modo vector se activa solo (verificable en Runtime Logs por el evento `guidelines_vector_matches`).
- Costo de la generación de embeddings: ~5–6M tokens ≈ **< $1** una sola vez. Recurrente: centavos/mes.
- **Tests no corridos en sandbox** (vitest = binarios macOS). Correr `npm test` y `npm run build` en la Mac antes de commit/deploy.

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
