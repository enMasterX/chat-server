const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs'); // Import fs module to read/write files

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

// File path to store messages
const messagesFilePath = path.join(__dirname, 'messages.json');

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

// Read stored messages from file (if any)
let messages = [];
if (fs.existsSync(messagesFilePath)) {
    const storedMessages = fs.readFileSync(messagesFilePath, 'utf-8');
    try {
        messages = JSON.parse(storedMessages);
    } catch (error) {
        console.error('Error reading messages from file:', error);
    }
}

io.on('connection', (socket) => {
    console.log('A user connected: ' + socket.id);

    // Send previous messages when a new user connects
    console.log('Sending previous messages:', messages);
    socket.emit('previousMessages', messages); // Send all previous messages to new user

    // Handle admin authentication
    socket.on('authenticate', (password, callback) => {
        console.log(`Admin authentication attempt with password: ${password}`);
        if (adminCredentials[password]) {
            authenticatedUsers[socket.id] = adminCredentials[password];
            callback({ success: true, username: "Burkes" });
        } else {
            callback({ success: false });
        }
    });

    // Handle user authentication for global chat
    socket.on('authenticateChatUser', (username, password, callback) => {
        if (userCredentials[username] && userCredentials[username] === password) {
            authenticatedUsers[socket.id] = username;
            callback({ success: true, username: username });
        } else {
            callback({ success: false });
        }
    });

    // Handle incoming messages
    socket.on('message', (msg) => {
        const username = authenticatedUsers[socket.id];
        if (!username) return;  // Ignore unauthenticated users

        // Push the new message to the history
        messages.push(msg);

        // Cap the history size
        if (messages.length > 100) {
            messages.shift();  // Remove the oldest message if we exceed the limit
        }

        // Save messages to the file
        console.log('Saving messages to file:', messages);
        fs.writeFileSync(messagesFilePath, JSON.stringify(messages));

        // Emit the new message to all clients
        io.emit('message', msg);
    });

    socket.on('requestMessages', () => {
        console.log(`Sending previous messages to ${socket.id}`);
        socket.emit('previousMessages', messages); // Ensure the client gets previous messages when requested
    });

    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.id);
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
    fs.writeFileSync(messagesFilePath, JSON.stringify(messages));  // Clear the file as well
    console.log('Chat messages cleared at midnight.');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
