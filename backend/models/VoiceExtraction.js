import mongoose from 'mongoose';

const extractedItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['income', 'expense', 'unknown'],
      required: true,
    },
    title: { type: String, trim: true, default: '' },
    amount: { type: Number, default: null },
    sender: { type: String, trim: true, default: '' },
    receiver: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    paymentMethod: { type: String, trim: true, default: 'Cash' },
    description: { type: String, trim: true, default: '' },
    date: { type: String, trim: true, default: '' },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    needsClarification: { type: Boolean, default: false },
    clarificationQuestion: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const voiceExtractionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Users',
      required: true,
    },
    transcript: {
      type: String,
      trim: true,
      default: '',
    },
    extractedTransactions: {
      type: [extractedItemSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
    recordingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recording',
      default: null,
    },
    savedExpenseIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense',
      },
    ],
    savedIncomeIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Income',
      },
    ],
  },
  { timestamps: true }
);

voiceExtractionSchema.index({ user: 1, createdAt: -1 });
voiceExtractionSchema.index({ user: 1, status: 1 });

export default mongoose.model('VoiceExtraction', voiceExtractionSchema);
