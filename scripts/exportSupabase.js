/**
 * Supabase Database Export Script
 * Exports all tables to JSON file
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase credentials
const supabaseUrl = 'https://pjgjusdmzxrhgiptfvbg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqZ2p1c2RtenhyaGdpcHRmdmJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDM1MTgsImV4cCI6MjA4NTg3OTUxOH0.y2jJlMxwxV4ulTG_-2EuW1dPDNRyh8irfKeBCShFPlQ';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Tables to export
const TABLES = [
    'profiles',
    'pianos',
    // Add more tables here if needed
];

async function exportDatabase() {
    console.log('🚀 Starting Supabase database export...\n');

    const exportData = {
        exported_at: new Date().toISOString(),
        supabase_url: supabaseUrl,
        tables: {}
    };

    try {
        // Export each table
        for (const tableName of TABLES) {
            console.log(`📊 Exporting table: ${tableName}...`);

            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error(`❌ Error exporting ${tableName}:`, error.message);
                    exportData.tables[tableName] = {
                        error: error.message,
                        count: 0,
                        data: []
                    };
                } else {
                    exportData.tables[tableName] = {
                        count: data?.length || 0,
                        data: data || []
                    };
                    console.log(`✅ Exported ${data?.length || 0} rows from ${tableName}`);
                }
            } catch (err) {
                console.error(`❌ Exception exporting ${tableName}:`, err.message);
                exportData.tables[tableName] = {
                    error: err.message,
                    count: 0,
                    data: []
                };
            }
        }

        // Export auth users (if accessible)
        console.log(`\n📊 Attempting to export auth users...`);
        try {
            const { data: { users }, error } = await supabase.auth.admin.listUsers();

            if (error) {
                console.log(`⚠️  Auth users not accessible with anon key (expected)`);
                exportData.auth_users = {
                    note: 'Requires service_role key for admin access',
                    count: 0
                };
            } else {
                exportData.auth_users = {
                    count: users?.length || 0,
                    data: users?.map(u => ({
                        id: u.id,
                        email: u.email,
                        created_at: u.created_at,
                        email_confirmed_at: u.email_confirmed_at,
                        user_metadata: u.user_metadata
                    })) || []
                };
                console.log(`✅ Exported ${users?.length || 0} auth users`);
            }
        } catch (err) {
            console.log(`⚠️  Auth users export skipped (requires admin key)`);
            exportData.auth_users = {
                note: 'Requires service_role key',
                count: 0
            };
        }

        // Calculate total stats
        const totalRecords = Object.values(exportData.tables).reduce((sum, table) => sum + (table.count || 0), 0);
        exportData.summary = {
            total_tables: TABLES.length,
            total_records: totalRecords,
            tables_exported: Object.keys(exportData.tables).filter(t => exportData.tables[t].count > 0).length
        };

        // Save to JSON file
        const outputPath = path.join(__dirname, 'supabase-export.json');
        fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf8');

        console.log(`\n✅ Export completed successfully!`);
        console.log(`📁 File saved to: ${outputPath}`);
        console.log(`\n📊 Summary:`);
        console.log(`   - Total tables: ${exportData.summary.total_tables}`);
        console.log(`   - Total records: ${exportData.summary.total_records}`);
        console.log(`   - Tables exported: ${exportData.summary.tables_exported}`);

        // Also save a pretty-printed version
        const prettyOutputPath = path.join(__dirname, 'supabase-export-pretty.json');
        fs.writeFileSync(prettyOutputPath, JSON.stringify(exportData, null, 4), 'utf8');
        console.log(`\n📄 Pretty version saved to: ${prettyOutputPath}`);

    } catch (error) {
        console.error('❌ Export failed:', error);
        throw error;
    }
}

// Run export
exportDatabase()
    .then(() => {
        console.log('\n🎉 Export process completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Export process failed:', error);
        process.exit(1);
    });
