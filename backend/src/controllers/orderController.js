const Order = require("../models/Order");
const Product = require("../models/Product");
const Member = require("../models/Member");

// Create a new order
exports.createOrder = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { memberId, products, totalAmount, paymentMethod, address } = req.body;

    // Validate required fields
    if (!memberId || !products || !Array.isArray(products) || products.length === 0 || !totalAmount || !paymentMethod || !address) {
      return res.status(400).json({
        message: "Member ID, products array, total amount, payment method, and address are required",
      });
    }

    // Validate member exists and belongs to the admin's gym
    const member = await Member.findOne({
      _id: memberId,
      gymId: adminGymId,
    });

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Validate each product exists and update inventory
    for (const item of products) {
      const product = await Product.findOne({
        _id: item.productId,
        gymId: adminGymId,
      });

      if (!product) {
        return res.status(404).json({
          message: `Product not found: ${item.productId}`,
        });
      }

      // Check if enough inventory is available
      if (product.inventory < item.quantity) {
        return res.status(400).json({
          message: `Not enough inventory for ${product.name}. Available: ${product.inventory}`,
        });
      }

      // Update inventory and increment sold count
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { inventory: -item.quantity, sold: item.quantity },
      });
    }

    // Validate total amount matches sum of product prices
    const calculatedTotal = products.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
      return res.status(400).json({
        message: "Total amount does not match sum of product prices",
        calculated: calculatedTotal,
        provided: totalAmount,
      });
    }

    // Create the order
    const newOrder = new Order({
      gymId: adminGymId,
      memberId,
      products,
      totalAmount,
      paymentMethod,
      address,
    });

    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all orders for a specific member
exports.getMemberOrders = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { memberId } = req.params;

    // Validate member exists and belongs to the admin's gym
    const member = await Member.findOne({
      _id: memberId,
      gymId: adminGymId,
    });

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Get orders for the member
    const orders = await Order.find({
      gymId: adminGymId,
      memberId,
    }).sort({ createdAt: -1 }); // Newest first

    res.status(200).json(orders);
  } catch (error) {
    console.error("Error getting member orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all orders (admin only, filtered by gym)
exports.getAllOrders = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { status } = req.query;

    // Build query based on gymId and optional status filter
    const query = { gymId: adminGymId };
    if (status) {
      query.status = status;
    }

    // Get all orders for the admin's gym
    const orders = await Order.find(query)
      .sort({ createdAt: -1 }) // Newest first
      .populate("memberId", "name email phoneNumber"); // Get basic member info

    res.status(200).json(orders);
  } catch (error) {
    console.error("Error getting all orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const adminGymId = req.admin._id;
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status. Must be one of: " + validStatuses.join(", "),
      });
    }

    // Find the order to ensure it belongs to the admin's gym
    const order = await Order.findOne({
      _id: id,
      gymId: adminGymId,
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Handle cancellation - restore inventory if order is cancelled
    if (status === "cancelled" && order.status !== "cancelled") {
      for (const item of order.products) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { inventory: item.quantity, sold: -item.quantity },
        });
      }
    }

    // Update the order status
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true }
    );

    res.status(200).json(updatedOrder);
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Member view their own orders
exports.getMyOrders = async (req, res) => {
  try {
    const memberId = req.member._id;

    // Get orders for the member
    const orders = await Order.find({ memberId }).sort({ createdAt: -1 }); // Newest first

    res.status(200).json(orders);
  } catch (error) {
    console.error("Error getting member orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get a specific order by ID (for a member)
exports.getMemberOrderById = async (req, res) => {
  try {
    const memberId = req.member._id;
    const { id } = req.params;

    // Find the order ensuring it belongs to the requesting member
    const order = await Order.findOne({
      _id: id,
      memberId: memberId
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Error getting member order details:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Create order as a member
exports.createMemberOrder = async (req, res) => {
  try {
    const memberId = req.member._id;
    const { products, totalAmount, paymentMethod, address, notes } = req.body;

    // Validate required fields
    if (!products || !Array.isArray(products) || products.length === 0 || !totalAmount || !paymentMethod || !address) {
      return res.status(400).json({
        message: "Products array, total amount, payment method, and address are required",
      });
    }

    // Get the member's gym ID
    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }
    const gymId = member.gymId;

    // Validate each product exists and update inventory
    for (const item of products) {
      const product = await Product.findOne({
        _id: item.productId,
        gymId: gymId,
      });

      if (!product) {
        return res.status(404).json({
          message: `Product not found: ${item.productId}`,
        });
      }

      // Check if enough inventory is available
      if (product.inventory < item.quantity) {
        return res.status(400).json({
          message: `Not enough inventory for ${product.name}. Available: ${product.inventory}`,
        });
      }

      // Update inventory and increment sold count
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { inventory: -item.quantity, sold: item.quantity },
      });
    }

    // Validate total amount matches sum of product prices
    const calculatedTotal = products.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
      return res.status(400).json({
        message: "Total amount does not match sum of product prices",
        calculated: calculatedTotal,
        provided: totalAmount,
      });
    }

    // Create the order
    const newOrder = new Order({
      gymId: gymId,
      memberId: memberId,
      products,
      totalAmount,
      paymentMethod,
      address,
      notes,
    });

    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Cancel an order as a member
exports.cancelMemberOrder = async (req, res) => {
  try {
    const memberId = req.member._id;
    const { id } = req.params;

    // Find the order ensuring it belongs to the requesting member
    const order = await Order.findOne({
      _id: id,
      memberId: memberId
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if the order can be cancelled
    const cancelableStatuses = ["pending", "processing"];
    if (!cancelableStatuses.includes(order.status)) {
      return res.status(400).json({ 
        message: `Cannot cancel order with status: ${order.status}. Only orders in pending or processing state can be cancelled.` 
      });
    }

    // Restore inventory for all products in the order
    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { inventory: item.quantity, sold: -item.quantity },
      });
    }

    // Update the order status to cancelled
    order.status = "cancelled";
    await order.save();

    res.status(200).json({ 
      message: "Order cancelled successfully", 
      order: order 
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}; 