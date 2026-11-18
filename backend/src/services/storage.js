const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const env = require('../config/env');

if (env.cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName, api_key: env.cloudinary.apiKey, api_secret: env.cloudinary.apiSecret, secure: true,
  });
}
const uploadDir = path.join(__dirname, '../../uploads');

// Uploads to Cloudinary when configured, otherwise to the local uploads folder.
exports.saveImage = (file, folder) => new Promise((resolve, reject) => {
  if (env.cloudinaryEnabled) {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `multitenant/${folder}`, resource_type: 'image', quality: 'auto', fetch_format: 'auto' },
      (err, r) => (err ? reject(err) : resolve({ url: r.secure_url, publicId: r.public_id, size: r.bytes })),
    );
    stream.end(file.buffer);
  } else {
    const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[file.mimetype] || '.bin';
    const name = `${crypto.randomBytes(12).toString('hex')}${ext}`;
    fs.writeFile(path.join(uploadDir, name), file.buffer, (err) => (
      err ? reject(err) : resolve({ url: `/uploads/${name}`, publicId: null, size: file.size })));
  }
});

exports.deleteImage = async (publicId) => {
  if (env.cloudinaryEnabled && publicId) { try { await cloudinary.uploader.destroy(publicId); } catch (e) { /* ignore */ } }
};
exports.uploadDir = uploadDir;
