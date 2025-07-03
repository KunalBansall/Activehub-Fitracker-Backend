const express = require('express');
const trainerController = require('../controllers/trainerController');

const router = express.Router();

// Public routes (no authentication required)
router.post('/login', trainerController.login);
router.post('/set-password/:token', (req, res) => {
  // This route is handled by the frontend, just return the token for reference
  res.json({ token: req.params.token });
});

// Password reset endpoint (handled by API)
router.post('/reset-password/:token', trainerController.setPassword);

// Protected routes (require authentication)
router.use(trainerController.protect);

// Trainer-specific routes (protected)
router.get('/me/members', trainerController.getMyMembers);

// Admin-only routes
router.use(trainerController.restrictTo('admin'));
router.route('/')
  .post(trainerController.createTrainer)
  .get(trainerController.getAllTrainers);

router.route('/:id')
  .patch(trainerController.updateTrainer)
  .delete(trainerController.deleteTrainer);

// Admin-only trainer management
router.get('/assigned-members', trainerController.getAssignedMembers);

module.exports = router;
