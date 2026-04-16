const mongoose = require("mongoose");

const UserActivitySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  house: { type: mongoose.Schema.Types.ObjectId, ref: "House" },
  action: { type: String, enum: ["view", "favorite", "save_search"], required: true },
  searchFilters: { type: Object }, // only for save_search actions
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("UserActivity", UserActivitySchema);