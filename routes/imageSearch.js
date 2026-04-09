// routes/imageSearch.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const House = require('../models/House');

// Helper: cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// POST /api/image-search/find-similar – find similar houses based on feature vector
router.post('/find-similar', auth, async (req, res) => {
    try {
        const { vector } = req.body;
        if (!vector || !Array.isArray(vector)) {
            return res.status(400).json({ message: 'Invalid feature vector' });
        }
        const houses = await House.find({ featureVector: { $ne: null } }).select('_id name location price type bedrooms images averageRating featureVector');
        const withSimilarity = houses.map(house => ({
            house,
            similarity: cosineSimilarity(vector, house.featureVector)
        }));
        withSimilarity.sort((a, b) => b.similarity - a.similarity);
        const top5 = withSimilarity.slice(0, 5).map(item => item.house);
        res.json(top5);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/image-search/update-vector/:houseId – store a pre‑computed vector (from frontend)
router.post('/update-vector/:houseId', auth, async (req, res) => {
    try {
        const house = await House.findById(req.params.houseId);
        if (!house) return res.status(404).json({ message: 'House not found' });
        // Only owner or admin can update
        if (house.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const { vector } = req.body;
        if (!vector || !Array.isArray(vector)) {
            return res.status(400).json({ message: 'Invalid feature vector' });
        }
        house.featureVector = vector;
        await house.save();
        res.json({ message: 'Feature vector updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ========== NEW: Compute vector on the server for a given house (requires TensorFlow.js) ==========
router.post('/compute-vector/:houseId', auth, async (req, res) => {
    try {
        const house = await House.findById(req.params.houseId);
        if (!house) return res.status(404).json({ message: 'House not found' });
        if (house.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        if (!house.images || house.images.length === 0) {
            return res.status(400).json({ message: 'House has no images' });
        }

        // Try to load TensorFlow.js and MobileNet (optional dependencies)
        let tf, mobilenet;
        try {
            tf = require('@tensorflow/tfjs-node');
            mobilenet = require('@tensorflow-models/mobilenet');
        } catch (err) {
            console.error('TensorFlow.js not installed. Please run: npm install @tensorflow/tfjs-node @tensorflow-models/mobilenet axios');
            return res.status(500).json({ message: 'Server missing AI libraries. Please run the backfill script instead.' });
        }

        const axios = require('axios');
        const fs = require('fs');
        const path = require('path');

        const imageUrl = house.images[0];
        // Download image to a temporary file
        const response = await axios({ url: imageUrl, responseType: 'stream' });
        const tempPath = path.join(__dirname, '../temp_compute.jpg');
        const writer = fs.createWriteStream(tempPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Load model and compute vector
        const model = await mobilenet.load();
        const imageBuffer = fs.readFileSync(tempPath);
        const tensor = tf.node.decodeImage(imageBuffer);
        const resized = tf.image.resizeBilinear(tensor, [224, 224]);
        const expanded = resized.expandDims(0);
        const normalized = expanded.toFloat().div(255);
        const features = await model.infer(normalized, true);
        const vector = Array.from(features.dataSync());

        // Cleanup
        tf.dispose([tensor, resized, expanded, normalized, features]);
        fs.unlinkSync(tempPath);

        house.featureVector = vector;
        await house.save();

        res.json({ message: 'Feature vector computed and stored successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error: ' + err.message });
    }
});
// ==========================================================================

module.exports = router;