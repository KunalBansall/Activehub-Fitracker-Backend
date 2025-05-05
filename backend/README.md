# ActiveHub FitTracker - Backend API

## Overview
This is the backend API for ActiveHub FitTracker, a comprehensive gym management system. It provides RESTful endpoints for managing gym members, attendance tracking, payment processing, product inventory, and ad management.

## Features
- **Authentication** - JWT-based auth system for admin and member logins
- **Member Management** - CRUD operations for gym members
- **Attendance Tracking** - Check-in/check-out system with history
- **Payment Processing** - Track membership fees and payments
- **Shop System** - Product management and order processing
- **Ad Management** - Create and manage advertisements for the platform

## Tech Stack
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **JWT** - JSON Web Tokens for authentication
- **Multer** - File uploads handling
- **Cloudinary** - Cloud storage for images and videos

## Getting Started

### Prerequisites
- Node.js (v14+)
- MongoDB (local or Atlas)

### Installation
1. Clone the repository
2. Navigate to the backend directory
3. Set up environment variables in `.env`:
   ```
   PORT=3000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   OWNER_EMAIL=your_owner_email
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret
   RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
   ```
4. Install dependencies:
   ```
   npm install
   ```
5. Start the development server:
   ```
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Admin login
- `POST /api/auth/signup` - Admin signup
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `POST /api/members/login` - Member login
- `POST /api/members/set-password` - Member set password

### Members
- `GET /api/members` - Get all members
- `GET /api/members/:id` - Get member by ID
- `POST /api/members` - Create new member
- `PUT /api/members/:id` - Update member
- `DELETE /api/members/:id` - Delete member
- `GET /api/members/:id/attendance` - Get member attendance history

### Attendance
- `POST /api/attendance/check-in` - Record member check-in
- `POST /api/attendance/check-out` - Record member check-out
- `GET /api/attendance/today` - Get today's attendance
- `GET /api/attendance/history` - Get attendance history

### Shop
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create new product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `GET /api/orders` - Get all orders
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id` - Update order status

### Ads
- `GET /api/ads` - Get all ads
- `GET /api/ads/:id` - Get ad by ID
- `POST /api/ads` - Create new ad
- `PUT /api/ads/:id` - Update ad
- `DELETE /api/ads/:id` - Delete ad
- `GET /api/ads/placement/:placement` - Get ads by placement

### Payment Routes
- `POST /api/payment/create-subscription` - Create a new subscription
- `POST /api/payment/verify-subscription` - Verify a subscription payment
- `POST /api/payment/webhook` - Process webhook events from Razorpay (legacy endpoint)
- `GET /api/payment/history` - Get payment history for the current admin
- `POST /api/payment/cancel-subscription` - Cancel a subscription

### Razorpay Webhook
- `POST /razorpay-webhook` - Dedicated endpoint for processing Razorpay webhook events

## Data Models

### User (Admin)
- Email, password, name, role

### Member
- Name, email, phone, membership details, payment status

### Attendance
- Member ID, check-in time, check-out time

### Product
- Name, description, price, image, inventory count

### Order
- Member ID, products, total price, status

### Ad
- Title, description, media URL, placement, target audience, start/end dates

## Deployment
The API is configured for deployment on Render or similar platforms. Make sure to set up the environment variables in your deployment platform.

## Error Handling
The API uses a consistent error response format:
```json
{
  "success": false,
  "message": "Error message",
  "error": { /* Error details */ }
}
```

## Authentication Flow
The API uses JWT for authentication with the following flow:
1. Admin/Member logs in with credentials
2. Server verifies credentials and returns JWT token
3. Client includes token in Authorization header for subsequent requests
4. Server validates token and processes authorized requests 

## Environment Variables

Make sure you have the following environment variables in your `.env` file:

### Razorpay Configuration
```
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

The `RAZORPAY_WEBHOOK_SECRET` is the secret key provided by Razorpay for webhook authentication. You can find this in your Razorpay Dashboard under Developer > Webhooks.

## Webhook Configuration

The application provides a dedicated webhook endpoint for Razorpay at:

```
https://your-domain.com/razorpay-webhook
```

When configuring webhooks in your Razorpay Dashboard, use this URL as the webhook endpoint. Make sure to:

1. Set the webhook URL to point to your server's `/razorpay-webhook` endpoint
2. Configure the secret in both Razorpay and your .env file
3. Select at least the following events to be sent to the webhook:
   - payment.captured
   - payment.failed
   - subscription.activated
   - subscription.charged
   - subscription.halted
   - subscription.cancelled

## API Routes

### Payment Routes

- `POST /api/payment/create-subscription` - Create a new subscription
- `POST /api/payment/verify-subscription` - Verify a subscription payment
- `POST /api/payment/webhook` - Process webhook events from Razorpay (legacy endpoint)
- `GET /api/payment/history` - Get payment history for the current admin
- `POST /api/payment/cancel-subscription` - Cancel a subscription

### Razorpay Webhook
- `POST /razorpay-webhook` - Dedicated endpoint for processing Razorpay webhook events 