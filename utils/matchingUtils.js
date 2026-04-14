// utils/matchingUtils.js
/**
 * Check if a house matches the filters of a saved search.
 * Supports: minPrice, maxPrice, type, bedrooms, region, wifi, parking, furnished, petFriendly, pool, ac, selfContained
 * @param {Object} house - House document from DB
 * @param {Object} filters - SavedSearch.filters object
 * @returns {boolean}
 */
function houseMatchesFilters(house, filters) {
  // If no filters, treat as match (should not happen, but safe)
  if (!filters || Object.keys(filters).length === 0) return true;
  
  // Price range
  if (filters.minPrice && house.price < filters.minPrice) return false;
  if (filters.maxPrice && house.price > filters.maxPrice) return false;

  // Property type
  if (filters.type && house.type !== filters.type) return false;

  // Bedrooms
  if (filters.bedrooms && house.bedrooms < filters.bedrooms) return false;

  // Region (based on location string)
  if (filters.region) {
    const regionMap = {
      'Northern': ['Mzuzu', 'Rumphi', 'Karonga', 'Chitipa', 'Nkhata Bay', 'Mzimba'],
      'Central': ['Lilongwe', 'Dedza', 'Salima', 'Mchinji', 'Ntcheu', 'Kasungu', 'Dowa', 'Nkhotakota'],
      'Southern': ['Blantyre', 'Zomba', 'Mulanje', 'Thyolo', 'Mangochi', 'Balaka', 'Chikwawa', 'Nsanje', 'Phalombe', 'Machinga']
    };
    const cities = regionMap[filters.region] || [];
    const locationLower = (house.location || '').toLowerCase();
    const matches = cities.some(city => locationLower.includes(city.toLowerCase()));
    if (!matches) return false;
  }

  // District filter (simple substring match in location)
  if (filters.district) {
    const districtLower = filters.district.toLowerCase();
    if (!(house.location || '').toLowerCase().includes(districtLower)) return false;
  }

  // Amenities
  if (filters.wifi === true && !house.wifi) return false;
  if (filters.parking === true && !house.parking) return false;
  if (filters.furnished === true && !house.furnished) return false;
  if (filters.petFriendly === true && !house.petFriendly) return false;
  if (filters.pool === true && !house.pool) return false;
  if (filters.ac === true && !house.ac) return false;
  if (filters.selfContained === true && !house.selfContained) return false;

  // Gender restriction
  if (filters.gender && house.gender !== filters.gender && filters.gender !== 'none') return false;

  // Property details (e.g., `propertyDetails.someField`)
  if (filters.propertyDetails) {
    for (const [key, value] of Object.entries(filters.propertyDetails)) {
      if (house.propertyDetails && house.propertyDetails[key] !== value) return false;
      if (!house.propertyDetails) return false;
    }
  }

  return true;
}

module.exports = { houseMatchesFilters };