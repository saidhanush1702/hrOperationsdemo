import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Legacy rows still hold local paths (uploads/..., blob/...); those resolve from the backend root.
export const BACKEND_ROOT = path.join(__dirname, '..');

// Every asset this app uploads lives under one top-level Cloudinary folder.
const ROOT_FOLDER = process.env.CLOUDINARY_FOLDER || 'hr-operations';

let configured = false;
const ensureConfigured = () => {
    if (configured) return;
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
        throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env.');
    }
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
    });
    configured = true;
};

export const isRemoteUrl = (ref) => /^https?:\/\//i.test(ref || '');

const resolveLocalPath = (ref) =>
    path.isAbsolute(ref) ? ref : path.join(BACKEND_ROOT, ref.replace(/^\/+/, ''));

const safeBaseName = (name) => (name || '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80) || 'file';

// Uploads a buffer and resolves to its https URL.
// Images are stored as Cloudinary "image" assets. Everything else (PDF, Office docs)
// is stored as "raw": the free plan blocks delivery of PDFs uploaded as images, but
// serves raw files without restriction. A random suffix keeps URLs unguessable.
export const uploadBuffer = (buffer, { folder, fileName, mimeType }) => {
    ensureConfigured();
    const ext = path.extname(fileName || '').toLowerCase();
    const unique = `${safeBaseName(path.basename(fileName || '', ext))}_${crypto.randomBytes(8).toString('hex')}`;
    const resourceType = (mimeType || '').startsWith('image/') ? 'image' : 'raw';
    // Raw public_ids must carry the extension, or the delivered file has none.
    const publicId = resourceType === 'raw' ? `${unique}${ext}` : unique;

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: `${ROOT_FOLDER}/${folder}`, public_id: publicId, resource_type: resourceType, overwrite: false },
            (err, result) => (err ? reject(err) : resolve(result.secure_url))
        );
        stream.end(buffer);
    });
};

// True when the URL points at an asset this app uploaded into the given folder.
export const isCloudinaryFolderUrl = (ref, folder) =>
    isRemoteUrl(ref) && ref.includes(`/${ROOT_FOLDER}/${folder}/`);

// https://res.cloudinary.com/<cloud>/<resource_type>/upload/[v123/]<public_id>
const parseCloudinaryUrl = (url) => {
    const match = /\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+)$/.exec(new URL(url).pathname);
    if (!match) return null;
    const resourceType = match[1];
    let publicId = decodeURIComponent(match[2]);
    if (resourceType !== 'raw') publicId = publicId.replace(/\.[^/.]+$/, '');
    return { resourceType, publicId };
};

// Deletes a stored file, whether it is a Cloudinary URL or a legacy local path.
export const deleteFileRef = async (ref) => {
    if (!ref) return;
    if (isRemoteUrl(ref)) {
        const parsed = parseCloudinaryUrl(ref);
        if (!parsed) return;
        ensureConfigured();
        await cloudinary.uploader.destroy(parsed.publicId, { resource_type: parsed.resourceType, invalidate: true });
        return;
    }
    await fs.unlink(resolveLocalPath(ref)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
};

// Reads a stored file into a Buffer, whether it is a Cloudinary URL or a legacy local path.
export const readFileRef = async (ref) => {
    if (isRemoteUrl(ref)) {
        const res = await fetch(ref);
        if (!res.ok) throw new Error(`Failed to fetch ${ref}: HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    }
    return fs.readFile(resolveLocalPath(ref));
};

export const fileRefExists = async (ref) => {
    if (!ref) return false;
    try {
        if (isRemoteUrl(ref)) return (await fetch(ref, { method: 'HEAD' })).ok;
        await fs.access(resolveLocalPath(ref));
        return true;
    } catch {
        return false;
    }
};

// Lower-cased extension (".pdf", ".png") of a URL or path, ignoring any query string.
export const fileRefExt = (ref) =>
    path.extname(isRemoteUrl(ref) ? new URL(ref).pathname : ref).toLowerCase();
