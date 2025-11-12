// Backend for the certificate generator
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'simple-cert-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Serve static files from current directory
app.use(express.static(__dirname));

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/simple_certificates';

// In-memory fallback store (used when MongoDB is unavailable)
let useInMemoryStore = false;
const inMemoryStore = [];

// MongoDB Connection (attempt, but do NOT exit if it fails)
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB connected successfully');
        useInMemoryStore = false;
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
        console.log('⚠️  MongoDB not available. Falling back to in-memory store for development/testing');
        useInMemoryStore = true;
    });

// Connection state listeners (toggle in-memory fallback dynamically)
mongoose.connection.on('connected', () => {
    if (useInMemoryStore) {
        console.log('🔁 MongoDB reconnected. Switching back from in-memory store.');
    }
    useInMemoryStore = false;
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected. Using in-memory store until it reconnects.');
    useInMemoryStore = true;
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err.message);
});

// MongoDB Schema for Simple Certificates
const simpleCertificateSchema = new mongoose.Schema({
    reference_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    user: {
        name: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            index: true
        }
    },
    certificate_type: {
        type: String,
        default: 'Attended'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    downloaded: {
        type: Boolean,
        default: false
    },
    download_count: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

const SimpleCertificate = mongoose.model('SimpleCertificate', simpleCertificateSchema);

// ============================================
// API ENDPOINTS
// ============================================

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Simple Certificate Generator API is running',
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// Generate Certificate (No Validation Required)
app.post('/api/simple_generate', async(req, res) => {
    try {
        const { name, email } = req.body;

        // Validate input
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });
        }

        // Clean inputs
        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Check if certificate already exists
        if (useInMemoryStore) {
            const existing = inMemoryStore.find(c => c.user.email === cleanEmail);
            if (existing) {
                console.log(`ℹ️  (mem) Certificate already exists for ${cleanEmail}: ${existing.reference_id}`);
                return res.json({
                    success: true,
                    existing: true,
                    reference_id: existing.reference_id,
                    name: existing.user.name,
                    email: existing.user.email,
                    message: 'Certificate already generated for this email (in-memory)'
                });
            }
        } else {
            const existing = await SimpleCertificate.findOne({ 'user.email': cleanEmail });
            if (existing) {
                console.log(`ℹ️  Certificate already exists for ${cleanEmail}: ${existing.reference_id}`);
                return res.json({
                    success: true,
                    existing: true,
                    reference_id: existing.reference_id,
                    name: existing.user.name,
                    email: existing.user.email,
                    message: 'Certificate already generated for this email'
                });
            }
        }

        // Generate unique reference ID in format: CSAC2025-XXXXX
        // Last 5 characters are random alphanumeric
        const generateRandomCode = () => {
            const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            let code = '';
            for (let i = 0; i < 5; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        };

        let reference_id;
        let isUnique = false;

        // Ensure uniqueness
        while (!isUnique) {
            reference_id = `CSAC2025-${generateRandomCode()}`;
            const duplicate = useInMemoryStore ?
                inMemoryStore.find(c => c.reference_id === reference_id) :
                await SimpleCertificate.findOne({ reference_id });
            if (!duplicate) {
                isUnique = true;
            }
        }

        // Store either in MongoDB or in-memory
        if (useInMemoryStore) {
            const memObj = {
                reference_id,
                user: { name: cleanName, email: cleanEmail },
                certificate_type: 'Attended',
                timestamp: new Date(),
                downloaded: false,
                download_count: 0
            };
            inMemoryStore.push(memObj);
            console.log(`✅ (mem) Certificate generated: ${reference_id} for ${cleanName} (${cleanEmail})`);

            return res.json({
                success: true,
                reference_id,
                name: cleanName,
                email: cleanEmail,
                message: 'Certificate generated successfully (in-memory)!'
            });
        } else {
            // Store in MongoDB
            const newCertificate = new SimpleCertificate({
                reference_id,
                user: {
                    name: cleanName,
                    email: cleanEmail
                },
                certificate_type: 'Attended',
                timestamp: new Date(),
                downloaded: false,
                download_count: 0
            });

            await newCertificate.save();
            console.log(`✅ Certificate generated: ${reference_id} for ${cleanName} (${cleanEmail})`);

            return res.json({
                success: true,
                reference_id,
                name: cleanName,
                email: cleanEmail,
                message: 'Certificate generated successfully!'
            });
        }

    } catch (error) {
        console.error('Error generating certificate:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get Certificate by ID
app.get('/api/simple_certificate', async(req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Certificate ID is required'
            });
        }

        let certificate;
        if (useInMemoryStore) {
            certificate = inMemoryStore.find(c => c.reference_id === id);
            if (!certificate) {
                return res.status(404).json({ success: false, error: 'Certificate not found (in-memory)' });
            }

            // Mark as downloaded and increment count
            certificate.downloaded = true;
            certificate.download_count = (certificate.download_count || 0) + 1;

            return res.json({
                success: true,
                reference_id: certificate.reference_id,
                name: certificate.user.name,
                email: certificate.user.email,
                certificate_type: certificate.certificate_type,
                timestamp: certificate.timestamp
            });
        } else {
            certificate = await SimpleCertificate.findOne({ reference_id: id });

            if (!certificate) {
                return res.status(404).json({
                    success: false,
                    error: 'Certificate not found'
                });
            }

            // Mark as downloaded and increment count
            certificate.downloaded = true;
            certificate.download_count += 1;
            await certificate.save();

            return res.json({
                success: true,
                reference_id: certificate.reference_id,
                name: certificate.user.name,
                email: certificate.user.email,
                certificate_type: certificate.certificate_type,
                timestamp: certificate.timestamp
            });
        }

    } catch (error) {
        console.error('Error fetching certificate:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get Statistics
app.get('/api/stats', async(req, res) => {
    try {
        if (useInMemoryStore) {
            const totalCertificates = inMemoryStore.length;
            const downloadedCertificates = inMemoryStore.filter(c => c.downloaded).length;
            const recentCertificates = [...inMemoryStore]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 10)
                .map(c => ({ reference_id: c.reference_id, 'user.name': c.user.name, 'user.email': c.user.email, timestamp: c.timestamp, downloaded: c.downloaded, download_count: c.download_count }));

            return res.json({
                success: true,
                stats: {
                    total: totalCertificates,
                    downloaded: downloadedCertificates,
                    pending: totalCertificates - downloadedCertificates
                },
                recent: recentCertificates
            });
        }

        const totalCertificates = await SimpleCertificate.countDocuments();
        const downloadedCertificates = await SimpleCertificate.countDocuments({ downloaded: true });
        const recentCertificates = await SimpleCertificate.find()
            .sort({ timestamp: -1 })
            .limit(10)
            .select('reference_id user.name user.email timestamp downloaded download_count');

        res.json({
            success: true,
            stats: {
                total: totalCertificates,
                downloaded: downloadedCertificates,
                pending: totalCertificates - downloadedCertificates
            },
            recent: recentCertificates
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// List All Certificates (for admin/debugging)
app.get('/api/certificates', async(req, res) => {
    try {
        if (useInMemoryStore) {
            const certificates = [...inMemoryStore]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .map(c => ({ reference_id: c.reference_id, 'user.name': c.user.name, 'user.email': c.user.email, certificate_type: c.certificate_type, timestamp: c.timestamp, downloaded: c.downloaded, download_count: c.download_count }));

            return res.json({ success: true, count: certificates.length, certificates });
        }

        const certificates = await SimpleCertificate.find()
            .sort({ timestamp: -1 })
            .select('reference_id user.name user.email certificate_type timestamp downloaded download_count');

        res.json({
            success: true,
            count: certificates.length,
            certificates
        });
    } catch (error) {
        console.error('Error listing certificates:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Redirect root to index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found'
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log('\nSimple Certificate Generator Server');
    console.log(`Server running on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Network: http://192.168.1.5:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});

// Graceful Shutdown
process.on('SIGINT', async() => {
    console.log('\n⏳ Shutting down gracefully...');
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    process.exit(0);
});