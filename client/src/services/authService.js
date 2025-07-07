const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://server-nu-eight-16.vercel.app';

class AuthService {
  constructor() {
    this.isAuthenticated = false;
    this.userSession = null;
    this.jwtToken = null;
    this.loadTokenFromStorage();
  }

  loadTokenFromStorage() {
    try {
      const token = localStorage.getItem('calendar-ai-jwt');
      if (token) {
        // Verify token isn't expired
        const payload = this.parseJWT(token);
        if (payload && payload.exp * 1000 > Date.now()) {
          this.jwtToken = token;
          this.userSession = {
            id: payload.id,
            email: payload.email,
            name: payload.name,
            googleId: payload.googleId
          };
          this.isAuthenticated = true;
          console.log('✅ JWT token loaded from storage for:', payload.email);
        } else {
          console.log('⚠️ Stored JWT token is expired, clearing...');
          this.clearToken();
        }
      }
    } catch (error) {
      console.error('Error loading JWT token:', error);
      this.clearToken();
    }
  }

  parseJWT(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error parsing JWT:', error);
      return null;
    }
  }

  saveToken(token, user) {
    try {
      localStorage.setItem('calendar-ai-jwt', token);
      this.jwtToken = token;
      this.userSession = user;
      this.isAuthenticated = true;
      console.log('✅ JWT token saved for:', user.email);
    } catch (error) {
      console.error('Error saving JWT token:', error);
    }
  }

  clearToken() {
    localStorage.removeItem('calendar-ai-jwt');
    this.jwtToken = null;
    this.userSession = null;
    this.isAuthenticated = false;
  }

  getAuthHeaders() {
    if (this.jwtToken) {
      return {
        'Authorization': `Bearer ${this.jwtToken}`,
        'Content-Type': 'application/json'
      };
    }
    return {
      'Content-Type': 'application/json'
    };
  }

  async initializeBackendSession(googleCredential) {
    try {
      console.log('🔄 Initializing JWT-based authentication...');
      console.log('📝 Google credential structure:', {
        hasAccessToken: !!googleCredential?.accessToken,
        hasCredential: !!googleCredential?.credential,
        keys: Object.keys(googleCredential || {})
      });
      
      // Check if token is expired
      if (googleCredential.expiresAt && Date.now() > googleCredential.expiresAt) {
        console.log('⚠️ Access token expired, need to re-authenticate');
        throw new Error('Access token expired. Please sign in again.');
      }
      
      // Send Google credential to backend to get JWT token
      const response = await fetch(`${API_BASE_URL}/api/auth/google-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: googleCredential.accessToken,
          credential: googleCredential.credential
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ JWT authentication established');
        
        if (data.token) {
          // Save JWT token
          this.saveToken(data.token, data.user);
          console.log('✅ JWT token saved to localStorage');
        }
        
        return data;
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ JWT authentication failed:', errorData);
        
        // If it's a 401 error, likely token expired
        if (response.status === 401) {
          console.log('🔄 Token invalid, clearing localStorage and requiring re-auth');
          localStorage.removeItem('googleAuth');
          this.clearToken();
          throw new Error('Access token invalid. Please sign in again.');
        }
        
        throw new Error(`Failed to establish JWT authentication: ${errorData.error}`);
      }
    } catch (error) {
      console.error('❌ JWT authentication error:', error);
      throw error;
    }
  }

  async checkBackendSession() {
    try {
      // If we don't have a JWT token, we're not authenticated
      if (!this.jwtToken) {
        console.log('ℹ️ No JWT token available');
        this.isAuthenticated = false;
        this.userSession = null;
        return null;
      }

      // Test the token with the backend
      const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        const userData = await response.json();
        console.log('✅ JWT token is valid');
        return { user: userData.user || this.userSession };
      } else {
        console.log('❌ JWT token is invalid or expired');
        this.clearToken();
        return null;
      }
    } catch (error) {
      console.error('JWT session check error:', error);
      this.clearToken();
      return null;
    }
  }

  async logout() {
    try {
      // Clear JWT token
      this.clearToken();
      console.log('✅ JWT logout successful');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  getUser() {
    return this.userSession;
  }

  isLoggedIn() {
    return this.isAuthenticated;
  }
}

export default new AuthService();