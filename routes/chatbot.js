const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const House = require("../models/House");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper: search houses based on extracted filters
async function searchHouses(filters) {
  const query = {};
  if (filters.type && filters.type !== "any") query.type = filters.type;
  if (filters.minPrice) query.price = { $gte: parseInt(filters.minPrice) };
  if (filters.maxPrice) query.price = { ...query.price, $lte: parseInt(filters.maxPrice) };
  if (filters.bedrooms) query.bedrooms = parseInt(filters.bedrooms);
  if (filters.location) query.location = { $regex: new RegExp(filters.location, "i") };
  if (filters.wifi) query.wifi = true;
  if (filters.parking) query.parking = true;
  if (filters.furnished) query.furnished = true;
  if (filters.petFriendly) query.petFriendly = true;
  if (filters.pool) query.pool = true;
  if (filters.ac) query.ac = true;

  const houses = await House.find(query)
    .limit(5)
    .select("name location price images type _id");
  return houses;
}

// Main chatbot endpoint
router.post("/", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "No message provided" });
  }

  try {
    // System prompt to guide the AI
    const systemPrompt = `
You are an AI concierge for a house rental marketplace in Blantyre, Malawi.
Your job is to help users find properties or answer questions about the platform.

If the user asks to search for houses, extract the filters and respond with a JSON object in the following format:
{
  "action": "search",
  "filters": {
    "type": "house" | "hostel" | "apartment" | "room" | "office" | null,
    "minPrice": number | null,
    "maxPrice": number | null,
    "bedrooms": number | null,
    "location": string | null,
    "wifi": boolean | null,
    "parking": boolean | null,
    "furnished": boolean | null,
    "petFriendly": boolean | null,
    "pool": boolean | null,
    "ac": boolean | null
  }
}
If the user asks a general question (e.g., "How do I list a property?"), respond with a JSON object:
{
  "action": "answer",
  "text": "Your helpful answer here."
}
Only output JSON. No extra text.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    let aiResponse = completion.choices[0].message.content;
    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch (e) {
      // Fallback: if AI doesn't return valid JSON, treat as answer
      parsed = { action: "answer", text: "I'm sorry, I couldn't understand that. Please try again." };
    }

    if (parsed.action === "search") {
      const houses = await searchHouses(parsed.filters);
      if (houses.length === 0) {
        return res.json({
          action: "answer",
          text: "Sorry, I couldn't find any houses matching your criteria. Try adjusting your filters.",
        });
      }
      // Build a friendly list of houses with links
      const houseList = houses.map(h => ({
        name: h.name,
        price: h.price,
        location: h.location,
        id: h._id,
        image: h.images?.[0] || "",
      }));
      return res.json({ action: "searchResults", houses: houseList });
    } else {
      return res.json(parsed);
    }
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({
      action: "answer",
      text: "I'm having trouble connecting right now. Please try again later.",
    });
  }
});

module.exports = router;