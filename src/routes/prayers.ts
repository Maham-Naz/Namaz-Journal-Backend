import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get prayers for a whole month
router.get('/', authenticate, async (req, res) => {
  try {
    const { month } = req.query; // format: YYYY-MM
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Valid month query parameter is required (YYYY-MM)' });
    }

    // SQLite string comparison works lexicographically, which is perfect for ISO dates
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const prayers = await prisma.prayerRecord.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    res.json(prayers);
  } catch (error) {
    console.error('Error fetching month prayers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get prayers for a specific year
router.get('/year', authenticate, async (req, res) => {
  try {
    const { year } = req.query;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!year || typeof year !== 'string' || !/^\d{4}$/.test(year)) {
      return res.status(400).json({ error: 'Valid year query parameter is required (YYYY)' });
    }

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const prayers = await prisma.prayerRecord.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate }
      },
      orderBy: { date: 'asc' }
    });

    res.json(prayers);
  } catch (error) {
    console.error('Error fetching year prayers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get overall stats and streaks
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const allRecords = await prisma.prayerRecord.findMany({
      where: { userId },
      orderBy: { date: 'asc' } // Oldest to newest
    });

    let currentStreak = 0;
    let longestStreak = 0;
    let totalDays = allRecords.length;
    let completedDays = 0;
    let totalFajr = 0, totalDhuhr = 0, totalAsr = 0, totalMaghrib = 0, totalIsha = 0;
    
    // Group by month to find the most consistent month
    const monthCounts: Record<string, { total: number, completed: number }> = {};

    let tempStreak = 0;

    // To calculate missed days, we could check the gap between first record and today,
    // but for simplicity, we define "Missed Days" as the days they entered a record but didn't complete all 6.
    // Or we can just count days since first tracking day that aren't fully completed.
    // We'll stick to: missed = totalDays - completedDays for now.
    
    // Streak logic requires checking consecutive days. 
    // We'll iterate through all records.
    let lastDateObj: Date | null = null;

    for (const record of allRecords) {
      const isCompleted = record.fajr && record.dhuhr && record.asr && record.maghrib && record.isha;
      
      if (record.fajr) totalFajr++;
      if (record.dhuhr) totalDhuhr++;
      if (record.asr) totalAsr++;
      if (record.maghrib) totalMaghrib++;
      if (record.isha) totalIsha++;
      
      if (isCompleted) {
        completedDays++;
      }

      const monthKey = record.date.substring(0, 7); // YYYY-MM
      if (!monthCounts[monthKey]) monthCounts[monthKey] = { total: 0, completed: 0 };
      monthCounts[monthKey].total++;
      if (isCompleted) monthCounts[monthKey].completed++;

      // Streak calc
      const currentDateObj = new Date(record.date);
      if (isCompleted) {
        if (!lastDateObj) {
          tempStreak = 1;
        } else {
          // Check if it's the exact next day
          const diffTime = Math.abs(currentDateObj.getTime() - lastDateObj.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            tempStreak++;
          } else {
            tempStreak = 1; // reset streak
          }
        }
        if (tempStreak > longestStreak) longestStreak = tempStreak;
        lastDateObj = currentDateObj;
      } else {
        tempStreak = 0;
        lastDateObj = null; // Break streak
      }
    }
    
    // Current streak validation - if last completed day is not today or yesterday, streak is 0.
    if (lastDateObj) {
        const today = new Date();
        // Zero out time
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const lastZero = new Date(lastDateObj.getFullYear(), lastDateObj.getMonth(), lastDateObj.getDate());
        
        const diffTime = Math.abs(todayZero.getTime() - lastZero.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 1) {
            currentStreak = tempStreak;
        } else {
            currentStreak = 0;
        }
    }

    const missedDays = totalDays - completedDays;

    // Find most consistent month
    let mostConsistentMonth = '';
    let highestRatio = -1;
    for (const [month, counts] of Object.entries(monthCounts)) {
      if (counts.total > 0) {
        const ratio = counts.completed / counts.total;
        if (ratio > highestRatio) {
          highestRatio = ratio;
          mostConsistentMonth = month;
        }
      }
    }

    res.json({
      totalDays,
      completedDays,
      missedDays,
      currentStreak,
      longestStreak,
      mostConsistentMonth,
      breakdown: {
        fajr: totalFajr,
        dhuhr: totalDhuhr,
        asr: totalAsr,
        maghrib: totalMaghrib,
        isha: totalIsha
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get prayers for a specific date
router.get('/:date', authenticate, async (req, res) => {
  try {
    const dateParam = req.params.date;
    const date = Array.isArray(dateParam) ? dateParam[0] : dateParam; // format: YYYY-MM-DD
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
    }

    const record = await prisma.prayerRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date
        }
      }
    });

    res.json({ record });
  } catch (error) {
    console.error('Error fetching daily prayers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upsert (create or update) prayers for a specific date
router.put('/:date', authenticate, async (req, res) => {
  try {
    const dateParam = req.params.date;
    const date = Array.isArray(dateParam) ? dateParam[0] : dateParam; // format: YYYY-MM-DD
    const userId = req.user?.userId;
    const { fajr, dhuhr, asr, maghrib, isha, notes } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
    }

    const updateData = {
      fajr: Boolean(fajr),
      dhuhr: Boolean(dhuhr),
      asr: Boolean(asr),
      maghrib: Boolean(maghrib),
      isha: Boolean(isha),
      notes: typeof notes === 'string' ? notes : null
    };

    const record = await prisma.prayerRecord.upsert({
      where: {
        userId_date: {
          userId,
          date
        }
      },
      update: updateData,
      create: {
        userId,
        date,
        ...updateData
      }
    });

    res.json({ record });
  } catch (error) {
    console.error('Error updating daily prayers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export all prayer data
router.get('/export', authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const allRecords = await prisma.prayerRecord.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        fajr: true,
        dhuhr: true,
        asr: true,
        maghrib: true,
        isha: true,
        notes: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json(allRecords);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import prayer data
router.post('/import', authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const records = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'Invalid data format. Expected an array of records.' });
    }

    let successCount = 0;
    let errorCount = 0;

    for (const record of records) {
      if (!record.date || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
        errorCount++;
        continue;
      }

      const updateData = {
        fajr: Boolean(record.fajr),
        dhuhr: Boolean(record.dhuhr),
        asr: Boolean(record.asr),
        maghrib: Boolean(record.maghrib),
        isha: Boolean(record.isha),
        notes: typeof record.notes === 'string' ? record.notes : null
      };

      try {
        await prisma.prayerRecord.upsert({
          where: { userId_date: { userId, date: record.date } },
          update: updateData,
          create: { userId, date: record.date, ...updateData }
        });
        successCount++;
      } catch (err) {
        errorCount++;
      }
    }

    res.json({ message: 'Import completed', successCount, errorCount });
  } catch (error) {
    console.error('Error importing data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
