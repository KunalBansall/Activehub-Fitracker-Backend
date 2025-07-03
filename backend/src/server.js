const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const connectDB = require("./config/database");
const { setupCronJobs } = require('./cron');

// Routes
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
const revenueRoutes = require("./routes/revenueRoutes");
const paymentRoutes = require("./routes/paymentsRoutes");
const ownerRoutes = require("./routes/owner");
const trainerRoutes = require("./routes/trainerRoutes");

const checkSubscription = require("./middleware/subscriptionCheck");

const app = express();
connectDB();
setupCronJobs();

// CORS Configuration
const corsOptions = {
  origin: ['https://activehub-fitracker.onrender.com', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Trust proxy - needed for X-Forwarded-For header in rate limiting
app.set('trust proxy', 1);

// Security
app.use(helmet());

// Rate limiter (auth abuse prevention)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many requests from this IP, try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS
const allowedOrigins = [
  "https://activehub-fitracker.onrender.com", // ✅ Production
  "http://localhost:5173",                    // ✅ Local
  "http://localhost:3000"
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Logger
app.use(morgan("dev"));

// Use JSON parser for all routes except Razorpay webhook
app.use((req, res, next) => {
  // Special handling for Razorpay webhook - use raw parser
  if (req.originalUrl === '/api/webhook/razorpay') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// Subscription middleware
app.use("/api/members", checkSubscription);

// Rate limiting
// Commented out rate limiting for testing purposes
// app.use("/api/auth", authLimiter);
// app.use("/api/member-auth", authLimiter);

// Routes
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
app.use("/api/admin/revenue", revenueRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/trainers", trainerRoutes);

// Direct route for Razorpay webhook
const razorpayWebhookController = require("./controllers/razorpayWebhookController");
app.post("/api/webhook/razorpay", razorpayWebhookController);

// Root
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

app.get("/api", (req, res) => {
  res.json({ message: "API is working" });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err instanceof SyntaxError) {
    return res.status(400).json({ message: "Invalid JSON format" });
  }
  res.status(500).json({ message: "Something went wrong!" });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
