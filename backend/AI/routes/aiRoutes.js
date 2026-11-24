import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import asyncHandler from '../../utils/asyncHandler.js';
import { protect } from '../../middleware/authMiddleware.js';
import AiConversation from '../../models/AiConversation.js';
import VoiceExtraction from '../../models/VoiceExtraction.js';
import { runAssistantTurn } from '../services/assistantService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Simple per-user rate limiter (30 requests / 60s)
const userRateMap = new Map();
const rateLimitAi = (req, res, next) => {
  const uid = req.user._id.toString();
  const now = Date.now();
  const entry = userRateMap.get(uid) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60000;
  }
  entry.count += 1;
  userRateMap.set(uid, entry);
  if (entry.count > 30) {
    return res
      .status(429)
      .json({ message: 'Too many AI requests. Please wait a moment.' });
  }
  next();
};

const tempDir = path.join(__dirname, '..', '..', 'uploads', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `ai-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype &&
      (file.mimetype.startsWith('audio/') ||
        file.mimetype === 'video/webm' ||
        file.mimetype === 'application/octet-stream')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed.'), false);
    }
  },
});

const optionalAudioUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  upload.single('audio')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Audio upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

router.use(protect);

/**
 * @route GET /api/ai/health
 * @desc  Check backend + Gemini configuration status
 */
router.get('/health', (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  const geminiConfigured = Boolean(key && key !== 'your_google_gemini_api_key');
  res.status(200).json({
    ok: true,
    dbConnected: true,
    geminiConfigured,
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  });
});

/**
 * @route GET /api/ai/history
 * @desc  Restore authenticated user's AI conversation history
 */
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const convo = await AiConversation.findOne({ user: req.user._id });
    res.status(200).json({ messages: convo ? convo.messages.slice(-50) : [] });
  })
);

/**
 * @route DELETE /api/ai/history
 * @desc  Clear authenticated user's AI conversation history
 */
router.delete(
  '/history',
  asyncHandler(async (req, res) => {
    await AiConversation.findOneAndUpdate(
      { user: req.user._id },
      { messages: [] },
      { upsert: true }
    );
    res.status(200).json({ message: 'Conversation cleared.' });
  })
);

/**
 * @route POST /api/ai/chat
 * @desc  Conversational AI endpoint supporting text or voice audio for Q&A and transaction extraction
 */
router.post(
  '/chat',
  rateLimitAi,
  optionalAudioUpload,
  asyncHandler(async (req, res) => {
    const text = req.body?.message || '';
    const language = req.body?.language || 'en-IN';

    if (!req.file && (!text || !text.trim())) {
      return res.status(400).json({ message: 'Please enter a message or record audio.' });
    }

    let convo = await AiConversation.findOne({ user: req.user._id });
    if (!convo) {
      convo = await AiConversation.create({ user: req.user._id, messages: [] });
    }

    try {
      const result = await runAssistantTurn({
        userId: req.user._id,
        text,
        filePath: req.file ? req.file.path : null,
        mimeType: req.file ? req.file.mimetype : 'audio/webm',
        language,
        history: convo.messages,
      });

      let extractionDoc = null;
      if (result.transactions.length > 0) {
        extractionDoc = await VoiceExtraction.create({
          user: req.user._id,
          transcript: result.userTranscript,
          extractedTransactions: result.transactions,
          status: 'pending',
        });
      }

      const userMsg = {
        role: 'user',
        text: result.userTranscript || '(Voice message)',
        timestamp: new Date(),
      };

      const aiMsg = {
        role: 'assistant',
        text: result.reply,
        extractionId: extractionDoc ? extractionDoc._id : null,
        transactionPreview: result.transactions,
        previewStatus: result.transactions.length > 0 ? 'pending' : 'none',
        timestamp: new Date(),
      };

      convo.messages.push(userMsg, aiMsg);
      if (convo.messages.length > 60) {
        convo.messages = convo.messages.slice(-60);
      }
      await convo.save();

      const savedAiMsg = convo.messages[convo.messages.length - 1];
      const savedUserMsg = convo.messages[convo.messages.length - 2];

      res.status(200).json({
        userMessage: savedUserMsg,
        aiMessage: savedAiMsg,
        intent: result.intent,
        extractionId: extractionDoc ? extractionDoc._id : null,
        transactions: result.transactions,
        needsClarification: result.needsClarification,
      });
    } finally {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
    }
  })
);

/**
 * @route PATCH /api/ai/message/:messageId/status
 * @desc  Update transaction preview status ('confirmed' | 'cancelled') in conversation history
 */
router.patch(
  '/message/:messageId/status',
  asyncHandler(async (req, res) => {
    const { status, replyText } = req.body;
    if (!['confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    const convo = await AiConversation.findOne({ user: req.user._id });
    if (!convo) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    const msg = convo.messages.id(req.params.messageId);
    if (msg) {
      msg.previewStatus = status;
    }
    if (replyText) {
      convo.messages.push({
        role: 'assistant',
        text: replyText,
        timestamp: new Date(),
      });
    }
    await convo.save();

    res.status(200).json({ messages: convo.messages.slice(-50) });
  })
);

export default router;
