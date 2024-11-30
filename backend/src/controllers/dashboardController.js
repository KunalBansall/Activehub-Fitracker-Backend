const Member = require('../models/Member');
const Attendance = require('../models/Attendance');

exports.getStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setHours(0, 0, 0, 0);

    // Total members
    const totalMembers = await Member.countDocuments();
    const lastMonthMembers = await Member.countDocuments({
      createdAt: { $lt: lastMonth }
    });
    const memberGrowth = ((totalMembers - lastMonthMembers) / lastMonthMembers * 100).toFixed(1);

    // Active today
    const activeToday = await Attendance.distinct('memberId', {
      entryTime: { $gte: today }
    }).countDocuments();
    
    const activePreviousMonth = await Attendance.distinct('memberId', {
      entryTime: {
        $gte: lastMonth,
        $lt: today
      }
    }).countDocuments();
    const activeGrowth = ((activeToday - activePreviousMonth) / activePreviousMonth * 100).toFixed(1);

    // New joins this month
    const newJoins = await Member.countDocuments({
      createdAt: { $gte: lastMonth }
    });
    
    const previousMonthStart = new Date(lastMonth);
    previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);
    
    const previousMonthJoins = await Member.countDocuments({
      createdAt: {
        $gte: previousMonthStart,
        $lt: lastMonth
      }
    });
    const joinsGrowth = ((newJoins - previousMonthJoins) / previousMonthJoins * 100).toFixed(1);

    // Expiring soon
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    
    const expiringSoon = await Member.countDocuments({
      membershipEndDate: {
        $lte: fiveDaysFromNow,
        $gt: today
      }
    });
    
    const previousMonthExpiring = await Member.countDocuments({
      membershipEndDate: {
        $lte: lastMonth,
        $gt: new Date(lastMonth.getTime() - 5 * 24 * 60 * 60 * 1000)
      }
    });
    const expiringGrowth = ((expiringSoon - previousMonthExpiring) / previousMonthExpiring * 100).toFixed(1);

    res.json({
      totalMembers: {
        count: totalMembers,
        growth: memberGrowth
      },
      activeToday: {
        count: activeToday,
        growth: activeGrowth
      },
      newJoins: {
        count: newJoins,
        growth: joinsGrowth
      },
      expiringSoon: {
        count: expiringSoon,
        growth: expiringGrowth
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};