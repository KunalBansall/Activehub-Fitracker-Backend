const axios = require("axios");

// Function to get client IP address
const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"] || // IP from proxy
    req.connection.remoteAddress || // IP from direct connection
    req.socket.remoteAddress || // IP from socket
    "IP Not Found"
  ).replace(/^::ffff:/, ""); // Remove IPv6 prefix if present
};

const getLocationByIp = async (ip) => {
  if (ip === "::1") {
    return {
      city: "Localhost",
      region: "Local",
      country: "Local",
      lat: 0,
      lon: 0,
    };
  }

  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`);
    const { city, regionName, country, lat, lon } = response.data;
    return { city, region: regionName, country, lat, lon };
  } catch (error) {
    console.error("Error fetching location data:", error.message);
    return {
      city: "Unknown",
      region: "Unknown",
      country: "Unknown",
      lat: 0,
      lon: 0,
    }; // Fallback
  }
};

module.exports = { getClientIp, getLocationByIp };
