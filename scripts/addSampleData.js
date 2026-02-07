const pool = require('../config/database');

const samplePianos = [
    {
        name: 'Steinway Model D Concert Grand',
        image_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=1000',
        category: 'Grand',
        price_per_hour: 500000,
        rating: 5.0,
        reviews_count: 256,
        description: 'Đàn piano concert grand đẳng cấp thế giới, được sử dụng trong các buổi hòa nhạc chuyên nghiệp.',
        features: ['Concert Grand 274cm', 'Âm thanh đỉnh cao', 'Handcrafted in Germany', 'Phòng thu chuyên nghiệp']
    },
    {
        name: 'Kawai K-300 Upright',
        image_url: 'https://images.unsplash.com/photo-1510915228340-29c85a43dcfe?q=80&w=1000',
        category: 'Upright',
        price_per_hour: 180000,
        rating: 4.7,
        reviews_count: 142,
        description: 'Đàn piano đứng Nhật Bản chất lượng cao, phù hợp cho gia đình và học viên.',
        features: ['Chiều cao 122cm', 'Millennium III Action', 'Âm thanh rõ ràng', 'Tiết kiệm không gian']
    },
    {
        name: 'Roland FP-90X Digital',
        image_url: 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?q=80&w=1000',
        category: 'Digital',
        price_per_hour: 120000,
        rating: 4.6,
        reviews_count: 98,
        description: 'Đàn piano điện tử cao cấp với công nghệ mô phỏng âm thanh tiên tiến.',
        features: ['88 phím PHA-50', 'Bluetooth Audio/MIDI', 'SuperNATURAL Piano', 'Portable']
    },
    {
        name: 'Yamaha U1 Upright',
        image_url: 'https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?q=80&w=1000',
        category: 'Upright',
        price_per_hour: 200000,
        rating: 4.8,
        reviews_count: 187,
        description: 'Mẫu đàn upright kinh điển, bền bỉ và âm thanh ổn định qua thời gian.',
        features: ['Chiều cao 121cm', 'Độ bền cao', 'Bảo trì dễ dàng', 'Giá trị lâu dài']
    },
    {
        name: 'Casio Privia PX-S3100',
        image_url: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?q=80&w=1000',
        category: 'Digital',
        price_per_hour: 90000,
        rating: 4.4,
        reviews_count: 76,
        description: 'Đàn piano điện tử siêu mỏng, phù hợp cho người mới bắt đầu và không gian nhỏ.',
        features: ['Thiết kế siêu mỏng', '88 phím Smart Scaled', 'Loa tích hợp', 'USB Audio/MIDI', 'Giá cả phải chăng']
    }
];

async function addSampleData() {
    console.log('🔄 Adding more sample pianos to database...\n');

    try {
        const insertQuery = `
      INSERT INTO pianos (name, image_url, category, price_per_hour, rating, reviews_count, description, features)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name;
    `;

        for (const piano of samplePianos) {
            try {
                const result = await pool.query(insertQuery, [
                    piano.name,
                    piano.image_url,
                    piano.category,
                    piano.price_per_hour,
                    piano.rating,
                    piano.reviews_count,
                    piano.description,
                    piano.features
                ]);

                console.log(`✅ Added: ${result.rows[0].name} (ID: ${result.rows[0].id})`);
            } catch (error) {
                console.log(`⚠️  Skipped: ${piano.name} (may already exist)`);
            }
        }

        console.log('\n✅ Sample data added successfully!');

        // Display statistics
        const statsQuery = 'SELECT COUNT(*) as total, category FROM pianos GROUP BY category';
        const stats = await pool.query(statsQuery);

        console.log('\n📊 Current Database Statistics:');
        stats.rows.forEach(row => {
            console.log(`  ${row.category}: ${row.total}`);
        });

        const totalQuery = 'SELECT COUNT(*) as total FROM pianos';
        const total = await pool.query(totalQuery);
        console.log(`  TOTAL: ${total.rows[0].total}\n`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding sample data:', error);
        process.exit(1);
    }
}

addSampleData();
