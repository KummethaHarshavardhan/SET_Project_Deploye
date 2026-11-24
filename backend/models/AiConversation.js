import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    extractionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VoiceExtraction',
      default: null,
    },
    transactionPreview: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    previewStatus: {
      type: String,
      enum: ['none', 'pending', 'confirmed', 'cancelled'],
      default: 'none',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const aiConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Users',
      required: true,
      unique: true,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model('AiConversation', aiConversationSchema);
