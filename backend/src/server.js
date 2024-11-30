const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/database");
const authRoutes = require("./routes/auth");
const memberRoutes = require("./routes/members");
const attendanceRoutes = require("./routes/attendance");
const dashboardRoutes = require("./routes/dashboard");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Serve the frontend build in production
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../frontend/dist");

  // Serve static files from the frontend build folder
  app.use(express.static(frontendPath));

  // Serve index.html for non-API routes
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(frontendPath, "index.html"));
  });
}

// Test endpoint for API
app.get("/api", (req, res) => {
  res.json({ message: "API is working" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
