// scripts/backfillVectors.js
require('dotenv').config();
const mongoose = require('mongoose');
const House = require('../models/House');
const tf = require('@tensorflow/tfjs-node');
const mobilenet = require('@tensorflow-models/mobilenet');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI not defined in .env');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error(err); process.exit(1); });

async function getVectorFromImageUrl(imageUrl) {
  try {
    // Download image to temp file
    const response = await axios({ url: imageUrl, responseType: 'stream' });
    const tempPath = path.join(__dirname, 'temp.jpg');
    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    // Load model (cached)
    const model = await mobilenet.load();
    const image = fs.readFileSync(tempPath);
    const tensor = tf.node.decodeImage(image);
    const resized = tf.image.resizeBilinear(tensor, [224, 224]);
    const expanded = resized.expandDims(0);
    const normalized = expanded.toFloat().div(255);
    const features = await model.infer(normalized, true);
    const vector = Array.from(features.dataSync());
    // Cleanup
    tf.dispose([tensor, resized, expanded, normalized, features]);
    fs.unlinkSync(tempPath);
    return vector;
  } catch (err) {
    console.error(`Failed to process ${imageUrl}:`, err.message);
    return null;
  }
}

async function backfill() {
  const houses = await House.find({ images: { $exists: true, $ne: [] } });
  console.log(`📦 Found ${houses.length} houses with images`);
  let success = 0, fail = 0;
  for (let i = 0; i < houses.length; i++) {
    const house = houses[i];
    const imageUrl = house.images[0];
    if (!imageUrl) continue;
    console.log(`[${i+1}/${houses.length}] ${house.name}`);
    const vector = await getVectorFromImageUrl(imageUrl);
    if (vector) {
      house.featureVector = vector;
      await house.save();
      success++;
      console.log(`   ✅ Vector stored`);
    } else {
      fail++;
      console.log(`   ❌ Failed`);
    }
  }
  console.log(`🎉 Backfill complete. Success: ${success}, Failed: ${fail}`);
  process.exit();
}

backfill();