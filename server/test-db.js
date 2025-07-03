import { db } from './src/db/connection.js';
import { users } from './src/db/schema.js';

async function testDatabase() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic connection
    const result = await db.select().from(users).limit(1);
    console.log('✅ Database connection successful!');
    console.log('📊 Current users count:', result.length);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

testDatabase();