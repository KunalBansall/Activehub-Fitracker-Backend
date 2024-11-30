const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const connectDB = require("./config/database");
const authRoutes = require("./routes/auth");
const memberRoutes = require("./routes/members");
const attendanceRoutes = require("./routes/attendance");
const dashboardRoutes = require("./routes/dashboard");

const app = express();

// Connect to MongoDB
connectDB();

app.use(cors({
  origin: (origin, callback) => {
    console.log("Request Origin:", origin); // Logs the request origin
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


app.use((req, res, next) => {
  console.log("Request Origin:", req.headers.origin);
  next();
});

app.use(morgan("dev"));
app.use(express.json());
console.log("Frontend URL from .env:", process.env.FRONTEND_URL);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);
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
