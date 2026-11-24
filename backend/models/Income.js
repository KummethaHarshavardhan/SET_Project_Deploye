import mongoose from 'mongoose';

const incomeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Users',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
   
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      default: 'Salary',
    },
    sender: {
      type: String,
      trim: true,
      default: '',
    },
    paymentMethod: {
      type: String,
      trim: true,
      default: 'Cash',
    },
    source: {
      type: String,
      enum: ['manual', 'voice', 'phonepe'],
      default: 'manual',
    },
    transactionId: {
      type: String,
      trim: true,
      default: null,
    },
    voiceExtractionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VoiceExtraction',
      default: null,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true, 
      transform: (doc, ret) => {
        if (ret.date instanceof Date) {
          ret.date = ret.date.toISOString().split('T')[0];
        }
        delete ret.__v;
        return ret;
      },
    },
  }
);

incomeSchema.index({ user: 1, date: -1 });

export default mongoose.model('Income', incomeSchema);
