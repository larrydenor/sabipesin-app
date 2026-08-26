require('dotenv').config();

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');

const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const initSocket = require('./socket');

const { MONGODB_URI, PORT = 3333 } = process.env;

if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and provide the connection string.');
}

const app = express();

mongoose
    .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch((err) => {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    });

app.use(cors());
app.use(express.json());
app.use(routes);
// Error-handling middleware must be registered after the routes it covers.
app.use(errorHandler);

// Wrap Express in a raw HTTP server so Socket.IO can share the same port (spec
// §6: message:send / message:receive / typing / read). CORS is opened to match
// the permissive REST policy above; tighten both before production.
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
initSocket(io);

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
