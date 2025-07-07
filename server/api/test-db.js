export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Import at runtime for serverless compatibility
    const { db } = await import('../src/db/connection.js');
    const { calendarEvents, users } = await import('../src/db/schema.js');
    
    const userCount = await db.select().from(users);
    const eventCount = await db.select().from(calendarEvents);
    
    res.json({
      users: userCount.length,
      events: eventCount.length,
      status: 'Database connected'
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
}