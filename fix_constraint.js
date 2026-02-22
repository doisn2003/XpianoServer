const pool = require('./config/database');

async function fix() {
    const client = await pool.connect();
    try {
        await client.query('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_type_check');
        await client.query("ALTER TABLE public.orders ADD CONSTRAINT orders_type_check CHECK (type IN ('buy', 'rent', 'course'))");
        console.log('Constraint updated successfully');
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

fix();
