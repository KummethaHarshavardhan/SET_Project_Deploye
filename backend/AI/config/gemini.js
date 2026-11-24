import { GoogleGenAI } from '@google/genai';

let cachedClient = null;
let cachedKey = null;

/**
 * Returns the configured Gemini model name.
 * Defaults to gemini-3.8-flash (supports multimodal audio + structured JSON).
 */
const getGeminiModel = () => {
  return process.env.GEMINI_MODEL || 'gemini-3.8-flash';
};

/**
 * Returns the configured Gemini embedding model name.
 */
const getEmbeddingModel = () => {
  return process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
};

/**
 * Returns an initialized GoogleGenAI client using GEMINI_API_KEY from env.
 * Throws a clear error if the key is missing or still a placeholder.
 */
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_google_gemini_api_key') {
    const err = new Error(
      'GEMINI_API_KEY is not configured. Set a valid key in backend/.env.'
    );
    err.statusCode = 503;
    throw err;
  }

  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedKey = apiKey;
  }

  return cachedClient;
};

export {
  getGeminiClient,
  getGeminiModel,
  getEmbeddingModel,
};
