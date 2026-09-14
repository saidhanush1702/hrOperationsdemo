const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Stored files are Cloudinary https URLs; older rows may still hold a backend-relative
// path such as /uploads/logos/x.png, which is served by the backend.
export const resolveFileUrl = (url) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};
