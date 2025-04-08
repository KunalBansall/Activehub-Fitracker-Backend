const mongoose = require('mongoose');
const Product = require('../src/models/Product');
require('dotenv').config();

async function updateProducts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/activehub');
    console.log('Connected to MongoDB');

    // Update all products that don't have isActive field
    const result = await Product.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );

    console.log(`Updated ${result.modifiedCount} products`);
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error updating products:', error);
  }
}

updateProducts(); 