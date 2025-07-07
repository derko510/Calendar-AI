import { verifyToken, refreshToken } from '../utils/jwt.js';

export const requireJWTAuth = (req, res, next) => {
  try {
    // Check for JWT token in Authorization header or query parameter
    let token = null;
    
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // Check query parameter as fallback
    if (!token && req.query.token) {
      token = req.query.token;
    }
    
    // Check body for token (for POST requests)
    if (!token && req.body && req.body.token) {
      token = req.body.token;
    }
    
    if (!token) {
      console.log('❌ No JWT token provided');
      return res.status(401).json({ error: 'Access token required' });
    }
    
    // Verify the token
    const decoded = verifyToken(token);
    if (!decoded) {
      console.log('❌ Invalid JWT token');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Add user info to request
    req.user = decoded;
    req.token = token;
    
    console.log('✅ JWT authentication successful:', {
      userId: decoded.id,
      email: decoded.email,
      exp: new Date(decoded.exp * 1000).toISOString()
    });
    
    next();
  } catch (error) {
    console.error('JWT auth middleware error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export const optionalJWTAuth = (req, res, next) => {
  try {
    // Same logic as requireJWTAuth but doesn't fail if no token
    let token = null;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    if (!token && req.query.token) {
      token = req.query.token;
    }
    
    if (!token && req.body && req.body.token) {
      token = req.body.token;
    }
    
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        req.user = decoded;
        req.token = token;
        console.log('✅ Optional JWT auth successful:', decoded.email);
      } else {
        console.log('⚠️ Invalid JWT token provided, proceeding without auth');
      }
    } else {
      console.log('ℹ️ No JWT token provided, proceeding without auth');
    }
    
    next();
  } catch (error) {
    console.error('Optional JWT auth error:', error);
    next(); // Continue without auth
  }
};