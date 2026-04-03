const express = require("express");
const router = express.Router();
const House = require("../models/House");

// Helper: search houses based on extracted filters (with support for "all")
async function searchHouses(filters, queryType = null) {
  const query = {};
  // If queryType is explicitly "all houses" or "all rooms", we don't filter by type
  if (queryType === 'all') {
    // No type filter
  } else if (filters.type && filters.type !== "any") {
    query.type = filters.type;
  }
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

  let houses = await House.find(query)
    .limit(12)
    .select("name location price images type _id");
  return houses;
}

// ======================================
// ENHANCED FILTER EXTRACTION (includes "all houses", "all rooms", etc.)
// ======================================
function extractFilters(message) {
  const msg = message.toLowerCase();
  const filters = {};

  // Detect "all" queries
  if (msg.includes("all houses") || msg === "houses" || msg === "house") {
    filters.type = "House";
    filters.allFlag = true;
    return filters;
  }
  if (msg.includes("all rooms") || msg === "rooms" || msg === "room") {
    filters.type = "Room";
    filters.allFlag = true;
    return filters;
  }
  if (msg.includes("all hostels") || msg === "hostels" || msg === "hostel") {
    filters.type = "Hostel";
    filters.allFlag = true;
    return filters;
  }
  if (msg.includes("all apartments") || msg === "apartments" || msg === "apartment") {
    filters.type = "Apartment";
    filters.allFlag = true;
    return filters;
  }
  if (msg.includes("all offices") || msg === "offices" || msg === "office") {
    filters.type = "Office";
    filters.allFlag = true;
    return filters;
  }
  if (msg.includes("all properties") || msg === "properties") {
    // No type filter, get everything
    filters.allFlag = true;
    return filters;
  }

  // 1. Property type with synonyms
  const typeMap = {
    house: "House", houses: "House", home: "House",
    hostel: "Hostel", hostels: "Hostel", dorm: "Hostel",
    apartment: "Apartment", apartments: "Apartment", flat: "Apartment",
    room: "Room", rooms: "Room", studio: "Room", bedsitter: "Room",
    office: "Office", offices: "Office"
  };
  for (const [word, type] of Object.entries(typeMap)) {
    if (msg.includes(word)) {
      filters.type = type;
      break;
    }
  }

  // 2. Price
  const pricePatterns = [
    /(?:under|below|less than|max|max price|up to|not exceed)\s*(\d+(?:[.,]\d+)?)\s*(?:k|k?mw)?/i,
    /(\d+(?:[.,]\d+)?)\s*(?:k|k?mw)?\s*(?:or less|and under)/i,
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
  const bedroomPatterns = [/(\d+)\s*(?:bedroom|bed|br)/i];
  const numberWords = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
  for (const pattern of bedroomPatterns) {
    const match = msg.match(pattern);
    if (match) {
      let num = parseInt(match[1]);
      if (isNaN(num)) num = numberWords[match[1].toLowerCase()] || 0;
      if (num > 0) filters.bedrooms = num;
      break;
    }
  }

  // 4. Location
  const locationPattern = /(?:in|near|at|around)\s+([a-z]+)/i;
  const locMatch = msg.match(locationPattern);
  if (locMatch) filters.location = locMatch[1];

  // 5. Amenities
  const amenityMap = {
    wifi: ["wifi", "wi-fi", "internet", "wireless"],
    parking: ["parking", "car park", "garage"],
    furnished: ["furnished", "furniture", "fully furnished"],
    petFriendly: ["pet friendly", "pets allowed", "dogs allowed", "cats allowed"],
    pool: ["pool", "swimming pool"],
    ac: ["ac", "air conditioning", "aircon"]
  };
  for (const [key, words] of Object.entries(amenityMap)) {
    if (words.some(word => msg.includes(word))) filters[key] = true;
  }

  return filters;
}

// ======================================
// EXPANDED FAQ (with detailed, professional answers)
// ======================================
const faq = [
  { patterns: [/how to list/, /list a property/, /post a listing/, /add property/], 
    answer: "📋 To list a property:\n1. Log in as a landlord\n2. Go to your dashboard\n3. Click 'Upload New House'\n4. Fill in all details (name, location, price, photos)\n5. Submit – your listing will be reviewed and appear on the site shortly." },
  { patterns: [/become landlord/, /register as landlord/, /landlord account/], 
    answer: "🏠 To become a landlord, register as a 'Landlord' on the signup page. After login, you'll have access to the landlord dashboard where you can add properties." },
  { patterns: [/cost to list/, /listing fee/], 
    answer: "💰 Listing a property is completely free. You can optionally pay to become a verified landlord (official or premium) or to feature a house for better visibility." },
  { patterns: [/feature house/, /make featured/, /promote listing/], 
    answer: "⭐ To feature a house, go to your dashboard, find the house and click 'Feature (K5000)'. You'll be guided through payment." },
  { patterns: [/become official/, /official landlord/, /get verified/], 
    answer: "✅ You can become an official landlord by paying MWK 2500 from your dashboard. This adds a verified badge to your profile and increases trust." },
  { patterns: [/become premium/, /premium landlord/], 
    answer: "👑 You can become a premium landlord by paying MWK 5000 from your dashboard. This adds a premium badge, extra visibility, and priority support." },
  { patterns: [/contact support/, /help/, /support/, /report issue/], 
    answer: "📧 You can contact support via the contact form on our website or email us at support@khomolathu.com. We typically respond within 24 hours." },
  { patterns: [/report listing/, /fake listing/], 
    answer: "🚨 If you see a suspicious or fake listing, click the 'Report' button on the property card. Our admin team will investigate." },
  { patterns: [/how it works/, /how does the platform work/], 
    answer: "🔍 Landlords list properties, tenants search and contact landlords directly via WhatsApp or chat. You can also book properties online and sign digital leases." },
  { patterns: [/payment methods/, /how to pay/, /pay for verification/], 
    answer: "💳 We support Airtel Money, TNM Mpamba, and Standard Bank. Payments are processed securely through PayChangu." },
  { patterns: [/refund/, /refund policy/], 
    answer: "🔄 Refunds are handled case by case. Please contact support with your transaction ID for assistance." },
  { patterns: [/booking/, /how to book/, /request booking/], 
    answer: "📅 To book a property, click the 'Request Booking' button on the property card, select your dates, and send a request. The landlord will approve or reject it." },
  { patterns: [/cancel booking/, /cancel/], 
    answer: "❌ You can cancel a booking by contacting the landlord directly. Refunds depend on the landlord's cancellation policy." },
  { patterns: [/what is this site/, /about khomo lathu/], 
    answer: "🏆 Khomo Lathu is a premium rental marketplace connecting landlords and tenants across Malawi. We offer verified listings, online booking, digital lease signing, and secure payments." },
  { patterns: [/lease negotiation/, /negotiate lease/, /sign lease/], 
    answer: "✍️ After finding a property, landlords can start a lease negotiation. Both parties can discuss clauses, agree, and sign a digital contract – all online." },
  { patterns: [/offer/, /rental bidding/, /make offer/], 
    answer: "💰 Tenants can make an offer (bid) on properties. Landlords can accept, reject, or counter-offer. The highest bid is visible to premium users." }
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

  // 2. Extract filters
  const filters = extractFilters(message);
  let queryType = 'properties';

  // Determine query type for display
  if (filters.allFlag) {
    if (filters.type === "House") queryType = "houses";
    else if (filters.type === "Room") queryType = "rooms";
    else if (filters.type === "Hostel") queryType = "hostels";
    else if (filters.type === "Apartment") queryType = "apartments";
    else if (filters.type === "Office") queryType = "offices";
    else queryType = "properties";
  } else if (filters.type) {
    if (filters.type === "House") queryType = "houses";
    else if (filters.type === "Room") queryType = "rooms";
    else if (filters.type === "Hostel") queryType = "hostels";
    else if (filters.type === "Apartment") queryType = "apartments";
    else if (filters.type === "Office") queryType = "offices";
  }

  // If no filters and not a FAQ, give helpful tip
  if (Object.keys(filters).length === 0 && !filters.allFlag) {
    return res.json({
      action: "answer",
      text: "🤖 I can help you find properties. Try saying:\n• 'all houses'\n• 'rooms under 200k'\n• 'hostels near Lilongwe'\n• 'furnished apartments with pool'\n• 'offices in town'\nOr ask me: 'How do I list a property?'"
    });
  }

  const houses = await searchHouses(filters, filters.allFlag ? 'all' : null);
  if (houses.length === 0) {
    let suggestion = `Sorry, I couldn't find any ${queryType}`;
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
  res.json({ action: "searchResults", houses: houseList, queryType });
});

module.exports = router;