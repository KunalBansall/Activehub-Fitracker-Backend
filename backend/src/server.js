const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const connectDB = require("./config/database");
const setupCronJobs = require('./cron');
const authRoutes = require("./routes/auth");
const memberRoutes = require("./routes/members");
const attendanceRoutes = require("./routes/attendance");
const dashboardRoutes = require("./routes/dashboard");
const adminRoutes = require("./routes/admin");
const memberAuthRoutes = require("./routes/memberAuth");
const memberAttendence = require("./routes/memberAttendence");
const productRoutes = require("./routes/products");
const memberProductRoutes = require("./routes/memberProducts");
const publicProductRoutes = require("./routes/publicProducts");
const orderRoutes = require("./routes/orders");
const memberOrderRoutes = require("./routes/memberOrders");
const adRoutes = require("./routes/ads");
const announcementRoutes = require("./routes/announcements");
const memberAnnouncementRoutes = require("./routes/memberAnnouncements");
const publicAnnouncementRoutes = require("./routes/publicAnnouncements");
const workoutRoutes = require("./routes/workouts");
const settingsRoutes = require("./routes/settings");

const app = express();
connectDB();

// Initialize cron jobs after DB connection
setupCronJobs();

const allowedOrigins = [
  "https://activehub-fitracker.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
];





app.use(
  cors({
    origin: function (origin, callback) {
      // Reject requests without an origin or from disallowed origins
      if (!origin || !allowedOrigins.includes(origin)) {
        return callback(new Error("Not allowed by CORS"));
      }
      // Allow requests from allowed origins
      return callback(null, true);
    },
    credentials: true, // Allow cookies or credentials if needed
  })
);
// app.use(
//   cors({
//     origin: "*",
//   })
// );

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
console.log("Frontend URL from .env:", process.env.FRONTEND_URL);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/member-auth", memberAuthRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/member-attendance", memberAttendence);
app.use("/api/products", productRoutes);
app.use("/api/member/products", memberProductRoutes);
app.use("/api/public/products", publicProductRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/member/orders", memberOrderRoutes);
app.use("/api/ads", adRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/member/announcements", memberAnnouncementRoutes);
app.use("/api/public/announcements", publicAnnouncementRoutes);
app.use("/api/workouts", workoutRoutes);
app.use("/api/settings", settingsRoutes);

// Define a root route (optional)
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

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
