//require("dotenv").config(); 

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 JWT Secret Key (In production, this should go in a .env file)
//const JWT_SECRET = process.env.JWT_SECRET;

// 🗄️ Database Connection
mongoose.connect("mongodb+srv://mad-admin:<Chanti2003>@cluster0.sf4ylpi.mongodb.net/swiggy-clone?appName=Cluster0")
  .then(() => {
    console.log("✅ MongoDB Connected to:", mongoose.connection.name);
    seedDatabase(); 
  })
  .catch(err => console.log("❌ MongoDB Error:", err));

// 📦 Import Models
const Food = require("./models/Food");
const Order = require("./models/Order");
const Settings = require("./models/Settings");
const User = require("./models/User"); 

/* ==========================================
   🚀 PROMO CODE SCHEMA (Database-Driven)
========================================== */
const promoSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  discountType: { type: String, enum: ['FLAT', 'PERCENTAGE'], required: true },
  discountValue: { type: Number, required: true },
  minOrderAmount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true } 
});
const Promo = mongoose.model("Promo", promoSchema);


/* ==========================================
   1. AUTHENTICATION ROUTES
========================================== */
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "Email already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ name, email, password: hashedPassword, role });
    await newUser.save();

    res.status(201).json({ message: "Account created successfully! Please login." });
  } catch (err) {
    res.status(500).json({ message: "Server error during registration" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "1d" });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: "Server error during login" });
  }
});


/* ==========================================
   USER PROFILE ROUTES (Protected)
========================================== */
const verifyUser = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; 
  if (!token) return res.status(401).json({ message: "Access Denied. Please login." });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified; 
    next(); 
  } catch (err) {
    res.status(400).json({ message: "Invalid Token" });
  }
};

app.put("/api/users/profile", verifyUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.name = req.body.name || user.name;
    
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(req.body.password, salt);
    }
    
    await user.save();
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    res.status(500).json({ message: "Error updating profile" });
  }
});

/* ==========================================
   2. SECURITY MIDDLEWARE (The Bouncer)
========================================== */
const verifyAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; 
  
  if (!token) return res.status(401).json({ message: "Access Denied. No token provided." });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    if (verified.role !== "admin") return res.status(403).json({ message: "Access Denied. Admins only." });
    
    req.user = verified;
    next(); 
  } catch (err) {
    res.status(400).json({ message: "Invalid or Expired Token" });
  }
};

/* ==========================================
   3. FOOD ROUTES
========================================== */
app.get("/api/foods", async (req, res) => {
  try {
    const { search } = req.query;
    let query = search ? { name: { $regex: search, $options: "i" } } : {};
    res.json(await Food.find(query));
  } catch (error) {
    res.status(500).json({ message: "Server error fetching foods" });
  }
});

app.get("/api/foods/:category", async (req, res) => {
  try {
    res.json(await Food.find({ category: { $regex: new RegExp(`^${req.params.category}$`, "i") } }));
  } catch (error) {
    res.status(500).json({ message: "Server error fetching category" });
  }
});

app.post("/api/foods", verifyAdmin, async (req, res) => {
  try {
    const newFood = new Food(req.body);
    const savedFood = await newFood.save();
    res.status(201).json(savedFood);
  } catch (error) {
    res.status(500).json({ message: "Failed to add food item" });
  }
});

app.put("/api/foods/:id", verifyAdmin, async (req, res) => {
  try {
    const updatedFood = await Food.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true } 
    );
    if (!updatedFood) {
      return res.status(404).json({ message: "Dish not found" });
    }
    res.status(200).json(updatedFood);
  } catch (error) {
    res.status(500).json({ message: "Server error while updating dish" });
  }
});

app.delete("/api/foods/:id", verifyAdmin, async (req, res) => {
  try {
    await Food.findByIdAndDelete(req.params.id);
    res.json({ message: "Food item deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete food item" });
  }
});

/* ==========================================
   4. ORDER & SETTINGS ROUTES
========================================== */
app.post("/api/orders", async (req, res) => {
  try {
    const saved = await new Order(req.body).save();
    
    // 🚀 NEW: Instantly broadcast the new order to the Admin Panel
    io.emit("newOrderReceived", saved); 

    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: "Failed to place order" });
  }
});

