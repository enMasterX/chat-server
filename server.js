const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://enmasterx.ftp.sh",  // Allow your domain
        methods: ["GET", "POST"],           // Methods allowed
        allowedHeaders: ["Content-Type"]    // Headers allowed
    }
});

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start the server on the desired port
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
