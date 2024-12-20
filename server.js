// server.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage
const authorizations = new Map();

// PayPal configuration
const paypal = require('@paypal/checkout-server-sdk');
let environment = new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET
);
let paypalClient = new paypal.core.PayPalHttpClient(environment);

// Debug middleware to log requests
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        path: req.path,
        body: req.body,
        query: req.query
    });
    next();
});

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/api/payment-auth', async (req, res) => {
    console.log('Payment auth request:', req.body);

    const { userId, authToken, orderId, payerId } = req.body;

    if (!userId || !authToken || !orderId || !payerId) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields',
            received: req.body
        });
    }

    try {
        authorizations.set(userId, {
            authToken,
            orderId,
            payerId,
            createdAt: new Date()
        });

        console.log('Authorization stored for user:', userId);
        res.json({
            success: true,
            message: 'Authorization stored'
        });
    } catch (error) {
        console.error('Error storing authorization:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to store authorization'
        });
    }
});

app.post('/api/trigger-payment', async (req, res) => {
    console.log('Trigger payment request:', req.body);

    const { userId, amount } = req.body;

    if (!userId || !amount) {
        return res.status(400).json({
            success: false,
            error: 'Missing userId or amount',
            received: req.body
        });
    }

    try {
        const auth = authorizations.get(userId);
        console.log('Found authorization:', auth);

        if (!auth) {
            return res.status(404).json({
                success: false,
                error: 'No authorization found for user'
            });
        }

        const request = new paypal.orders.OrdersCaptureRequest(auth.authToken);
        request.requestBody({
            amount: {
                currency_code: 'EUR',
                value: amount.toString()
            }
        });

        const capture = await paypalClient.execute(request);
        res.json({
            success: true,
            captureId: capture.result.id
        });
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({
            success: false,
            error: 'Payment failed: ' + error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Public directory: ${path.join(__dirname, 'public')}`);
});