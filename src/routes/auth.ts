import crypto from "crypto";
import transporter from "../utils/mailer";
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-namaz-journal-key-2026';

// Regex for username validation
const USERNAME_REGEX = /^[a-zA-Z0-9_]{4,25}$/;

router.post('/register', async (req, res) => {
  try {
    const { fullName, username, email, password } = req.body;

    if (!fullName || !username || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({ error: 'Username must be 4-25 characters and contain only letters, numbers, and underscores.' });
    }

    if (password.length < 8 || password.length > 100) {
      return res.status(400).json({ error: 'Password must be between 8 and 100 characters.' });
    }

    // Check if username exists
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

      // Check if email exists
    const existingEmail = await prisma.user.findUnique({
    where: { email }
    });

    if (existingEmail) {
    return res.status(409).json({
      error: 'Email already exists.'
      });
    }


    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await prisma.user.create({
    data: {
      fullName,
      username,
      email,
      passwordHash
    }
    });

    // Generate token
    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '30d' });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ user: userWithoutPassword });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { username }
    });

    // Check if user exists and password is correct
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

     
    // Generate token
    const expiresIn = rememberMe ? '30d' : '1d';
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn });

    // Set cookie
    const cookieOptions: any = {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
    };

    if (rememberMe) {
      cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }
    // If not rememberMe, no maxAge is set, so it becomes a Session cookie

    res.cookie('token', token, cookieOptions);

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});


    //Forgot password
      router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email is required."
      });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Security: same response even if email doesn't exist
    if (!user) {
      return res.json({
        message: "If an account with that email exists, a reset link has been sent."
      });
    }

    // Generate token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetExpiry
      }
    });

    // Frontend URL
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send email
    console.log("Sending email to:", user.email);
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Reset Your Namaz Journal Password",
      html: `
        <h2>Forgot your password?</h2>
        <p>Click the button below to reset your password.</p>

        <a href="${resetLink}"
           style="
             display:inline-block;
             padding:12px 20px;
             background:#16a34a;
             color:white;
             text-decoration:none;
             border-radius:8px;
             font-weight:bold;
           ">
          Reset Password
        </a>

        <p>This link will expire in 15 minutes.</p>
      `
    });
    console.log("Email sent successfully");

    res.json({
      message: "If an account with that email exists, a reset link has been sent."
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Internal server error."
    });
  }
});


    // Reset password
router.post("/reset-password", async (req, res) => {
  try {
    console.log("🔐 Reset password request received.");

    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: "Token and password are required."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters."
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetExpiry: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      console.log("❌ Invalid or expired reset token.");

      return res.status(400).json({
        error: "Reset link is invalid or has expired."
      });
    }

    console.log("✅ User found:", user.email);

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        passwordHash,
        resetToken: null,
        resetExpiry: null
      }
    });

    console.log("✅ Password reset successfully for:", user.email);

    res.json({
      message: "Password reset successfully."
    });

  } catch (err) {
    console.error("❌ Reset password error:", err);

    res.status(500).json({
      error: "Internal server error."
    });
  }
});


router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
