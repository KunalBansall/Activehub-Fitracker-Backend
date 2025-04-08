const express = require("express");
const router = express.Router();
const Product = require("../models/Product");

// Get featured products
router.get("/featured", async (req, res) => {
  try {
    const { gymId } = req.query;
    
    if (!gymId) {
      return res.status(400).json({ message: "Gym ID is required" });
    }
    
    // Find featured products for the specified gym
    const featuredProducts = await Product.find({
      gymId,
      featured: true
    })
    .sort({ createdAt: -1 })
    .select("-reviews");
    
    res.status(200).json(featuredProducts);
  } catch (error) {
    console.error("Error fetching featured products:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get product by ID (public view)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id).select("-reviews");
    
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    // Return product with only summary review data
    const productData = product.toObject();
    productData.reviewCount = product.reviews ? product.reviews.length : 0;
    
    res.status(200).json(productData);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router; 