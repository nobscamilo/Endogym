import { jsonResponse } from '../../../lib/http.js';

export async function GET() {
  return jsonResponse({
    ok: true,
    service: 'endogym-api',
    timestamp: new Date().toISOString(),
  });
}
