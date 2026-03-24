const express = require("express");
const router = express.Router();
const House = require("../models/House");

// ======================================
// Helper: search houses based on extracted filters
// ======================================
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

// ======================================
// Intent recognition (simple keyword‑based)
// ======================================
function extractFilters(message) {
  const msg = message.toLowerCase();
  const filters = {};

  // Property type
  if (msg.includes("house")) filters.type = "House";
  else if (msg.includes("hostel")) filters.type = "Hostel";
  else if (msg.includes("apartment")) filters.type = "Apartment";
  else if (msg.includes("room")) filters.type = "Room";
  else if (msg.includes("office")) filters.type = "Office";

  // Price
  const priceMatch = msg.match(/(?:under|below|less than|max|max price|up to|not exceed)\s*(\d+)/i) ||
                     msg.match(/(\d+)\s*(?:k|k?mw)/i);
  if (priceMatch) {
    let price = parseInt(priceMatch[1]);
    // If it's like "500k", interpret as 500,000
    if (priceMatch[0].includes("k")) price *= 1000;
    filters.maxPrice = price;
  }

  // Bedrooms
  const bedroomMatch = msg.match(/(\d+)\s*bedroom/);
  if (bedroomMatch) filters.bedrooms = parseInt(bedroomMatch[1]);

  // Location (simple: any word after "in" or "near")
  const locationMatch = msg.match(/(?:in|near|at)\s+(\w+)/);
  if (locationMatch) filters.location = locationMatch[1];

  // Amenities
  const amenityKeywords = {
    wifi: ["wifi", "wi-fi", "internet"],
    parking: ["parking", "car park"],
    furnished: ["furnished"],
    petFriendly: ["pet friendly", "pets allowed"],
    pool: ["pool", "swimming pool"],
    ac: ["ac", "air conditioning", "aircon"]
  };
  for (const [key, words] of Object.entries(amenityKeywords)) {
    if (words.some(word => msg.includes(word))) filters[key] = true;
  }

  return filters;
}

// Predefined answers for common questions
const faq = {
  "how to list": "To list a property, log in as a landlord, go to your dashboard, click 'Upload New House', fill in the details and add photos. Your listing will be reviewed and appear on the site shortly.",
  "list property": "To list a property, log in as a landlord, go to your dashboard, click 'Upload New House', fill in the details and add photos. Your listing will be reviewed and appear on the site shortly.",
  "how much to list": "Listing a property is free. You can pay to become a verified landlord (official or premium) or to feature a house for better visibility.",
  "cost to list": "Listing a property is free. You can pay to become a verified landlord (official or premium) or to feature a house for better visibility.",
  "feature house": "To feature a house, go to your dashboard, find the house and click '⭐ Feature (K5000)'. You'll be guided through payment.",
  "become official": "You can become an official landlord by paying MWK 2500 from your dashboard. This adds a verified badge to your profile.",
  "become premium": "You can become a premium landlord by paying MWK 5000 from your dashboard. This adds a premium badge and extra visibility.",
  "contact support": "You can contact support via the contact form on our website or email us at support@rentalmarketplace.com.",
  "report": "If you see a fake listing, click the 'Report' button on the property card. Our admin team will review it.",
  "how it works": "Landlords list properties, tenants search and contact landlords directly via WhatsApp or chat. You can also book properties online.",
  "payment methods": "We support Airtel Money, TNM Mpamba, and Standard Bank. Payments are processed securely through PayChangu.",
  "refund": "Refunds are handled case by case. Please contact support for assistance."
};

function answerGeneralQuestion(message) {
  const msg = message.toLowerCase();
  for (const [key, answer] of Object.entries(faq)) {
    if (msg.includes(key)) return answer;
  }
  return null;
}

// ======================================
// Main endpoint
// ======================================
router.post("/", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "No message provided" });
  }

  // 1. Try to answer a general question
  const faqAnswer = answerGeneralQuestion(message);
  if (faqAnswer) {
    return res.json({ action: "answer", text: faqAnswer });
  }

  // 2. Otherwise, treat as search
  const filters = extractFilters(message);
  // If no filters were extracted, give a helpful tip
  if (Object.keys(filters).length === 0) {
    return res.json({
      action: "answer",
      text: "I can help you find houses. Try saying things like:\n- 'cheap houses under 500k'\n- 'houses with pool in Manja'\n- 'hostels near Chichiri'\n- 'furnished apartments'\nOr ask me: 'How do I list a property?'"
    });
  }

  const houses = await searchHouses(filters);
  if (houses.length === 0) {
    return res.json({
      action: "answer",
      text: "Sorry, I couldn't find any houses matching your criteria. Try adjusting your filters or use different words."
    });
  }

  const houseList = houses.map(h => ({
    name: h.name,
    price: h.price,
    location: h.location,
    id: h._id,
    image: h.images?.[0] || ""
  }));
  res.json({ action: "searchResults", houses: houseList });
});

module.exports = router;