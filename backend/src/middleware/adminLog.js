const jwt = require("jsonwebtoken");

exports.verifyOwner = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]; // Get the token from the Authorization header
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Decode the JWT

    if (decoded.role !== "owner") {
      // Check if the role is 'owner'
      return resa
        .status(403)
        .json({ message: "Access forbidden: Not the owner" });
    }

    next(); // Allow the request to proceed if the user is an owner
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: "Invalid token" });
  }
};
