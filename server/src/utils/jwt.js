import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'your-jwt-secret-key-change-this';
const JWT_EXPIRES_IN = '7d'; // 7 days

export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'calendar-ai'
  });
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return null;
  }
};

export const refreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    
    // Check if token is expired by more than 1 day - if so, require re-auth
    const tokenExp = decoded.exp * 1000;
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    if (tokenExp < oneDayAgo) {
      console.log('Token too old to refresh, require re-authentication');
      return null;
    }
    
    // Generate new token with fresh expiration
    const { iat, exp, ...payload } = decoded;
    return generateToken(payload);
  } catch (error) {
    console.error('Token refresh failed:', error.message);
    return null;
  }
};