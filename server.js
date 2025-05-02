const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cron = require('node-cron');  // <-- added for scheduling

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

// In-memory credentials map for admin and global chat
let adminCredentials = {
    "7482broncos": "Burkes"
};

// Store user credentials for global chat, initialized with a default user
let userCredentials = {
    "user1": "password1"  // Initial user (can be changed by admin)
};

// Authentication map (socket.id → username)
let authenticatedUsers = {};

io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle user authentication for the global chat
    socket.on('authenticateChatUser', (username, password, callback) => {
        if (userCredentials[username] && userCredentials[username] === password) {
            authenticatedUsers[socket.id] = username;
            callback({ success: true, username: username });
        } else {
            callback({ success: false });
        }
    });

    // Handle incoming messages and emit them back to all connected clients
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

// Admin page route (if admin.html exists in /public)
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Handle adding new users through the admin panel
io.on('connection', (socket) => {
    socket.on('add-user', (data) => {
        const { user, pwd } = data;
        if (user && pwd) {
            userCredentials[user] = pwd;  // Add new user to credentials map
            console.log(`User ${user} added with password ${pwd}`);
            socket.emit('userAdded', { success: true, user });
        } else {
            socket.emit('userAdded', { success: false });
        }
    });
});

// 🔁 Clear messages every day at midnight
cron.schedule('0 0 * * *', () => {
    messages = [];
    console.log('Chat messages cleared at midnight.');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
