const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const subdirs = ['images', 'videos', 'audio', 'voice'];

subdirs.forEach(dir => {
    const fullPath = path.join(uploadsDir, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

// File type configurations
const ALLOWED_TYPES = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    video: ['video/mp4', 'video/webm', 'video/quicktime'],
    audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'],
};

// Max file sizes (in bytes)
const MAX_SIZES = {
    image: 10 * 1024 * 1024,  // 10MB
    video: 100 * 1024 * 1024, // 100MB
    audio: 40 * 1024 * 1024,  // 40MB
    voice: 10 * 1024 * 1024,  // 10MB
};

// Determine file type category from mimetype
const getFileCategory = (mimetype) => {
    if (ALLOWED_TYPES.image.includes(mimetype)) return 'images';
    if (ALLOWED_TYPES.video.includes(mimetype)) return 'videos';
    if (ALLOWED_TYPES.audio.includes(mimetype)) return 'audio';
    return null;
};

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Voice recordings go to voice folder, others based on mimetype
        const category = req.path.includes('voice') ? 'voice' : getFileCategory(file.mimetype);
        if (!category) {
            return cb(new Error('Invalid file type'), null);
        }
        cb(null, path.join(uploadsDir, category));
    },
    filename: (req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname) || getExtFromMimetype(file.mimetype);
        cb(null, `${uniqueId}${ext}`);
    }
});

// Get extension from mimetype
const getExtFromMimetype = (mimetype) => {
    const map = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov',
        'audio/mpeg': '.mp3',
        'audio/mp3': '.mp3',
        'audio/wav': '.wav',
        'audio/ogg': '.ogg',
        'audio/webm': '.webm',
    };
    return map[mimetype] || '';
};

// File filter
const fileFilter = (req, file, cb) => {
    const isVoice = req.path.includes('voice');

    if (isVoice) {
        // Voice recordings - allow audio types
        if (ALLOWED_TYPES.audio.includes(file.mimetype)) {
            return cb(null, true);
        }
    } else {
        // Regular uploads - check all allowed types
        const allAllowed = [...ALLOWED_TYPES.image, ...ALLOWED_TYPES.video, ...ALLOWED_TYPES.audio];
        if (allAllowed.includes(file.mimetype)) {
            return cb(null, true);
        }
    }

    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
};

// Create multer instance
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_SIZES.video, // Use largest limit, we'll validate per-type below
    }
});

// Validate file size based on type
const validateFileSize = (req, res, next) => {
    if (!req.file) return next();

    const category = getFileCategory(req.file.mimetype) || 'voice';
    const maxSize = MAX_SIZES[category === 'images' ? 'image' :
        category === 'videos' ? 'video' :
            category === 'voice' ? 'voice' : 'audio'];

    if (req.file.size > maxSize) {
        // Delete the uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
            error: `File too large. Maximum size for ${category} is ${maxSize / (1024 * 1024)}MB`
        });
    }

    next();
};

// Generate public URL for file
const getPublicUrl = (req, filename, category) => {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/uploads/${category}/${filename}`;
};

// ===================
// ROUTES
// ===================

// Upload image
router.post('/image', upload.single('file'), validateFileSize, (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
        success: true,
        messageType: 'image',
        mediaUrl: getPublicUrl(req, req.file.filename, 'images'),
        mediaType: req.file.mimetype,
        fileName: req.file.originalname,
        fileSize: req.file.size,
    });
});

// Upload video
router.post('/video', upload.single('file'), validateFileSize, (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
        success: true,
        messageType: 'video',
        mediaUrl: getPublicUrl(req, req.file.filename, 'videos'),
        mediaType: req.file.mimetype,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mediaDuration: req.body.duration ? parseInt(req.body.duration) : null,
    });
});

// Upload audio
router.post('/audio', upload.single('file'), validateFileSize, (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
        success: true,
        messageType: 'audio',
        mediaUrl: getPublicUrl(req, req.file.filename, 'audio'),
        mediaType: req.file.mimetype,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mediaDuration: req.body.duration ? parseInt(req.body.duration) : null,
    });
});

// Upload voice recording (from in-app recorder)
router.post('/voice', upload.single('file'), validateFileSize, (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
        success: true,
        messageType: 'audio',
        mediaUrl: getPublicUrl(req, req.file.filename, 'voice'),
        mediaType: req.file.mimetype,
        fileName: req.file.originalname || 'voice-recording',
        fileSize: req.file.size,
        mediaDuration: req.body.duration ? parseInt(req.body.duration) : null,
    });
});

// Error handling middleware
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large' });
        }
        return res.status(400).json({ error: error.message });
    }

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    next();
});

module.exports = router;
