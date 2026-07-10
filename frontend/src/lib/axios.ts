import axios from 'axios';

const instance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
instance.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: a 401 on any authenticated call means the stored session
// is no longer valid (expired/revoked token). Clear it and send the user to the
// login page — but never for the auth endpoints themselves (a bad login is not a
// session expiry) or when already on an auth page, which would loop.
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error?.response?.status === 401) {
      const url: string = error.config?.url || '';
      const isAuthCall = url.includes('/api/v1/auth/');
      const onAuthPage = window.location.pathname.startsWith('/auth');
      if (!isAuthCall && !onAuthPage) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);

export default instance;
