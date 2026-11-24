import fs from 'fs';
import { Type } from '@google/genai';
import { generateContentWithRetry, getGeminiModel } from '../config/gemini.js';
import { getUserFinancialContext, tryDirectMongoAnswer } from './financialQueryService.js';
import { buildAssistantPrompt } from '../prompts/assistantPrompt.js';
import { normalizeTransaction } from './transactionExtractionService.js';

const ASSISTANT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: ['transaction', 'question'],
    },
    userTranscript: {
      type: Type.STRING,
      description: 'Verbatim user text or audio transcript',
    },
    reply: {
      type: Type.STRING,
      description: 'Conversational AI assistant response',
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
  required: ['intent', 'userTranscript', 'reply', 'transactions'],
};

/**
 * Deterministic fallback parser for clear transaction sentences
 * when Gemini is temporarily unavailable (503/504).
 */
const tryFallbackParseTransactions = (text, todayIso) => {
  const clauses = text
    .split(/(?:,|;|\band\b)/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const isYesterday = /\byesterday\b/i.test(text);
  const resolvedDate = isYesterday ? yesterdayDate : todayIso;

  const results = [];
  for (const clause of clauses) {
    const amtMatch = clause.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i);
    if (!amtMatch) continue;
    const amount = Number(amtMatch[1]);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const isIncome = /\b(received|sent me|earned|salary|income|got)\b/i.test(clause);
    const isExpense = /\b(spent|spend|paid|bought|expense)\b/i.test(clause);
    if (!isIncome && !isExpense && results.length === 0) continue;

    const type = isIncome ? 'income' : 'expense';
    let category = type === 'income' ? 'Other Income' : 'Others';
    let title = type === 'income' ? 'Income' : 'Expense';
    let sender = '';

    if (type === 'expense') {
      if (/food|lunch|dinner|breakfast|meal|restaurant/i.test(clause)) {
        category = 'Food';
        title = 'Food expense';
      } else if (/grocer/i.test(clause)) {
        category = 'Food';
        title = 'Groceries';
      } else if (/petrol|fuel|diesel|uber|bus|train|travel/i.test(clause)) {
        category = 'Travel';
        title = /petrol/i.test(clause) ? 'Petrol' : 'Travel expense';
      } else if (/shop|cloth|amazon|flipkart/i.test(clause)) {
        category = 'Shopping';
        title = 'Shopping';
      } else if (/bill|electricity|water|wifi|rent/i.test(clause)) {
        category = 'Bills';
        title = 'Bill payment';
      }
    } else {
      const fromMatch = clause.match(/from\s+([a-zA-Z]+)/i) || clause.match(/^([a-zA-Z]+)\s+sent/i);
      if (fromMatch && fromMatch[1]) {
        sender = fromMatch[1];
        title = `Money received from ${sender}`;
      }
    }

    const paymentMethod = /phonepe/i.test(clause)
      ? 'PhonePe'
      : /upi|gpay|paytm/i.test(clause)
      ? 'UPI'
      : 'Cash';

    results.push(
      normalizeTransaction(
        {
          type,
          title,
          amount,
          sender,
          category,
          paymentMethod,
          description: title,
          date: resolvedDate,
          confidence: 0.85,
          needsClarification: false,
        },
        todayIso
      )
    );
  }

  return results;
};

const runAssistantTurn = async ({
  userId,
  text = '',
  filePath = null,
  mimeType = 'audio/webm',
  language = 'en-IN',
  history = [],
}) => {
  const todayIso = new Date().toISOString().split('T')[0];

  // 1. Direct MongoDB fast-path for text financial queries (instant, works even if Gemini is 503)
  if (!filePath && text && text.trim()) {
    const directAnswer = await tryDirectMongoAnswer({ userId, text, history });
    if (directAnswer) {
      return {
        intent: 'question',
        userTranscript: text.trim(),
        reply: directAnswer,
        transactions: [],
        needsClarification: false,
        geminiUsed: false,
      };
    }
  }

  const financialContext = await getUserFinancialContext(userId);
  const recentHistory = history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const systemPrompt = buildAssistantPrompt({
    financialContext,
    historyText: recentHistory,
    language,
  });

  const contents = [];
  if (filePath) {
    const audioBuffer = await fs.promises.readFile(filePath);
    const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim();
    contents.push({
      inlineData: {
        data: audioBuffer.toString('base64'),
        mimeType: cleanMime === 'video/webm' ? 'audio/webm' : cleanMime,
      },
    });
    contents.push(
      `${systemPrompt}\n\nTranscribe the user's audio into "userTranscript" and respond.`
    );
  } else {
    contents.push(`${systemPrompt}\n\nUser message:\n"${text.trim()}"`);
  }

  try {
    const response = await generateContentWithRetry({
      model: getGeminiModel(),
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: ASSISTANT_RESPONSE_SCHEMA,
        temperature: 0.15,
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const userTranscript = (parsed.userTranscript || text || '').trim();
    const intent = parsed.intent === 'transaction' ? 'transaction' : 'question';
    const rawTx = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    const transactions =
      intent === 'transaction'
        ? rawTx.map((tx) => normalizeTransaction(tx, todayIso))
        : [];

    return {
      intent,
      userTranscript,
      reply: (parsed.reply || '').trim() || 'Here is what I found in your records.',
      transactions,
      needsClarification: transactions.some((t) => t.needsClarification),
      geminiUsed: true,
    };
  } catch (err) {
    // If Gemini is 503/504 on a text transaction sentence, use deterministic fallback
    if (!filePath && text && text.trim()) {
      const fallbackTxs = tryFallbackParseTransactions(text.trim(), todayIso);
      if (fallbackTxs.length > 0) {
        return {
          intent: 'transaction',
          userTranscript: text.trim(),
          reply: `I understood ${
            fallbackTxs.length === 1 ? 'your transaction' : `${fallbackTxs.length} transactions`
          }. Please review and confirm below.`,
          transactions: fallbackTxs,
          needsClarification: fallbackTxs.some((t) => t.needsClarification),
          geminiUsed: false,
        };
      }
    }
    throw err;
  }
};

export { runAssistantTurn };
