const pincodeSearch = require('india-pincode-search');

const pincodeToSearch = '508213';
const results = pincodeSearch.search(pincodeToSearch);

if (results && results.length > 0) {
    console.log(`Original result object from library for pincode ${pincodeToSearch}:`);
    console.log(results[0]); // Log the original object

    // --- Transformation Step ---
    // Assuming there's only one result for simplicity here
    const originalResult = results[0];

    // Create a new object with corrected/preferred property names
    const correctedLocation = {
        stateName: originalResult.state, // 'ANDHRA PRADESH'
        districtName: originalResult.city, // 'WEST GODAVARI' - Treat 'city' as district
        talukOrMandal: originalResult.district, // 'Chintalapudi' - Treat 'district' as taluk/mandal
        locality: originalResult.village, // 'Chintalapudi' - Treat 'village' as the specific town/village
        postOfficeName: originalResult.office, // 'Chintalapudi S.O'
        pinCode: originalResult.pincode // '534460'
        // Add any other properties you might need
    };

    console.log(`\nTransformed object with preferred property names:`);
    console.log(correctedLocation);

    // Now you can use the 'correctedLocation' object in the rest of your application
    // Example:
    // displayLocationOnMap(correctedLocation.locality, correctedLocation.districtName, correctedLocation.stateName);

} else {
    console.log(`No locations found for pincode ${pincodeToSearch}.`);
}