app.get("/api/orders", verifyAdmin, async (req, res) => {
  try {
    res.json(await Order.find().sort({ createdAt: -1 }));
  } catch (error) {
    res.status(500).json({ message: "Server error fetching orders" });
  }
});

app.get("/api/settings", async (req, res) => {
  try {
    let s = await Settings.findOne() || await Settings.create({});
    res.json(s);
  } catch (error) {
    res.status(500).json({ message: "Server error fetching settings" });
  }
});

app.put("/api/settings", verifyAdmin, async (req, res) => {
  try {
    const s = await Settings.findOneAndUpdate({}, req.body, { new: true, upsert: true });
    res.json(s);
  } catch (error) {
    res.status(400).json({ message: "Failed to update settings" });
  }
});



/* ==========================================
   RAZORPAY PAYMENT GATEWAY
========================================== */


const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpayInstance = new Razorpay({
  key_id: "rzp_test_YourTestKeyHere", 
  key_secret: "YourTestSecretHere",   
});

app.post("/api/payment/create", async (req, res) => {
  try {
    const { amount } = req.body;
    const options = {
      amount: Math.round(amount * 100), 
      currency: "INR",
      receipt: `receipt_order_${Math.floor(Math.random() * 1000)}`,
    };

    const order = await razorpayInstance.orders.create(options);
    if (!order) return res.status(500).send("Some error occured");
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Error creating Razorpay order" });
  }
});

app.post("/api/payment/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", "YourTestSecretHere") 
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      return res.status(200).json({ message: "Payment verified successfully" });
    } else {
      return res.status(400).json({ message: "Invalid signature sent!" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error verifying payment" });
  }
});  


/* ==========================================
   PROMO CODE ROUTES (Customer Facing)
========================================== */
app.post("/api/promo/validate", async (req, res) => {
  try {
    const { code, cartTotal } = req.body;
    const promo = await Promo.findOne({ code: code.toUpperCase() });
    
    if (!promo || !promo.isActive) {
      return res.status(400).json({ message: "Invalid or expired promo code." });
    }
    if (cartTotal < promo.minOrderAmount) {
      return res.status(400).json({ message: `Spend ₹${promo.minOrderAmount} or more to use this code.` });
    }

    let discountAmount = 0;
    if (promo.discountType === 'FLAT') discountAmount = promo.discountValue; 
    else if (promo.discountType === 'PERCENTAGE') discountAmount = Math.round(cartTotal * (promo.discountValue / 100)); 

    res.json({ discountAmount, message: `✅ Promo Applied! Saved ₹${discountAmount}` });
  } catch (error) {
    res.status(500).json({ message: "Server error validating promo." });
  }
});

// 🚀 NEW: Get ACTIVE promos for the Home Page banner
app.get("/api/promos/active", async (req, res) => {
  try {
    const activePromos = await Promo.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(activePromos);
  } catch (error) {
    res.status(500).json({ message: "Error fetching active promos" });
  }
});

/* ==========================================
   ADMIN PROMO MANAGEMENT ROUTES
========================================== */
app.get("/api/promos", verifyAdmin, async (req, res) => {
  try {
    const promos = await Promo.find().sort({ createdAt: -1 });
    res.json(promos);
  } catch (error) {
    res.status(500).json({ message: "Error fetching promos" });
  }
});

app.post("/api/promos", verifyAdmin, async (req, res) => {
  try {
    req.body.code = req.body.code.toUpperCase();
    const newPromo = new Promo(req.body);
    await newPromo.save();
    res.status(201).json(newPromo);
  } catch (error) {
    res.status(400).json({ message: "Error creating promo. Ensure the code is unique!" });
  }
});

app.put("/api/promos/:id/toggle", verifyAdmin, async (req, res) => {
  try {
    const promo = await Promo.findById(req.params.id);
    if (!promo) return res.status(404).json({ message: "Promo not found" });

    promo.isActive = !promo.isActive;
    await promo.save();
    res.json(promo);
  } catch (error) {
    res.status(500).json({ message: "Error toggling promo" });
  }
});

