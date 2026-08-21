const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const routes = require('./routes');

const { MONGODB_URI, PORT = 3333 } = process.env;

if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and provide the connection string.');
}

const server = express();

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true
});

server.use(cors());
server.use(express.json());
server.use(routes);

server.listen(PORT);
