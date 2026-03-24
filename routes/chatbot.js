const express = require("express");
const router = express.Router();
const House = require("../models/House");

// Helper: search houses based on filters
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

// Simple keyword parser
function parseIntent(message) {
  const lower = message.toLowerCase();
  const filters = {};

  // Property type
  if (lower.includes("house")) filters.type = "House";
  else if (lower.includes("hostel")) filters.type = "Hostel";
  else if (lower.includes("apartment")) filters.type = "Apartment";
  else if (lower.includes("room")) filters.type = "Room";
  else if (lower.includes("office")) filters.type = "Office";

  // Price
  const priceMatch = lower.match(/(\d+)\s*(k|thousand|million)?/);
  if (priceMatch) {
    let price = parseInt(priceMatch[1]);
    if (priceMatch[2] === "k") price *= 1000;
    else if (priceMatch[2] === "million") price *= 1000000;
    if (lower.includes("under") || lower.includes("below")) {
      filters.maxPrice = price;
    } else if (lower.includes("over") || lower.includes("above")) {
      filters.minPrice = price;
    } else {
      // Default: treat as max price
      filters.maxPrice = price;
    }
  }

  // Bedrooms
  const bedMatch = lower.match(/(\d+)\s*(bed|bedroom)/);
  if (bedMatch) filters.bedrooms = parseInt(bedMatch[1]);

  // Location (simple: look for known areas)
  const areas = ["manja", "chichiri", "soche", "ndirande", "bangwe", "blantyre", "limbe"];
  for (let area of areas) {
    if (lower.includes(area)) {
      filters.location = area;
      break;
    }
  }

  // Amenities
  if (lower.includes("wifi")) filters.wifi = true;
  if (lower.includes("parking")) filters.parking = true;
  if (lower.includes("furnished")) filters.furnished = true;
  if (lower.includes("pet")) filters.petFriendly = true;
  if (lower.includes("pool")) filters.pool = true;
  if (lower.includes("ac") || lower.includes("aircon")) filters.ac = true;

  // If no filters were extracted, treat as general help
  if (Object.keys(filters).length === 0) {
    return {
      action: "answer",
      text: "I can help you find houses. Try saying things like:\n- 'cheap houses under 500k'\n- 'houses with pool in Manja'\n- 'hostels near Chichiri'\n- 'furnished apartments'\n\nOr ask about the platform: 'How do I list a property?'"
    };
  }

  return { action: "search", filters };
}

// Main chatbot endpoint (free, no OpenAI)
router.post("/", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "No message provided" });
  }

  try {
    const intent = parseIntent(message);

    if (intent.action === "search") {
      const houses = await searchHouses(intent.filters);
      if (houses.length === 0) {
        return res.json({
          action: "answer",
          text: "Sorry, I couldn't find any houses matching your criteria. Try adjusting your filters.",
        });
      }
      const houseList = houses.map(h => ({
        name: h.name,
        price: h.price,
        location: h.location,
        id: h._id,
        image: h.images?.[0] || "",
      }));
      return res.json({ action: "searchResults", houses: houseList });
    } else {
      return res.json(intent);
    }
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({
      action: "answer",
      text: "I'm having trouble connecting right now. Please try again later.",
    });
  }
});

// Simple test endpoint
router.get("/test", (req, res) => {
  res.json({ message: "Chatbot route is working (free version)" });
});

module.exports = router;