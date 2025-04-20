const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/chatApp", {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log("✅ MongoDB Connected Successfully!");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1); // Exit if MongoDB connection fails
  }
};

module.exports = connectDB;