app.delete("/api/promos/:id", verifyAdmin, async (req, res) => {
  try {
    await Promo.findByIdAndDelete(req.params.id);
    res.json({ message: "Promo deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting promo" });
  }
});

/* ==========================================
   CUSTOMER ORDER & CANCELLATION ROUTES
========================================== */
app.get("/api/orders/user/:email", async (req, res) => {
  try {
    const orders = await Order.find({ "customer.email": req.params.email }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching user orders" });
  }
});

app.put("/api/orders/:id/cancel", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (order.status !== "Order Received" && order.status !== "Cash on Delivery" && order.status !== "Online Paid") {
      return res.status(400).json({ message: "Too late to cancel! Restaurant has already started processing your order." });
    }

    order.status = "Cancelled";
    const updatedOrder = await order.save();
    
    io.emit("orderStatusChanged", updatedOrder); 
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ message: "Error cancelling order" });
  }
});

/* ==========================================
   ADMIN ANALYTICS ROUTE
========================================== */
app.get("/api/orders/analytics/revenue", verifyAdmin, async (req, res) => {
  try {
    const dailyRevenue = await Order.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalRevenue: { $sum: "$finalAmount" }, 
          ordersCount: { $sum: 1 }                
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const formattedData = dailyRevenue.map(day => ({
      date: day._id,
      revenue: day.totalRevenue,
      orders: day.ordersCount
    }));

    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ message: "Error fetching analytics" });
  }
});

/* ==========================================
   RATINGS & REVIEWS ROUTE
========================================== */
app.post("/api/foods/:id/reviews", async (req, res) => {
  try {
    const { rating, userName } = req.body;
    const food = await Food.findById(req.params.id);

    if (!food) return res.status(404).json({ message: "Food not found" });

    const alreadyReviewed = food.reviews.find(r => r.userName === userName);
    if (alreadyReviewed) {
      return res.status(400).json({ message: "You already rated this dish!" });
    }

    const review = { userName: userName, rating: Number(rating) };

    food.reviews.push(review);
    food.numReviews = food.reviews.length;
    food.rating = food.reviews.reduce((acc, item) => item.rating + acc, 0) / food.reviews.length;

    await food.save();
    res.status(201).json({ message: "Review added successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Error adding review" });
  }
});

/* ==========================================
   6. SEED DATA SCRIPT
========================================== */
async function seedDatabase() {
  const count = await Food.countDocuments();
  if (count === 0) {
    await Food.insertMany([
      { name: "Hyderabadi Chicken Dum Biryani", price: 320, category: "Biryani", image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80", rating: 4.5, deliveryTime: 35, isVeg: false },
      { name: "Ghee Roast Masala Dosa", price: 110, category: "Tiffins", image: "https://images.unsplash.com/photo-1645177628172-a94c1f96e6db?w=800&q=80", rating: 4.8, deliveryTime: 25, isVeg: true },
      { name: "Classic Cheese Burger", price: 199, category: "Burger", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80", rating: 4.1, deliveryTime: 40, isVeg: false },
      { name: "Paneer Tikka Pizza", price: 350, category: "Pizza", image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80", rating: 4.3, deliveryTime: 45, isVeg: true }
    ]);
    
    const promoCount = await Promo.countDocuments();
    if (promoCount === 0) {
      await new Promo({ code: "MAD50", discountType: "FLAT", discountValue: 50, minOrderAmount: 200, isActive: true }).save();
    }
  }
}

// 🚀 Start Server & WebSockets
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ["https://madfoodzone.vercel.app"] , methods: ["GET", "POST", "PUT"] }
});

io.on("connection", (socket) => {
  console.log("⚡ A user connected to real-time tracking");
});

app.put("/api/orders/:id/status", verifyAdmin, async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id, 
      { status: req.body.status }, 
      { new: true }
    );
    
    io.emit("orderStatusChanged", updatedOrder); 
    res.json(updatedOrder);
  } catch (err) {
    res.status(500).json({ message: "Error updating status" });
  }
});

server.listen(5000, () => console.log("🚀 Server & WebSockets running on port 5000"));