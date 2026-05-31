#!/usr/bin/env node
/**
 * Minimal standalone test that calls the Gemini API directly 
 * to isolate whether the issue is the API key, the endpoint, or the app logic.
 */

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL_COACH || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

console.log('--- Raw Gemini API Test ---');
console.log('API_KEY present:', API_KEY ? `Yes (${API_KEY.length} chars, starts: ${API_KEY.slice(0, 6)}...)` : 'NO');
console.log('MODEL:', MODEL);

async function testRaw() {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  console.log('Endpoint:', endpoint);

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Responde con un JSON: {"ok": true, "message": "hola"}' }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 100,
      responseMimeType: 'application/json',
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': API_KEY,
      },
      body: JSON.stringify(body),
    });

    console.log('HTTP Status:', response.status, response.statusText);
    const data = await response.text();
    console.log('Response body (first 800 chars):', data.slice(0, 800));

    if (response.ok) {
      try {
        const parsed = JSON.parse(data);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log('\n✅ SUCCESS! Model response text:', text);
      } catch (e) {
        console.log('\n⚠️ Response was OK but could not parse JSON:', e.message);
      }
    } else {
      console.log('\n❌ FAILED! HTTP', response.status);
    }
  } catch (error) {
    console.error('\n❌ NETWORK ERROR:', error.message);
  }
}

testRaw();
