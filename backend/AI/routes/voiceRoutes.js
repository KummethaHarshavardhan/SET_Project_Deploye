import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import asyncHandler from '../../utils/asyncHandler.js';
import { protect } from '../../middleware/authMiddleware.js';
import Expense from '../../models/Expense.js';
import Income from '../../models/Income.js';
import Recording from '../../models/Recording.js';
import VoiceExtraction from '../../models/VoiceExtraction.js';
import socketUtil from '../../utils/socket.js';
import { extractTransactionsFromVoice } from '../services/transactionExtractionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'recordings');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `voice-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype &&
    (file.mimetype.startsWith('audio/') ||
      file.mimetype === 'video/webm' ||
      file.mimetype === 'application/octet-stream')
  ) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only audio files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter,
});

const handleAudioUpload = (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Audio file is too large. Max size is 25 MB.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

router.use(protect);

/**
 * @route POST /api/voice/process
 * @desc  Process recorded audio (or transcript) with Gemini AI and return structured transactions for confirmation.
 *        Temporary audio is deleted unless saveRecording === 'true'.
 */
router.post(
  '/process',
  handleAudioUpload,
  asyncHandler(async (req, res) => {
    const { transcript, duration, recordedAt, saveRecording } = req.body;
    const shouldSaveRecording = saveRecording === 'true' || saveRecording === true;

    if (!req.file && (!transcript || !transcript.trim())) {
      return res.status(400).json({ message: 'Please provide an audio recording or transcript.' });
    }

    let recordingDoc = null;
    try {
      const result = await extractTransactionsFromVoice({
        filePath: req.file ? req.file.path : null,
        mimeType: req.file ? req.file.mimetype : 'audio/webm',
        transcript: transcript || '',
      });

      if (req.file && shouldSaveRecording) {
        recordingDoc = await Recording.create({
          user: req.user._id,
          file_name: req.file.originalname || req.file.filename,
          file_path: req.file.path.replace(/\\/g, '/'),
          mime_type: req.file.mimetype || 'audio/webm',
          duration: duration ? Number(duration) : 0,
          transcript: result.transcript,
          aiProcessed: true,
          created_at: recordedAt ? new Date(recordedAt) : new Date(),
        });
      }

      const extraction = await VoiceExtraction.create({
        user: req.user._id,
        transcript: result.transcript,
        extractedTransactions: result.transactions,
        status: 'pending',
        recordingId: recordingDoc ? recordingDoc._id : null,
      });

      res.status(200).json({
        extractionId: extraction._id,
        transcript: result.transcript,
        transactions: result.transactions,
        needsClarification: result.needsClarification,
        recordingSaved: Boolean(recordingDoc),
      });
    } finally {
      // Privacy: remove temporary audio file if user did not opt to save recording
      if (req.file && !shouldSaveRecording && fs.existsSync(req.file.path)) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
    }
  })
);

/**
 * @route POST /api/voice/confirm
 * @desc  Validate and save user-confirmed transactions from a voice extraction into MongoDB.
 */
router.post(
  '/confirm',
  asyncHandler(async (req, res) => {
    const { extractionId, transactions } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ message: 'At least one valid transaction is required.' });
    }

    let extraction = null;
    if (extractionId) {
      extraction = await VoiceExtraction.findOne({
        _id: extractionId,
        user: req.user._id,
      });
      if (!extraction) {
        return res.status(404).json({ message: 'Voice extraction record not found.' });
      }
      if (extraction.status === 'confirmed') {
        return res.status(400).json({ message: 'These voice transactions have already been saved.' });
      }
    }

    // Strict backend validation before saving anything
    const validatedItems = [];
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      if (!tx || !['income', 'expense'].includes(tx.type)) {
        return res.status(400).json({
          message: `Transaction #${i + 1}: type must be "income" or "expense".`,
        });
      }
      const amount = Number(tx.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          message: `Transaction #${i + 1}: amount must be a positive number.`,
        });
      }
      const parsedDate = tx.date ? new Date(tx.date) : new Date();
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          message: `Transaction #${i + 1}: invalid date.`,
        });
      }

      validatedItems.push({
        type: tx.type,
        title: (tx.title || '').trim() || (tx.type === 'income' ? 'Voice Income' : 'Voice Expense'),
        amount: Math.round(amount * 100) / 100,
        category: (tx.category || '').trim() || (tx.type === 'income' ? 'Other Income' : 'Others'),
        paymentMethod: (tx.paymentMethod || '').trim() || 'Cash',
        sender: (tx.sender || '').trim(),
        receiver: (tx.receiver || '').trim(),
        description: (tx.description || '').trim(),
        date: parsedDate,
      });
    }

    const createdIncomes = [];
    const createdExpenses = [];

    for (const item of validatedItems) {
      if (item.type === 'income') {
        const inc = await Income.create({
          user: req.user._id,
          title: item.title,
          amount: item.amount,
          category: item.category,
          sender: item.sender,
          paymentMethod: item.paymentMethod,
          source: 'voice',
          voiceExtractionId: extraction ? extraction._id : null,
          date: item.date,
          description: item.description,
        });
        createdIncomes.push(inc);
        try {
          socketUtil.getIo().to(req.user._id.toString()).emit('dataUpdated', {
            resource: 'income',
            action: 'create',
            payload: inc,
          });
        } catch (e) {}
      } else {
        const exp = await Expense.create({
          user: req.user._id,
          title: item.title,
          amount: item.amount,
          category: item.category,
          paymentMethod: item.paymentMethod,
          receiver: item.receiver,
          source: 'voice',
          voiceExtractionId: extraction ? extraction._id : null,
          date: item.date,
          description: item.description,
        });
        createdExpenses.push(exp);
        try {
          socketUtil.getIo().to(req.user._id.toString()).emit('dataUpdated', {
            resource: 'expense',
            action: 'create',
            payload: exp,
          });
        } catch (e) {}
      }
    }

    if (extraction) {
      extraction.status = 'confirmed';
      extraction.savedIncomeIds = createdIncomes.map((i) => i._id);
      extraction.savedExpenseIds = createdExpenses.map((e) => e._id);
      await extraction.save();
    }

    res.status(201).json({
      message: 'Transactions saved successfully.',
      incomes: createdIncomes,
      expenses: createdExpenses,
    });
  })
);

/**
 * @route POST /api/voice/cancel
 * @desc  Mark a pending voice extraction as cancelled.
 */
router.post(
  '/cancel',
  asyncHandler(async (req, res) => {
    const { extractionId } = req.body;
    if (extractionId) {
      await VoiceExtraction.findOneAndUpdate(
        { _id: extractionId, user: req.user._id, status: 'pending' },
        { status: 'cancelled' }
      );
    }
    res.status(200).json({ message: 'Voice extraction cancelled.' });
  })
);

export default router;
