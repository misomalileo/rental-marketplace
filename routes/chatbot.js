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
// ENHANCED FILTER EXTRACTION (with more synonyms)
// ======================================
function extractFilters(message) {
  const msg = message.toLowerCase();
  const filters = {};

  // Property type with extensive synonyms (including room variations)
  const typeMap = {
    house: "House",
    houses: "House",
    home: "House",
    villa: "House",
    cottage: "House",
    hostel: "Hostel",
    hostels: "Hostel",
    dorm: "Hostel",
    dormitory: "Hostel",
    apartment: "Apartment",
    apartments: "Apartment",
    flat: "Apartment",
    flats: "Apartment",
    condo: "Apartment",
    room: "Room",
    rooms: "Room",
    studio: "Room",
    bedsitter: "Room",
    bedsit: "Room",
    "single room": "Room",
    "double room": "Room",
    office: "Office",
    offices: "Office",
    workspace: "Office"
  };
  for (const [word, type] of Object.entries(typeMap)) {
    if (msg.includes(word)) {
      filters.type = type;
      break;
    }
  }

  // Price (supports various formats)
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

  // Bedrooms
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

  // Location (after "in", "near", "at", "around", "close to")
  const locationPattern = /(?:in|near|at|around|close to)\s+([a-z]+(?:\s+[a-z]+)?)/i;
  const locMatch = msg.match(locationPattern);
  if (locMatch) filters.location = locMatch[1];

  // Amenities (extended synonyms)
  const amenityMap = {
    wifi: ["wifi", "wi-fi", "internet", "wireless", "broadband"],
    parking: ["parking", "car park", "parking lot", "garage", "driveway"],
    furnished: ["furnished", "furniture", "fully furnished", "semi-furnished"],
    petFriendly: ["pet friendly", "pets allowed", "dogs allowed", "cats allowed", "pet"],
    pool: ["pool", "swimming pool", "swimming", "pool area"],
    ac: ["ac", "air conditioning", "aircon", "a/c", "cooling"]
  };
  for (const [key, words] of Object.entries(amenityMap)) {
    if (words.some(word => msg.includes(word))) filters[key] = true;
  }

  return filters;
}

// ======================================
// EXPANDED FAQ (professional responses)
// ======================================
const faq = [
  { patterns: [/how to list/, /list a property/, /post a listing/, /add property/], 
    answer: "📋 To list a property:\n1. Log in as a landlord\n2. Go to your dashboard\n3. Click 'Upload New House'\n4. Fill in all details (name, location, price, photos)\n5. Submit – your listing will be reviewed and appear on the site shortly." },
  { patterns: [/cost to list/, /how much to list/, /listing fee/], 
    answer: "💰 Listing a property is completely free. You can optionally pay to become a verified landlord (official or premium) or to feature a house for better visibility." },
  { patterns: [/feature house/, /make featured/, /promote listing/], 
    answer: "⭐ To feature a house:\n1. Go to your dashboard\n2. Find the house and click 'Feature (K5000)'\n3. Complete payment via Airtel Money, TNM Mpamba, or Bank Transfer\n4. Your house will appear as FEATURED on the homepage." },
  { patterns: [/become official/, /official landlord/, /get verified/], 
    answer: "✅ You can become an official landlord by paying MWK 2500 from your dashboard. This adds a verified badge to your profile and increases trust." },
  { patterns: [/become premium/, /premium landlord/], 
    answer: "👑 You can become a premium landlord by paying MWK 5000 from your dashboard. This adds a premium badge, extra visibility, and access to advanced analytics." },
  { patterns: [/contact support/, /help/, /support/, /need help/], 
    answer: "📞 You can contact support via the contact form on our website or email us at support@khomolathu.com. Our team typically responds within 24 hours." },
  { patterns: [/report/, /fake listing/, /report a listing/], 
    answer: "🚨 If you see a fake or suspicious listing, click the 'Report' button on the property card. Our admin team will review it and take action." },
  { patterns: [/how it works/, /how does it work/], 
    answer: "🔍 Khomo Lathu works simply:\n- Landlords list properties for free\n- Tenants search by location, price, type\n- Contact landlords directly via WhatsApp or chat\n- Book properties online with date selection." },
  { patterns: [/payment methods/, /how to pay/, /pay/], 
    answer: "💳 We support Airtel Money, TNM Mpamba, and Standard Bank. Payments are processed securely through PayChangu. Your information is encrypted." },
  { patterns: [/refund/, /refund policy/], 
    answer: "🔄 Refunds are handled case by case. If you have an issue with a booking or payment, please contact support with your transaction ID." },
  { patterns: [/booking/, /how to book/, /request booking/], 
    answer: "📅 To book a property:\n1. Click 'Request Booking' on the property card\n2. Select your check-in and check-out dates\n3. Add a message to the landlord\n4. Send request – the landlord will approve or reject." },
  { patterns: [/cancel booking/, /cancel/], 
    answer: "❌ You can cancel a booking by contacting the landlord directly through chat. Refunds depend on the landlord's cancellation policy." },
  { patterns: [/what is this site/, /about us/, /what is khomo lathu/], 
    answer: "🏠 Khomo Lathu is Malawi's premier rental marketplace, connecting landlords and tenants across the country. We offer verified listings, online booking, secure payments, and lease management." },
  { patterns: [/rooms/, /room for rent/, /looking for room/], 
    answer: "🔑 I can help you find rooms. Try saying: 'rooms under 150k' or 'single room in Lilongwe'. Would you like me to search for rooms?" },
  { patterns: [/hostel/, /hostels/, /student accommodation/], 
    answer: "🏨 I can find hostels for you. Try: 'hostels near Mzuzu University' or 'budget hostels under 100k'. Want me to search now?" },
  { patterns: [/apartment/, /apartments/, /flat/], 
    answer: "🏢 Looking for an apartment? Tell me your budget and location, e.g., '2 bedroom apartment under 300k in Blantyre'." },
  { patterns: [/house/, /houses/, /villa/], 
    answer: "🏡 I can help you find houses. Try: '3 bedroom house with parking' or 'house under 500k'." },
  { patterns: [/office/, /offices/, /commercial space/], 
    answer: "🏢 Looking for office space? Tell me your requirements, e.g., 'office in Limbe under 200k'." }
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

  // If no filters were extracted, give a helpful tip with examples
  if (Object.keys(filters).length === 0) {
    return res.json({
      action: "answer",
      text: "💡 I can help you find properties. Try saying:\n• 'rooms under 200k'\n• 'hostels near Chichiri'\n• 'furnished apartments with pool'\n• 'offices in town'\n• '3 bedroom house with parking'\n\nOr ask me: 'How do I list a property?'"
    });
  }

  const houses = await searchHouses(filters);
  if (houses.length === 0) {
    let suggestion = "🔍 Sorry, I couldn't find any";
    if (filters.type) suggestion += ` ${filters.type.toLowerCase()}s`;
    else suggestion += " properties";
    if (filters.location) suggestion += ` in ${filters.location}`;
    if (filters.maxPrice) suggestion += ` under MWK ${filters.maxPrice.toLocaleString()}`;
    suggestion += ". Try adjusting your filters or use different words. For example: 'rooms under 150k' or 'hostels in Blantyre'.";
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