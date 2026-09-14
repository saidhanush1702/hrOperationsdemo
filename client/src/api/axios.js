import axios from 'axios';
import { startLoading, stopLoading } from '../utils/loadingBus';

const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_URL,
    withCredentials: true,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request Interceptor
api.interceptors.request.use(
    (config) => {
        // Ensure credentials are included with all requests
        config.withCredentials = true;
        // Feeds the global loading indicator — paired with the response interceptor
        // below, which decrements on both success and failure.
        startLoading();
        return config;
    },
    (error) => {
        stopLoading();
        return Promise.reject(error);
    }
);

// Response Interceptor
api.interceptors.response.use(
    (response) => {
        stopLoading();
        return response;
    },
    (error) => {
        stopLoading();
        // Handle 401 Unauthorized or 403 Forbidden
        if (error.response?.status === 401 || error.response?.status === 403) {
            // Clear stored user data on auth failure
            localStorage.removeItem('userRole');
            localStorage.removeItem('userName');
            
            // Redirect to login unless already on a public page (landing or login)
            if (!['/', '/login'].includes(window.location.pathname)) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
