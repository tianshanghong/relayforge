import { useEffect } from 'react';

export function AuthCallback() {
  useEffect(() => {
    // Get params from URL
    const params = new URLSearchParams(window.location.search);
    const sessionUrl = params.get('session_url');
    const email = params.get('email');
    const credits = params.get('credits');
    const isNewUser = params.get('is_new_user') === 'true';
    const error = params.get('error');
    const message = params.get('message');

    if (error) {
      // Handle error
      console.error('OAuth error:', error, message);
      // Redirect to home with error
      window.location.href = `/?auth_error=${encodeURIComponent(message || error)}`;
    } else if (sessionUrl && email && credits) {
      // Success - redirect to home with session info
      const redirectUrl = new URL('/', window.location.origin);
      redirectUrl.searchParams.set('session_url', sessionUrl);
      redirectUrl.searchParams.set('email', email);
      redirectUrl.searchParams.set('credits', credits);
      if (isNewUser) {
        redirectUrl.searchParams.set('welcome', 'true');
      }
      window.location.href = redirectUrl.toString();
    } else {
      // Invalid callback
      window.location.href = '/?auth_error=Invalid+callback';
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800">Completing sign in...</h2>
          <p className="text-gray-600 mt-2">Please wait while we redirect you.</p>
        </div>
      </div>
    </div>
  );
}