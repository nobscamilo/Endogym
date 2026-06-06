import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { logError, withTrace } from '../../../lib/logger.js';
import {
  isValidGoogleAiModelName,
  requestGoogleGenerateContent,
} from '../../../services/googleGenAiTransport.js';
import { resolveGeminiCoachModel } from '../../../services/exerciseCoachClient.js';

// Chat "Pregúntale al coach" del rediseño Studio.
// Recibe { prompt } (el frontend ya incluye el system + contexto del usuario) y
// devuelve { text } con la respuesta del Coach IA usando la Gemini Developer API.
// Requiere autenticación para evitar abuso/coste de un endpoint de IA abierto.
export async function POST(request) {
  return withTrace('coach_chat', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return errorResponse('Autenticación requerida.', 401);
      }
      throw error;
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Cuerpo JSON inválido.', 400);
    }

    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return errorResponse('Falta "prompt".', 400);
    }
    if (prompt.length > 4000) {
      return errorResponse('Prompt demasiado largo.', 413);
    }

    if (!process.env.GEMINI_API_KEY) {
      return errorResponse('Coach IA no configurado.', 503);
    }

    const model = resolveGeminiCoachModel();
    if (!isValidGoogleAiModelName(model)) {
      return errorResponse('Modelo Gemini inválido.', 500);
    }

    try {
      const { response } = await requestGoogleGenerateContent({
        model,
        traceId,
        timeoutMs: 12000,
        parts: [{ text: prompt }],
        generationConfig: {
          temperature: 0.6,
          topP: 0.9,
          maxOutputTokens: 512,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        logError('coach_chat_http_error', new Error(`HTTP ${response.status}`), {
          traceId,
          userId: user.uid,
          detail: detail.slice(0, 300),
        });
        return errorResponse('El coach no pudo responder ahora mismo.', 502);
      }

      const data = await response.json();
      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();

      if (!text) {
        return errorResponse('Respuesta vacía del coach.', 502);
      }

      return jsonResponse({ text });
    } catch (error) {
      logError('coach_chat_failed', error, { traceId, userId: user.uid });
      return errorResponse('El coach no pudo responder ahora mismo.', 502);
    }
  });
}
