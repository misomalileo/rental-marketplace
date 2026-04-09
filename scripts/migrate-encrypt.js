require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const House = require('../models/House');

mongoose.connect(process.env.MONGO_URI);

async function migrate() {
  const users = await User.find();
  for (const user of users) {
    await user.save();
    console.log(`✅ Encrypted user ${user.email}`);
  }
  const houses = await House.find();
  for (const house of houses) {
    await house.save();
    console.log(`✅ Encrypted house ${house.name}`);
  }
  console.log("Migration complete");
  process.exit();
}
migrate();