import fs from 'fs';
import path from 'path';

// Parse .env.local manually to avoid needing dotenv
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

console.log('Testing GEMINI_API_KEY from .env.local:', apiKey ? `${apiKey.slice(0, 8)}...` : 'not configured');

const model = 'gemini-2.5-flash';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

async function main() {
  if (!apiKey) {
    console.error('No GEMINI_API_KEY found in .env.local');
    process.exit(1);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
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
    console.log('HTTP Status:', status);
    
    const text = await response.text();
    console.log('Response Content:', text);
  } catch (error) {
    console.error('Network Error:', error);
  }
}

main();
