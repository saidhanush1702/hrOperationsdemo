import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// The key must be exactly 32 characters long for AES-256
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'my-super-secret-key-123456789012'; 
const IV_LENGTH = 16; 

export const encryptPassword = (text) => {
    if (!text) return text;
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

export const decryptPassword = (text) => {
    if (!text) return null;
    try {
        let textParts = text.split(':');
        // If it doesn't have the IV format, it might be an old bcrypt hash
        if (textParts.length !== 2) return null; 
        
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        return null; // Return null if decryption fails
    }
};