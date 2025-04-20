const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  _id: { type: String, required: true },  // Can be the user ID (e.g., from your auth system)
  username: { type: String, required: true },
  profilePic: { type: String, required: true },  // Path to profile picture
  socketID: { type: String, required: true }
});

const roomSchema = new mongoose.Schema({
  roomName: { type: String, required: true, unique: true },
  users: [userSchema],  // Store an array of user objects
  userLimit: { type: String, default: "4" } // Limit users to 4
});

module.exports = mongoose.model("Room", roomSchema);

