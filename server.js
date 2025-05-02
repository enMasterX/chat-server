const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://enmasterx.ftp.sh",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"]
    }
});

// Serve static files (e.g., HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// In-memory chat history
let messages = [];

// In-memory credentials map (password → username)
let credentials = {
    "7482broncos": "Burkes"
};

// Authentication map (socket.id → username)
let authenticatedUsers = {};

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('authenticate', (password, callback) => {
        if (credentials[password]) {
            authenticatedUsers[socket.id] = credentials[password];
            callback({ success: true, username: credentials[password] });
        } else {
            callback({ success: false });
        }
    });

    socket.on('message', (msg) => {
        const username = authenticatedUsers[socket.id];
        if (!username) return; // Ignore unauthenticated users

        messages.push(msg);
        io.emit('message', msg);
    });

    socket.on('requestMessages', () => {
        socket.emit('previousMessages', messages);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        delete authenticatedUsers[socket.id];
    });
});

// Optional admin.html route (if you create an admin page)
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
