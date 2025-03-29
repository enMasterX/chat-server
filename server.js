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
    
    // Handle incoming messages and emit them back to all connected clients
    socket.on('message', (msg) => {
        console.log("Received message:", msg);
        io.emit('message', msg); // Emit the message to all clients
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start the server on the desired port (use environment variable or 3000)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
