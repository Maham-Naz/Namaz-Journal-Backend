import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth';
import prayerRoutes from './routes/prayers';
import userRoutes from './routes/user';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:5173', 
  process.env.FRONTEND_URL
].filter(Boolean);

// Update CORS to allow credentials (cookies)
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Basic health check
app.get("/", (req, res) => {
  res.send("Namaz Journal Backend Running 🚀");
});

// Authentication routes
app.use('/api/auth', authRoutes);

// User settings routes
app.use('/api/user', userRoutes);

// Prayer tracking routes
app.use('/api/prayers', prayerRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
