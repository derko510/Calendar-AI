const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://server-nu-eight-16.vercel.app';

class AuthService {
  constructor() {
    this.isAuthenticated = false;
    this.userSession = null;
  }

  async initializeBackendSession(googleCredential) {
    try {
      console.log('🔄 Initializing backend session...');
      console.log('📝 Google credential structure:', {
        hasAccessToken: !!googleCredential?.accessToken,
        hasCredential: !!googleCredential?.credential,
        keys: Object.keys(googleCredential || {})
      });
      
      // Send Google credential to backend to establish session
      const response = await fetch(`${API_BASE_URL}/api/auth/google-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          accessToken: googleCredential.accessToken,
          credential: googleCredential.credential
        })
      });

      if (response.ok) {
        const userData = await response.json();
        console.log('✅ Backend session established');
        this.isAuthenticated = true;
        this.userSession = userData.user;
        return userData;
      } else {
        throw new Error('Failed to establish backend session');
      }
    } catch (error) {
      console.error('❌ Backend session error:', error);
      throw error;
    }
  }

  async checkBackendSession() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const userData = await response.json();
        this.isAuthenticated = true;
        this.userSession = userData.user;
        return userData;
      } else {
        this.isAuthenticated = false;
        this.userSession = null;
        return null;
      }
    } catch (error) {
      console.error('Session check error:', error);
      this.isAuthenticated = false;
      this.userSession = null;
      return null;
    }
  }

  async logout() {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.isAuthenticated = false;
      this.userSession = null;
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