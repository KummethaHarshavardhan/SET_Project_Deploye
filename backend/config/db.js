const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectDB = async () => {
  if (!process.env.MONGO_URL) {
    console.error('MONGO_URL is not set. Add it to your environment variables.');
    return;
  }
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Database Connected Successfully');
  } catch (err) {
    // Log only the message, never the connection string
    console.error(`Database is not connected: ${err.message}`);
  }
};

connectDB();
module.exports = mongoose;
