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
const adminRoutes = require("./routes/admin");
const memberAuthRoutes = require("./routes/memberAuth");
const memberAttendence = require("./routes/memberAttendence");

const app = express();
connectDB();

const allowedOrigins = [
  "https://activehub-fitracker.onrender.com",
  "http://localhost:5173",
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
