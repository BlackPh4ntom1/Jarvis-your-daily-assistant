import { useState } from 'react';
import '../styles/Auth.css'

const AuthPage = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const endpoint = isLogin ? '/api/login' : '/api/register';
      const body = isLogin 
        ? { email: formData.email, password: formData.password }
        : { username: formData.username, email: formData.email, password: formData.password };

      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.ok) {
        // Store token in localStorage
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_info', JSON.stringify(data.user));
        
        // Call success callback
        onLoginSuccess(data.user, data.token);
      } else {
        setError(data.message || 'Authentication failed');
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData({ username: '', email: '', password: '' });
  };

  return (
    <div className='container'>
      <div className='authCard'>
        <div className='header'>
          <h1 className='title'> Jarvis </h1>
          <p className='subtitle'>
            {isLogin ? 'Welcome back! Sign in to continue.' : 'Create your account to get started.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className='form'>
          {!isLogin && (
            <div className='inputGroup'>
              <label className='label'>Username</label>
              <input className='input'
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                
                placeholder="Choose a username"
                required={!isLogin}
              />
            </div>
          )}

          <div className='inputGroup'>
            <label className='label'>Email</label>
            <input className='input'
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
            
              placeholder="Enter your email"
              required
            />
          </div>

          <div className='inputGroup'>
            <label className='label'>Password</label>
            <input className='input'
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              minLength="6"
              required
            />
          </div>

          {error && <div className='error'>{error}</div>}

          <button className='submitButton'
            type="submit" 
            disabled={isLoading}
          >
            {isLoading ? ' Processing...' : (isLogin ? ' Sign In' : ' Create Account')}
          </button>
        </form>

        <div className='footer'>
          <p className='switchText'>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button className='switchButton'
              type="button" 
              onClick={toggleMode} 
              disabled={isLoading}
            >
              {isLogin ? 'Sign up here' : 'Sign in here'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;