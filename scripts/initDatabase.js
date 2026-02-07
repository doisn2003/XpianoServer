const pool = require('../config/database');

const createTableQuery = `
  CREATE TABLE IF NOT EXISTS pianos (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(255) NOT NULL,
    image_url TEXT,
    category VARCHAR(100),
    price_per_hour INTEGER,
    rating DECIMAL(2,1),
    reviews_count INTEGER DEFAULT 0,
    description TEXT,
    features TEXT[]
  );
`;

const createIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_pianos_category ON pianos(category);
  CREATE INDEX IF NOT EXISTS idx_pianos_rating ON pianos(rating);
`;

async function initDatabase() {
    try {
        console.log('🔄 Creating pianos table...');
        await pool.query(createTableQuery);
        console.log('✅ Pianos table created successfully');

        console.log('🔄 Creating indexes...');
        await pool.query(createIndexesQuery);
        console.log('✅ Indexes created successfully');

        console.log('🔄 Inserting sample data...');
        const insertQuery = `
      INSERT INTO pianos (name, image_url, category, price_per_hour, rating, reviews_count, description, features)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

        const samplePiano = {
            name: 'Yamaha C3X Grand',
            image_url: 'https://images.unsplash.com/photo-1552422535-c45813c61732?q=80&w=1000&auto=format&fit=crop',
            category: 'Grand',
            price_per_hour: 250000,
            rating: 4.9,
            reviews_count: 128,
            description: 'Dòng đàn Grand Piano tiêu chuẩn thế giới cho âm thanh vang, sáng và cảm giác phím tuyệt vời.',
            features: ['Âm thanh vòm', 'Phím ngà voi nhân tạo', 'Phòng cách âm VIP']
        };

        const result = await pool.query(insertQuery, [
            samplePiano.name,
            samplePiano.image_url,
            samplePiano.category,
            samplePiano.price_per_hour,
            samplePiano.rating,
            samplePiano.reviews_count,
            samplePiano.description,
            samplePiano.features
        ]);

        if (result.rows.length > 0) {
            console.log('✅ Sample piano inserted:', result.rows[0]);
        } else {
            console.log('ℹ️  Sample data already exists');
        }

        console.log('✅ Database initialization completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error initializing database:');
        console.error('Message:', error.message);
        console.error('Detail:', error.detail);
        console.error('Code:', error.code);
        console.error('Full error:', error);
        process.exit(1);
    }
}

initDatabase();
