const email = 'dot134996@gmail.com';

async function test(url) {
    try {
        console.log(`Testing OTP send to: ${url}`);
        const response = await fetch(`${url}/api/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, type: 'signup' })
        });
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
            if (response.ok) console.log('✅ Success:', data);
            else console.error('❌ API Error:', data);
        } else {
            const text = await response.text();
            console.error('❌ Non-JSON Response:', text);
        }
    } catch (error) {
        console.error(`❌ Network Error (${url}):`, error.message);
    }
}

(async () => {
    await test('http://127.0.0.1:5000');
    // await test('http://localhost:5000');
})();
