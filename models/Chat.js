const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ["text", "image"], default: "text" },
    read: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false }, // soft delete
  },
  { timestamps: true }
);

const ChatSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    house: { type: mongoose.Schema.Types.ObjectId, ref: "House" },
    messages: [MessageSchema],
    lastMessage: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Chat", ChatSchema);