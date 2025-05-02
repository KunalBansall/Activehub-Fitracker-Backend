const Admin = require("../models/Admin");
const restrictWriteAccess = async (req, res, next) => {
    try {
      // ✅ Use req.admin instead of req.user
      if (!req.admin || !req.admin._id) {
        return res.status(401).json({ message: "Unauthorized. Admin not found." });
      }
  
      const adminId = req.admin._id;
      const admin = await Admin.findById(adminId);
  
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }
  
      const status = admin.subscriptionStatus;
      const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
  
      if ((status === "expired" || status === "cancelled") && writeMethods.includes(req.method)) {
        return res.status(403).json({
          message: "Your subscription has expired. Please renew to make changes.",
        });
      }
  
      if (status === "grace" && writeMethods.includes(req.method)) {
        return res.status(403).json({
          message: "You are in grace period. Upgrade to make changes.",
        });
      }
  
      next();
    } catch (error) {
      console.error("Subscription middleware error:", error);
      res.status(500).json({ message: "Server error" });
    }
  };
  
  module.exports = { restrictWriteAccess };
  