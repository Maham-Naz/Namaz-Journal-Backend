import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Update Profile (Name & Username)
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { fullName, username } = req.body;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!fullName || !username) {
      return res.status(400).json({ error: 'Full name and username are required' });
    }

    // Check if new username is taken by someone else
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== userId) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { fullName, username }
    });

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        username: updatedUser.username
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Password
router.put('/password', authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect current password' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Account
router.delete('/', authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { password } = req.body;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete account' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Delete user. Prisma handles cascading deletes for PrayerRecords based on schema configuration.
    await prisma.user.delete({ where: { id: userId } });

    // Clear session
    res.clearCookie('token');
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
