const { COLLECTION } = require('../constants');

const indexes = {
    [COLLECTION.EVENTS]: [
        { keys: { next_schedule: 1 }, options: { name: 'idx_next_schedule' } },
        { keys: { client_id: 1 }, options: { name: 'idx_client_id' } },
        { keys: { booking_id: 1 }, options: { name: 'idx_booking_id' } },
        { keys: { officers: 1 }, options: { name: 'idx_officers' } },
        { keys: { next_schedule: 1, client_id: 1 }, options: { name: 'idx_next_schedule_client' } },
        { keys: { next_schedule: 1, officers: 1 }, options: { name: 'idx_next_schedule_officers' } },
        { keys: { created_at: -1 }, options: { name: 'idx_created_at' } }
    ],
    
    [COLLECTION.CALL_LOG_ACTIVITY]: [
        { keys: { next_schedule: 1 }, options: { name: 'idx_next_schedule' } },
        { keys: { client_id: 1 }, options: { name: 'idx_client_id' } },
        { keys: { officer_id: 1 }, options: { name: 'idx_officer_id' } },
        { keys: { next_schedule: 1, client_id: 1 }, options: { name: 'idx_next_schedule_client' } },
        { keys: { next_schedule: 1, officer_id: 1 }, options: { name: 'idx_next_schedule_officer' } },
        { keys: { created_at: -1 }, options: { name: 'idx_created_at' } }
    ],

    // Add more collections as needed
    [COLLECTION.BOOKINGS]: [
        { keys: { client_id: 1 }, options: { name: 'idx_client_id' } },
        { keys: { status: 1 }, options: { name: 'idx_status' } },
        { keys: { created_at: -1 }, options: { name: 'idx_created_at' } }
    ]
};

const createIndexes = async (db) => {
    try {
        console.log('🔧 Starting index creation...');
        
        for (const [collectionName, indexList] of Object.entries(indexes)) {
            console.log(`\n📁 Processing collection: ${collectionName}`);
            
            const collection = db.collection(collectionName);
            
            // Get existing indexes
            const existingIndexes = await collection.indexes();
            const existingIndexNames = existingIndexes.map(idx => idx.name);
            
            for (const { keys, options } of indexList) {
                try {
                    // Check if index already exists
                    if (existingIndexNames.includes(options.name)) {
                        console.log(`   ✓ Index "${options.name}" already exists`);
                        continue;
                    }
                    
                    // Create index
                    await collection.createIndex(keys, options);
                    console.log(`   ✅ Created index: "${options.name}" on ${JSON.stringify(keys)}`);
                    
                } catch (indexError) {
                    // Handle duplicate key error gracefully
                    if (indexError.code === 85 || indexError.code === 86) {
                        console.log(`   ⚠️  Index "${options.name}" already exists (duplicate)`);
                    } else {
                        console.error(`   ❌ Error creating index "${options.name}":`, indexError.message);
                    }
                }
            }
        }
        
        console.log('\n✅ Index creation completed!\n');
        
    } catch (error) {
        console.error('❌ Error in index creation:', error);
        throw error;
    }
};

const dropAllIndexes = async (db) => {
    try {
        console.log('🗑️  Starting index removal...');
        
        for (const collectionName of Object.keys(indexes)) {
            const collection = db.collection(collectionName);
            await collection.dropIndexes();
            console.log(`   ✓ Dropped all indexes from ${collectionName}`);
        }
        
        console.log('✅ All indexes dropped!\n');
        
    } catch (error) {
        console.error('❌ Error dropping indexes:', error);
        throw error;
    }
};

const listAllIndexes = async (db) => {
    try {
        console.log('📋 Listing all indexes...\n');
        
        for (const collectionName of Object.keys(indexes)) {
            const collection = db.collection(collectionName);
            const indexes = await collection.indexes();
            
            console.log(`📁 ${collectionName}:`);
            indexes.forEach(idx => {
                console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
            console.log('');
        }
        
    } catch (error) {
        console.error('❌ Error listing indexes:', error);
        throw error;
    }
};

module.exports = {
    createIndexes,
    dropAllIndexes,
    listAllIndexes,
    indexes
};




//                 db.whatsapp_messages.createIndex({ timestamp: -1 });
// db.whatsapp_messages.createIndex({ lead_id: 1 });
// db.whatsapp_messages.createIndex({ phone: 1 });
// db.whatsapp_messages.createIndex({ is_viewed: 1, outgoing: 1 });

// // Leads
// db.leads.createIndex({ officer_id: 1 });

// // Officers
// db.officers.createIndex({ _id: 1 });