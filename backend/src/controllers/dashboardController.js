const Member = require('../models/Member');
const Attendance = require('../models/Attendance');

// Dashboard Stats
exports.getStats = async (req, res) => {
  const adminGymId = req.admin._id; // Admin's gym ID from middleware

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setHours(0, 0, 0, 0);

    // Total Members
    const totalMembers = await Member.countDocuments({ gymId: adminGymId });
    const lastMonthMembers = await Member.countDocuments({
      gymId: adminGymId,
      createdAt: { $lt: lastMonth },
    });
    const memberGrowth = lastMonthMembers
      ? (((totalMembers - lastMonthMembers) / lastMonthMembers) * 100).toFixed(1)
      : 'N/A';

    // Active Today
    const activeToday = await Attendance.distinct('memberId', {
      entryTime: { $gte: today },
    }).then((ids) => Member.countDocuments({ _id: { $in: ids }, gymId: adminGymId }));

    const activePreviousMonth = await Attendance.distinct('memberId', {
      entryTime: { $gte: lastMonth, $lt: today },
    }).then((ids) => Member.countDocuments({ _id: { $in: ids }, gymId: adminGymId }));

    const activeGrowth = activePreviousMonth
      ? (((activeToday - activePreviousMonth) / activePreviousMonth) * 100).toFixed(1)
      : 'N/A';

    // New Joins This Month
    const newJoins = await Member.countDocuments({
      gymId: adminGymId,
      createdAt: { $gte: lastMonth },
    });

    const previousMonthStart = new Date(lastMonth);
    previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);

    const previousMonthJoins = await Member.countDocuments({
      gymId: adminGymId,
      createdAt: { $gte: previousMonthStart, $lt: lastMonth },
    });

    const joinsGrowth = previousMonthJoins
      ? (((newJoins - previousMonthJoins) / previousMonthJoins) * 100).toFixed(1)
      : 'N/A';

    // Expiring Soon
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);

    const expiringSoon = await Member.countDocuments({
      gymId: adminGymId,
      membershipEndDate: { $lte: fiveDaysFromNow, $gt: today },
    });

    const previousMonthExpiring = await Member.countDocuments({
      gymId: adminGymId,
      membershipEndDate: { $lte: lastMonth, $gt: new Date(lastMonth.getTime() - 5 * 24 * 60 * 60 * 1000) },
    });

    const expiringGrowth = previousMonthExpiring
      ? (((expiringSoon - previousMonthExpiring) / previousMonthExpiring) * 100).toFixed(1)
      : 'N/A';

    // Response
    res.json({
      totalMembers: {
        count: totalMembers,
        growth: memberGrowth,
      },
      activeToday: {
        count: activeToday,
        growth: activeGrowth,
      },
      newJoins: {
        count: newJoins,
        growth: joinsGrowth,
      },
      expiringSoon: {
        count: expiringSoon,
        growth: expiringGrowth,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
