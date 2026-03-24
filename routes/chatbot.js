const express = require("express");
const router = express.Router();
const House = require("../models/House");

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
    .limit(8)
    .select("name location price images type _id");
  return houses;
}

// ======================================
// ENHANCED FILTER EXTRACTION
// ======================================
function extractFilters(message) {
  const msg = message.toLowerCase();
  const filters = {};

  // 1. Property type with synonyms (including room variations)
  const typeMap = {
    house: "House",
    houses: "House",
    home: "House",
    hostel: "Hostel",
    hostels: "Hostel",
    dorm: "Hostel",
    dormitory: "Hostel",
    apartment: "Apartment",
    apartments: "Apartment",
    flat: "Apartment",
    flats: "Apartment",
    room: "Room",
    rooms: "Room",
    studio: "Room",
    bedsitter: "Room",
    office: "Office",
    offices: "Office"
  };
  for (const [word, type] of Object.entries(typeMap)) {
    if (msg.includes(word)) {
      filters.type = type;
      break;
    }
  }

  // 2. Price (supports "under 500k", "below 500,000", "max 300k", "less than 200k", "500k", "500,000", "500 thousand")
  const pricePatterns = [
    /(?:under|below|less than|max|max price|up to|not exceed)\s*(\d+(?:[.,]\d+)?)\s*(?:k|k?mw)?/i,
    /(\d+(?:[.,]\d+)?)\s*(?:k|k?mw)?\s*(?:or less|and under)/i,
    /(?:for|under|at)\s*(\d+(?:[.,]\d+)?)\s*(?:k|k?mw)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:k|k?mw)(?=\s|$)/i
  ];
  for (const pattern of pricePatterns) {
    const match = msg.match(pattern);
    if (match) {
      let price = parseFloat(match[1].replace(',', '.'));
      if (match[0].includes('k') || match[0].includes('K')) price *= 1000;
      filters.maxPrice = price;
      break;
    }
  }

  // 3. Bedrooms
  const bedroomPatterns = [
    /(\d+)\s*(?:bedroom|bed|br)/i,
    /(\d+)\s*(?:bedroom|bed|br)s?/i,
    /(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:bedroom|bed|br)/i
  ];
  const numberWords = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10
  };
  for (const pattern of bedroomPatterns) {
    const match = msg.match(pattern);
    if (match) {
      let num = parseInt(match[1]);
      if (isNaN(num)) {
        const word = match[1].toLowerCase();
        num = numberWords[word] || 0;
      }
      if (num > 0) filters.bedrooms = num;
      break;
    }
  }

  // 4. Location (after "in", "near", "at", "around")
  const locationPattern = /(?:in|near|at|around)\s+([a-z]+)/i;
  const locMatch = msg.match(locationPattern);
  if (locMatch) filters.location = locMatch[1];

  // 5. Amenities (synonyms)
  const amenityMap = {
    wifi: ["wifi", "wi-fi", "internet", "wireless"],
    parking: ["parking", "car park", "parking lot", "garage"],
    furnished: ["furnished", "furniture", "fully furnished"],
    petFriendly: ["pet friendly", "pets allowed", "dogs allowed", "cats allowed"],
    pool: ["pool", "swimming pool", "swimming"],
    ac: ["ac", "air conditioning", "aircon", "a/c"]
  };
  for (const [key, words] of Object.entries(amenityMap)) {
    if (words.some(word => msg.includes(word))) filters[key] = true;
  }

  return filters;
}

// ======================================
// EXPANDED FAQ
// ======================================
const faq = [
  { patterns: [/how to list/, /list a property/, /post a listing/, /add property/], 
    answer: "To list a property, log in as a landlord, go to your dashboard, click 'Upload New House', fill in the details and add photos. Your listing will be reviewed and appear on the site shortly." },
  { patterns: [/cost to list/, /how much to list/, /listing fee/], 
    answer: "Listing a property is free. You can pay to become a verified landlord (official or premium) or to feature a house for better visibility." },
  { patterns: [/feature house/, /make featured/, /promote listing/], 
    answer: "To feature a house, go to your dashboard, find the house and click '⭐ Feature (K5000)'. You'll be guided through payment." },
  { patterns: [/become official/, /official landlord/, /get verified/], 
    answer: "You can become an official landlord by paying MWK 2500 from your dashboard. This adds a verified badge to your profile." },
  { patterns: [/become premium/, /premium landlord/], 
    answer: "You can become a premium landlord by paying MWK 5000 from your dashboard. This adds a premium badge and extra visibility." },
  { patterns: [/contact support/, /help/, /support/], 
    answer: "You can contact support via the contact form on our website or email us at support@rentalmarketplace.com." },
  { patterns: [/report/, /fake listing/, /report a listing/], 
    answer: "If you see a fake listing, click the 'Report' button on the property card. Our admin team will review it." },
  { patterns: [/how it works/, /how does it work/], 
    answer: "Landlords list properties, tenants search and contact landlords directly via WhatsApp or chat. You can also book properties online." },
  { patterns: [/payment methods/, /how to pay/, /pay/], 
    answer: "We support Airtel Money, TNM Mpamba, and Standard Bank. Payments are processed securely through PayChangu." },
  { patterns: [/refund/, /refund policy/], 
    answer: "Refunds are handled case by case. Please contact support for assistance." },
  { patterns: [/booking/, /how to book/, /request booking/], 
    answer: "To book a property, click the 'Request Booking' button on the property card, select your dates, and send a request. The landlord will approve or reject it." },
  { patterns: [/cancel booking/, /cancel/], 
    answer: "You can cancel a booking by contacting the landlord directly. Refunds depend on the cancellation policy of the landlord." },
  { patterns: [/what is this site/, /about us/], 
    answer: "Rental Marketplace is a platform connecting landlords and tenants in Blantyre. We provide verified listings, online booking, and secure payments." }
];

function answerGeneralQuestion(message) {
  const msg = message.toLowerCase();
  for (const item of faq) {
    if (item.patterns.some(pattern => pattern.test(msg))) {
      return item.answer;
    }
  }
  return null;
}

// ======================================
// MAIN ENDPOINT
// ======================================
router.post("/", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "No message provided" });
  }

  // 1. Try FAQ
  const faqAnswer = answerGeneralQuestion(message);
  if (faqAnswer) {
    return res.json({ action: "answer", text: faqAnswer });
  }

  // 2. Treat as search
  const filters = extractFilters(message);

  // If no filters were extracted, give a helpful tip
  if (Object.keys(filters).length === 0) {
    return res.json({
      action: "answer",
      text: "I can help you find properties. Try saying things like:\n- 'rooms under 200k'\n- 'hostels near Chichiri'\n- 'furnished apartments with pool'\n- 'offices in town'\nOr ask me: 'How do I list a property?'"
    });
  }

  const houses = await searchHouses(filters);
  if (houses.length === 0) {
    // Suggest a more helpful message based on what they asked
    let suggestion = "Sorry, I couldn't find any";
    if (filters.type) suggestion += ` ${filters.type.toLowerCase()}s`;
    else suggestion += " properties";
    if (filters.location) suggestion += ` in ${filters.location}`;
    if (filters.maxPrice) suggestion += ` under MWK ${filters.maxPrice.toLocaleString()}`;
    suggestion += ". Try adjusting your filters or use different words.";
    return res.json({ action: "answer", text: suggestion });
  }

  const houseList = houses.map(h => ({
    name: h.name,
    price: h.price,
    location: h.location,
    id: h._id,
    image: h.images?.[0] || "",
    type: h.type
  }));
  res.json({ action: "searchResults", houses: houseList });
});

module.exports = router;