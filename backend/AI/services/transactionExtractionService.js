import fs from 'fs';
import { Type } from '@google/genai';
import { generateContentWithRetry, getGeminiModel } from '../config/gemini.js';
import { buildTransactionExtractionPrompt } from '../prompts/transactionPrompt.js';

const TRANSACTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.STRING,
      description: 'Clean verbatim transcript of what the user said',
    },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ['income', 'expense', 'unknown'] },
          title: { type: Type.STRING },
          amount: { type: Type.NUMBER, nullable: true },
          sender: { type: Type.STRING },
          receiver: { type: Type.STRING },
          category: { type: Type.STRING },
          paymentMethod: { type: Type.STRING },
          description: { type: Type.STRING },
          date: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          needsClarification: { type: Type.BOOLEAN },
          clarificationQuestion: { type: Type.STRING },
        },
        required: [
          'type',
          'title',
          'category',
          'paymentMethod',
          'description',
          'date',
          'confidence',
          'needsClarification',
        ],
      },
    },
  },
  required: ['transcript', 'transactions'],
};

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates and normalizes a single extracted transaction from Gemini.
 */
const normalizeTransaction = (tx, todayIso) => {
  const type = ['income', 'expense', 'unknown'].includes(tx?.type) ? tx.type : 'unknown';
  const rawAmount = tx?.amount;
  const amount =
    typeof rawAmount === 'number' && Number.isFinite(rawAmount) && rawAmount > 0
      ? Math.round(rawAmount * 100) / 100
      : null;

  const dateStr =
    typeof tx?.date === 'string' && ISO_DATE_REGEX.test(tx.date.trim())
      ? tx.date.trim()
      : todayIso;

  const confidence =
    typeof tx?.confidence === 'number' && Number.isFinite(tx.confidence)
      ? Math.min(Math.max(tx.confidence, 0), 1)
      : 0.5;

  const missingAmount = amount === null;
  const uncertainType = type === 'unknown';
  const lowConfidence = confidence < 0.6;
  const needsClarification = Boolean(
    tx?.needsClarification || missingAmount || uncertainType || lowConfidence
  );

  let clarificationQuestion = (tx?.clarificationQuestion || '').trim();
  if (needsClarification && !clarificationQuestion) {
    if (uncertainType) {
      clarificationQuestion = 'Is this transaction an Income or an Expense?';
    } else if (missingAmount) {
      clarificationQuestion = 'Please enter the exact amount for this transaction.';
    } else {
      clarificationQuestion = 'Please review and confirm the extracted details.';
    }
  }

  const defaultCategory = type === 'income' ? 'Other Income' : 'Others';

  return {
    type,
    title: (tx?.title || '').trim() || (type === 'income' ? 'Voice Income' : 'Voice Expense'),
    amount,
    sender: (tx?.sender || '').trim(),
    receiver: (tx?.receiver || '').trim(),
    category: (tx?.category || '').trim() || defaultCategory,
    paymentMethod: (tx?.paymentMethod || '').trim() || 'Cash',
    description: (tx?.description || '').trim(),
    date: dateStr,
    confidence,
    needsClarification,
    clarificationQuestion,
  };
};

/**
 * Extracts structured transactions from either an audio file or an existing transcript
 * using a single Gemini call where possible.
 */
const extractTransactionsFromVoice = async ({
  filePath = null,
  mimeType = 'audio/webm',
  transcript = '',
}) => {
  const model = getGeminiModel();
  const todayIso = new Date().toISOString().split('T')[0];
  const prompt = buildTransactionExtractionPrompt(todayIso);

  const contents = [];

  if (transcript && transcript.trim()) {
    contents.push(`${prompt}\n\nUser transcript:\n"${transcript.trim()}"`);
  } else if (filePath) {
    const audioBuffer = await fs.promises.readFile(filePath);
    const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim();
    contents.push({
      inlineData: {
        data: audioBuffer.toString('base64'),
        mimeType: cleanMime === 'video/webm' ? 'audio/webm' : cleanMime,
      },
    });
    contents.push(prompt);
  } else {
    const err = new Error('Either an audio file or a transcript is required.');
    err.statusCode = 400;
    throw err;
  }

  const response = await generateContentWithRetry({
    model,
    contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: TRANSACTION_RESPONSE_SCHEMA,
      temperature: 0.1,
    },
  });

  let parsed;
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch (e) {
    const err = new Error('Gemini returned an invalid JSON response.');
    err.statusCode = 502;
    throw err;
  }

  const finalTranscript = (parsed.transcript || transcript || '').trim();
  const rawList = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  const transactions = rawList.map((tx) => normalizeTransaction(tx, todayIso));

  const anyNeedsClarification =
    transactions.length === 0 || transactions.some((t) => t.needsClarification);

  return {
    transcript: finalTranscript,
    transactions,
    needsClarification: anyNeedsClarification,
  };
};

export {
  extractTransactionsFromVoice,
  normalizeTransaction,
};
