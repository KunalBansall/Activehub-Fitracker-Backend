const AdminLog = require("../models/AdminLog");

exports.getAdminLogs = async (req, res) => {
  try {
    const logs = await AdminLog.find()
      .populate("adminId", "username email gymName") // Populate admin details
      .sort({ timestamp: -1 }); // Sort by most recent

    res.status(200).json({ success: true, logs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
