import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
let apiKey = '';

for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*GEMINI_API_KEY\s*=\s*["']?(.*?)["']?\s*$/);
  if (match) {
    apiKey = match[1];
    break;
  }
}

console.log('Testing GEMINI_API_KEY as Bearer Token:', apiKey ? `${apiKey.slice(0, 8)}...` : 'not configured');

const model = 'gemini-2.5-flash';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

async function main() {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hola, dime si respondes correctamente en una frase.' }]
          }
        ]
      })
    });

    const status = response.status;
    console.log('HTTP Status with Bearer Header:', status);
    
    const text = await response.text();
    console.log('Response Content:', text);
  } catch (error) {
    console.error('Network Error:', error);
  }
}

main();
