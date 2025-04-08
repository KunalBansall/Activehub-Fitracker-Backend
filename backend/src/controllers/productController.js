const Product = require("../models/Product");

// Get All Products with optional category filtering
exports.getAllProducts = async (req, res) => {
  try {
    // Check if request is from admin or member
    const gymId = req.admin?._id || req.member?.gymId;
    
    if (!gymId) {
      return res.status(401).json({ message: "Not authorized to access products" });
    }
    
    // Build query based on gymId
    const query = { gymId };
    
    // Add category filter if provided
    if (req.query.category && req.query.category !== 'all') {
      query.category = req.query.category;
    }
    
    // Add featured filter if provided
    if (req.query.featured) {
      query.featured = req.query.featured === 'true';
    }

    // Find products matching the query
    const products = await Product.find(query)
      .sort({ createdAt: -1 }) // Sort by newest first
      .select("-reviews"); // Exclude reviews for list view

    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get Product by ID
exports.getProductById = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      gymId: adminGymId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Create Product
exports.createProduct = async (req, res) => {
  try {
    const adminGymId = req.admin._id;

    // Validate images array
    if (!req.body.images || !Array.isArray(req.body.images) || req.body.images.length === 0) {
      return res.status(400).json({ message: "At least one product image is required" });
    }

    // Transform images if they have 'id' instead of 'publicId'
    const transformedImages = req.body.images.map(image => ({
      url: image.url,
      publicId: image.publicId || image.id
    }));

    // Create a new product
    const newProduct = new Product({
      ...req.body,
      gymId: adminGymId,
      images: transformedImages,
      featuredImageId: req.body.featuredImageId || req.body.images[0].publicId || req.body.images[0].id
    });

    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(400).json({ message: "Error creating product", error: error.message });
  }
};

// Update Product
exports.updateProduct = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { id } = req.params;

    // Find the product to ensure it belongs to the admin's gym
    const product = await Product.findOne({
      _id: id,
      gymId: adminGymId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Transform images if they have 'id' instead of 'publicId'
    if (req.body.images && Array.isArray(req.body.images)) {
      req.body.images = req.body.images.map(image => ({
        url: image.url,
        publicId: image.publicId || image.id
      }));
    }

    // Update the product
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(400).json({ message: "Error updating product", error: error.message });
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { id } = req.params;

    // Find and delete the product, ensuring it belongs to the admin's gym
    const deletedProduct = await Product.findOneAndDelete({
      _id: id,
      gymId: adminGymId,
    });

    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Add a Review to a Product
exports.addProductReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const memberId = req.member._id;
    const memberName = req.member.name;

    // Validate required fields
    if (!rating || !comment) {
      return res.status(400).json({ message: "Rating and comment are required" });
    }

    // Find the product without requiring admin authentication
    const Member = require("../models/Member");
    const member = await Member.findById(memberId);
    
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Get the gymId from the member
    const gymId = member.gymId;
    
    // Find the product that belongs to the member's gym
    const product = await Product.findOne({
      _id: id,
      gymId: gymId
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if member already reviewed this product
    const existingReview = product.reviews.find(
      review => review.memberId.toString() === memberId.toString()
    );

    if (existingReview) {
      // Update existing review
      existingReview.rating = rating;
      existingReview.comment = comment;
      existingReview.createdAt = Date.now();
    } else {
      // Add new review
      product.reviews.push({
        memberId,
        memberName,
        rating,
        comment,
      });
    }

    // Calculate new average rating
    product.calculateAverageRating();

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error("Error adding review:", error);
    res.status(400).json({ message: "Error adding review", error: error.message });
  }
};

// Member-facing APIs

// Get All Products for Members
exports.getMemberProducts = async (req, res) => {
  try {
    const memberId = req.member._id;
    const { category, featured } = req.query;

    // First, get the gymId of the member
    const Member = require("../models/Member");
    const member = await Member.findById(memberId).select("gymId");
    
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Build query based on gymId and optional category
    const query = { gymId: member.gymId };
    
    // Add category filter if provided
    if (category && category !== 'all') {
      query.category = category;
    }
    
    // Add featured filter if provided
    if (featured) {
      query.featured = featured === 'true';
    }

    // Fetch products for the member's gym
    const products = await Product.find(query)
      .sort({ featured: -1, createdAt: -1 }) // Sort featured products first, then by newest
      .select("-reviews"); // Exclude full review data for list view
    
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products for member:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get Product Details for Member
exports.getMemberProductDetails = async (req, res) => {
  try {
    const memberId = req.member._id;
    const { id } = req.params;

    // First, get the gymId of the member
    const Member = require("../models/Member");
    const member = await Member.findById(memberId).select("gymId");
    
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Find the product ensuring it belongs to the member's gym
    const product = await Product.findOne({
      _id: id,
      gymId: member.gymId
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if the member has already reviewed this product
    const hasReviewed = product.reviews.some(
      review => review.memberId.toString() === memberId.toString()
    );

    // Convert to plain object so we can add the hasReviewed property
    const productObj = product.toObject();
    productObj.hasReviewed = hasReviewed;

    res.status(200).json(productObj);
  } catch (error) {
    console.error("Error fetching product details for member:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Toggle Product Featured Status
exports.toggleFeature = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { id } = req.params;
    const { featured } = req.body;

    // Validate featured is a boolean
    if (typeof featured !== 'boolean') {
      return res.status(400).json({ message: "Featured must be a boolean value" });
    }

    // Find the product to ensure it belongs to the admin's gym
    const product = await Product.findOne({
      _id: id,
      gymId: adminGymId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Update the featured status
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: { featured } },
      { new: true }
    );

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Error toggling product feature status:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Admin Add Review
exports.adminAddReview = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { id } = req.params;
    const { memberId, memberName, rating, comment } = req.body;

    // Validate required fields
    if (!memberId || !memberName || !rating || !comment) {
      return res.status(400).json({ 
        message: "Member ID, name, rating, and comment are required" 
      });
    }

    // Find the product to ensure it belongs to the admin's gym
    const product = await Product.findOne({
      _id: id,
      gymId: adminGymId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if member already reviewed this product
    const existingReviewIndex = product.reviews.findIndex(
      review => review.memberId.toString() === memberId.toString()
    );

    if (existingReviewIndex !== -1) {
      // Update existing review
      product.reviews[existingReviewIndex] = {
        ...product.reviews[existingReviewIndex].toObject(),
        memberId,
        memberName,
        rating,
        comment,
        createdAt: Date.now()
      };
    } else {
      // Add new review
      product.reviews.push({
        memberId,
        memberName,
        rating,
        comment,
      });
    }

    // Calculate new average rating
    product.calculateAverageRating();

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error("Error adding review:", error);
    res.status(400).json({ message: "Error adding review", error: error.message });
  }
}; 