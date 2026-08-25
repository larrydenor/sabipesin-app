require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const { MONGODB_URI, PORT = 3333 } = process.env;

if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and provide the connection string.');
}

const server = express();

mongoose
    .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch((err) => {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    });

server.use(cors());
server.use(express.json());
server.use(routes);
// Error-handling middleware must be registered after the routes it covers.
server.use(errorHandler);

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
