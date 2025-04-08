const Order = require("../models/Order");
const Product = require("../models/Product");
const Member = require("../models/Member");
const { sendOrderConfirmationEmail, sendAdminNotificationEmail, sendOrderStatusUpdateEmail } = require("../services/emailService");

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
    const { status } = req.body;
    const orderId = req.params.id;

    // Validate status
    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Find and update the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Store the old status for comparison
    const oldStatus = order.status;

    // Update the order status
    order.status = status;
    await order.save();

    // If the status has changed, send email notification
    if (oldStatus !== status) {
      // Get member details for the email
      const member = await Member.findById(order.memberId);
      if (member) {
        await sendOrderStatusUpdateEmail(order, member);
      }
    }

    res.json(order);
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ message: "Error updating order status" });
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
    const { products, totalAmount, paymentMethod, address, notes } = req.body;
    const memberId = req.member._id;

    // Validate required fields
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ 
        message: "Products array is required and must be a non-empty array" 
      });
    }

    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ 
        message: "Valid total amount is required" 
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({ 
        message: "Payment method is required" 
      });
    }

    if (!address) {
      return res.status(400).json({ 
        message: "Address is required" 
      });
    }

    // Get member details
    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Get gym ID from member
    const gymId = member.gymId;
    if (!gymId) {
      return res.status(400).json({ message: "Member not associated with any gym" });
    }

    // Validate products
    for (const item of products) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({ 
          message: "Each product must have a valid productId and quantity" 
        });
      }

      // Find the product without checking isActive field
      const product = await Product.findOne({
        _id: item.productId,
        gymId
      });
      
      if (!product) {
        return res.status(400).json({ message: `Product ${item.productId} not found` });
      }

      // Check if product is active (if the field exists)
      if (product.isActive === false) {
        return res.status(400).json({ message: `Product ${item.productId} is inactive` });
      }

      // Check if there's enough inventory
      if (product.inventory < item.quantity) {
        return res.status(400).json({ 
          message: `Not enough inventory for ${product.name}. Available: ${product.inventory}` 
        });
      }
    }

    // Create order
    const order = new Order({
      memberId,
      gymId,
      products,
      totalAmount,
      status: "pending",
      paymentMethod,
      paymentStatus: "pending",
      address,
      notes: notes || ""
    });

    await order.save();

    // Update inventory for all products
    for (const item of products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { inventory: -item.quantity, sold: item.quantity }
      });
    }

    // Send email notifications
    await Promise.all([
      sendOrderConfirmationEmail(order, member),
      sendAdminNotificationEmail(order, member)
    ]);

    res.status(201).json({
      message: "Order created successfully",
      order
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: "Error creating order", error: error.message });
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