import { GoogleLogin } from '@react-oauth/google';

const SignIn = ({ onLoginSuccess }) => {
  const handleSuccess = (credentialResponse) => {
    console.log('Login Success:', credentialResponse);
    localStorage.setItem('googleCredential', credentialResponse.credential);
    onLoginSuccess(credentialResponse);
  };

  const handleError = () => {
    console.log('Login Failed');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Welcome to Calendar AI
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in with your Google account to access your calendar
          </p>
        </div>
        
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            size="large"
            theme="outline"
            shape="rectangular"
            logo_alignment="left"
          />
        </div>
        
        <div className="text-center">
          <p className="text-xs text-gray-500">
            By signing in, you agree to let Calendar AI access your Google Calendar
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignIn;