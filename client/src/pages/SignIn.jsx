import { GoogleLogin } from '@react-oauth/google';

const SignIn = ({ onLoginSuccess }) => {
  const handleSuccess = (credentialResponse) => {
    console.log('Login Success:', credentialResponse);
    localStorage.setItem('googleCredential', credentialResponse.credential);
    onLoginSuccess(credentialResponse);
  };

  const handleError = (error) => {
    console.log('Login Failed:', error);
    console.log('Current URL:', window.location.href);
    console.log('Origin:', window.location.origin);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="flex items-center justify-center w-full">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center max-w-md w-full mx-4">
          <div className="mb-8">
            <h1 className="text-5xl font-bold text-gray-800 mb-4">
              Login
            </h1>
            <p className="text-gray-500 text-base">
              Access your calendar with Google
            </p>
          </div>
          
          <div className="flex justify-center items-center mb-8">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={handleError}
              size="large"
              theme="outline"
              shape="rectangular"
              logo_alignment="center"
              width="300"
              useOneTap={false}
              auto_select={false}
            />
          </div>
          
          <div>
            <p className="text-sm text-gray-400">
              Secure authentication via Google OAuth
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;