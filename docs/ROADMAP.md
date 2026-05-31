# Roadmap de Endogym

Ultima actualizacion: **31 de mayo de 2026**.

## P0 - Recuperacion y seguridad inmediata

- [x] Resolver marcadores de conflicto en 22 archivos.
- [x] Consolidar documentacion y memoria operativa.
- [x] Añadir rechazo automatico de conflictos en CI.
- [x] Corregir `FIREBASE_PRIVATE_KEY` de Vercel y redesplegar.
- [x] Revocar cualquier API key Gemini expuesta y configurar una nueva key restringida.
- [x] Auditar tokens Vercel y revocar cinco sesiones web listadas.
- [x] Eliminar variables Vercel Flags no utilizadas.
- [x] Provisionar bucket privado `endogym-vtety8-plates-eu`.
- [x] Deshabilitar servicios Vertex no utilizados.

## P1 - Estabilizacion verificable

- [x] Ejecutar `npm install`.
- [x] Ejecutar `npm run smoke`.
- [x] Ejecutar `npm test`: 61 tests.
- [x] Ejecutar `npm run build`.
- [x] Actualizar Next a `16.2.6` y eliminar vulnerabilidades altas.
- [x] Verificar Vercel `/` y `/api/health`.
- [x] Verificar Firebase Auth y Firestore end-to-end.
- [x] Verificar fallback desplegado de `/api/analyze-plate`.
- [x] Rotar Gemini y verificar inferencia real sin fallback.
- [x] Provisionar Storage y verificar upload/borrado.
- [x] Corregir URL canonica Vercel y redesplegar.
- [x] Autorizar `endogym.vercel.app` en Firebase Auth y verificar Google OAuth.
- [x] Corregir `GEMINI_MODEL_COACH` y verificar coaching semanal Gemini live sin fallback.
- [x] Resolver las 10 vulnerabilidades moderadas transitivas; `npm run audit`: 0.

## P2 - Hardening

- [x] Validar MIME por magic bytes.
- [x] Añadir rate limiting persistente.
- [x] Automatizar E2E controlado contra produccion.
- [x] Añadir logs estructurados y runbook de observabilidad.
- [ ] Activar entrega automatica de alertas: bloqueado por plan Vercel `hobby`.
- [x] Aplicar retencion de fotos a 30 dias y deshabilitar soft delete.
- [ ] Completar revision legal humana de privacidad, consentimiento y disclaimer por mercado.
- [x] Bloquear vulnerabilidades moderadas en CI.
- [x] Rechazar identificadores Gemini invalidos y acotar timeout del coach antes del limite Vercel.
- [ ] Añadir E2E con emuladores para CI.

## P3 - Producto

- [ ] Mejorar correccion manual de alimentos y porciones.
- [ ] Calibrar confianza por tipo de plato.
- [ ] Ampliar historial y progresion.
- [ ] Mejorar recomendaciones pre/post entreno con limites clinicos claros.
