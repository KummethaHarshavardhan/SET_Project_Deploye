import { GoogleGenAI } from '@google/genai';

let cachedClient = null;
let cachedKey = null;

/**
 * Returns the configured Gemini generation model name.
 */
const getGeminiModel = () => {
  return process.env.GEMINI_MODEL || 'gemini-3.8-flash';
};

/**
 * Returns the configured fallback Gemini generation model name.
 */
const getFallbackGeminiModel = () => {
  return process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash';
};

/**
 * Returns the configured Gemini embedding model name (kept separate from generation).
 */
const getEmbeddingModel = () => {
  return process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
};

/**
 * Returns an initialized GoogleGenAI client using GEMINI_API_KEY from env.
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isAuthOrClientError = (err) => {
  const status = err?.status || err?.statusCode || 0;
  return status === 400 || status === 401 || status === 403 || status === 404;
};

const isTransientError = (err) => {
  const status = err?.status || err?.statusCode || 0;
  return (
    status === 503 ||
    status === 429 ||
    status === 504 ||
    /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|timed out/i.test(err?.message || '')
  );
};

/**
 * Calls ai.models.generateContent with:
 * - Strict per-attempt timeout
 * - Exponential backoff with jitter for 503/429
 * - Automatic fallback to GEMINI_FALLBACK_MODEL on transient failures
 * - Immediate abort on 400/401/403/404 (never retries invalid keys)
 */
const generateContentWithRetry = async (
  params,
  { retries = 1, timeoutMs = 9500 } = {}
) => {
  const ai = getGeminiClient();
  const primaryModel = params.model || getGeminiModel();
  const fallbackModel = getFallbackGeminiModel();
  const modelsToTry =
    fallbackModel && fallbackModel !== primaryModel
      ? [primaryModel, fallbackModel]
      : [primaryModel];

  let lastErr;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            const tErr = new Error('Gemini AI request timed out.');
            tErr.statusCode = 504;
            reject(tErr);
          }, timeoutMs);
        });

        const response = await Promise.race([
          ai.models.generateContent({ ...params, model: modelName }),
          timeoutPromise,
        ]);
        return response;
      } catch (err) {
        lastErr = err;
        if (isAuthOrClientError(err)) {
          const authErr = new Error(
            err?.message || 'Gemini API authentication or model error.'
          );
          authErr.statusCode = err?.status || err?.statusCode || 400;
          throw authErr;
        }

        if (!isTransientError(err) || attempt === retries) {
          break;
        }

        const jitter = Math.floor(Math.random() * 250);
        const backoffMs = 500 * Math.pow(2, attempt) + jitter;
        await sleep(backoffMs);
      }
    }
  }

  const finalStatus = lastErr?.status || lastErr?.statusCode || 503;
  const friendlyErr = new Error(
    finalStatus === 504
      ? 'Gemini AI took too long to respond. MongoDB financial queries are still active — please retry.'
      : 'AI assistant is temporarily busy due to high demand. MongoDB financial queries still work — please retry.'
  );
  friendlyErr.statusCode = finalStatus === 504 ? 504 : 503;
  throw friendlyErr;
};

export {
  getGeminiClient,
  getGeminiModel,
  getFallbackGeminiModel,
  getEmbeddingModel,
  generateContentWithRetry,
};
