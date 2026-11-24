import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.join(__dirname, '.env') });

import './config/db.js';

import authRoutes from './routes/authRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import incomeRoutes from './routes/incomeRoutes.js';
import recordingRoutes from './routes/recordingRoutes.js';
import voiceRoutes from './AI/routes/voiceRoutes.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import socketUtil from './utils/socket.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running...');
});

app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/voice', voiceRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 8678;
const server = http.createServer(app);

socketUtil.init(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
