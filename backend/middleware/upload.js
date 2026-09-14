// backend/middleware/upload.js
import multer from 'multer';

// Uploads are held in memory only until the controller pushes them to Cloudinary;
// nothing is written to the local disk. 10MB matches Cloudinary's free-plan file cap.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

export default upload;
