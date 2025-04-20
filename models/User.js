const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  socketID: { type: String, required: true },
  status: { type: String, required: true },
  chatLimit: { type: String },
  room: { type: String }, // The room they are in
  lastActive: { type: String },
  profilePic: { type: String } // URL or file path of the profile picture
});

module.exports = mongoose.model("User", userSchema);
