import { getAuthenticatedUser, AuthenticationError } from '../../../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../../../lib/http.js';
import { withTrace } from '../../../../../lib/logger.js';

export async function GET(request) {
  try {
    return await withTrace('strava_authorize', async () => {
      // Confirm authenticated user (optional but good practice)
      await getAuthenticatedUser(request);

      const clientId = process.env.STRAVA_CLIENT_ID;
      const redirectUri = process.env.STRAVA_REDIRECT_URI || 'http://localhost:3000/dashboard';

      if (!clientId) {
        return errorResponse('Strava integration is not configured (STRAVA_CLIENT_ID is missing).', 500);
      }

      const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=activity:read_all&approval_prompt=auto`;

      return jsonResponse({ url });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error generating Strava authorization URL.', 500);
  }
}
