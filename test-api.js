// Test script for Xpiano API
const testAPI = async () => {
    const BASE_URL = 'http://localhost:3000/api';

    console.log('🧪 Testing Xpiano API...\n');

    // Test 1: Get all pianos
    console.log('1️⃣ GET /api/pianos');
    try {
        const response = await fetch(`${BASE_URL}/pianos`);
        const data = await response.json();
        console.log('✅ Success:', data.count, 'pianos found');
        console.log('Sample:', data.data[0]?.name);
        console.log('');
    } catch (error) {
        console.log('❌ Error:', error.message);
    }

    // Test 2: Get piano by ID
    console.log('2️⃣ GET /api/pianos/1');
    try {
        const response = await fetch(`${BASE_URL}/pianos/1`);
        const data = await response.json();
        console.log('✅ Success:', data.data?.name);
        console.log('Features:', data.data?.features);
        console.log('');
    } catch (error) {
        console.log('❌ Error:', error.message);
    }

    // Test 3: Create new piano
    console.log('3️⃣ POST /api/pianos');
    try {
        const response = await fetch(`${BASE_URL}/pianos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Roland Digital Piano',
                category: 'Digital',
                price_per_hour: 150000,
                rating: 4.5,
                reviews_count: 42,
                description: 'Đàn piano điện tử hiện đại',
                features: ['88 phím', 'Âm thanh mô phỏng', 'USB MIDI']
            })
        });
        const data = await response.json();
        console.log('✅ Success: Created piano with ID', data.data?.id);
        console.log('');
    } catch (error) {
        console.log('❌ Error:', error.message);
    }

    // Test 4: Get statistics
    console.log('4️⃣ GET /api/pianos/stats');
    try {
        const response = await fetch(`${BASE_URL}/pianos/stats`);
        const data = await response.json();
        console.log('✅ Success:');
        console.log('  Total pianos:', data.data?.total_pianos);
        console.log('  Average rating:', data.data?.avg_rating);
        console.log('  Average price:', data.data?.avg_price, 'VNĐ');
        console.log('');
    } catch (error) {
        console.log('❌ Error:', error.message);
    }

    console.log('✅ All tests completed!');
};

testAPI();
