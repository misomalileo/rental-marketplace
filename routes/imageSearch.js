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

// POST /api/image-search – find similar houses based on feature vector
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

// POST /api/image-search/update-vector/:houseId – (re)compute and store vector for an existing house (admin/premium only)
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

module.exports = router;