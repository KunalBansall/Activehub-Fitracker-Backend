const express = require("express");
const router = express.Router();
const { setPassword, login } = require("../controllers/memberAuthController");

// POST request to set member's password
router.post("/set-password/:id/:token", setPassword);

// POST request for member login
router.post("/login", login);

module.exports = router;
