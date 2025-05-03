const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://enmasterx.ftp.sh",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

const messagesFilePath = path.join(__dirname, 'messages.json');

let adminCredentials = {
    "7482broncos": "Burkes"
};

let userCredentials = {
    "user1": "password1"
};

let authenticatedUsers = {};

if (!fs.existsSync(messagesFilePath)) {
    fs.writeFileSync(messagesFilePath, JSON.stringify([]));
}

let messages = [];
try {
    const storedMessages = fs.readFileSync(messagesFilePath, 'utf-8');
    messages = JSON.parse(storedMessages);
} catch (error) {
    console.error('Error reading messages from file:', error);
}

io.on('connection', (socket) => {
    console.log('A user connected: ' + socket.id);

    console.log('Sending previous messages:', messages);
    socket.emit('previousMessages', messages);

    // Admin authentication
    socket.on('authenticate', (password, callback) => {
        console.log(`Admin authentication attempt with password: ${password}`);
        if (adminCredentials[password]) {
            authenticatedUsers[socket.id] = adminCredentials[password];
            callback({ success: true, username: "Burkes" });
        } else {
            callback({ success: false });
        }
    });

    // Chat user authentication
    socket.on('authenticateChatUser', (username, password, callback) => {
        if (userCredentials[username] && userCredentials[username] === password) {
            authenticatedUsers[socket.id] = username;
            callback({ success: true, username: username });
        } else {
            callback({ success: false });
        }
    });

    // Handle adding a new user
    socket.on('add-user', ({ user, pwd }) => {
        if (user && pwd) {
            userCredentials[user] = pwd;
            console.log(`User ${user} added with password ${pwd}`);
            socket.emit('userAdded', { success: true, user });
        } else {
            socket.emit('userAdded', { success: false });
        }
    });

    // Send all users to admin
    socket.on('get-users', () => {
        socket.emit('userList', userCredentials);
    });

    // Edit a user's password
    socket.on('edit-user', ({ username, newPassword }) => {
        if (userCredentials[username]) {
            userCredentials[username] = newPassword;
            socket.emit('userUpdated', { success: true, username });
        } else {
            socket.emit('userUpdated', { success: false });
        }
    });

    // Delete a user
    socket.on('delete-user', (username) => {
        if (userCredentials[username]) {
            delete userCredentials[username];
            socket.emit('userDeleted', { success: true, username });
        } else {
            socket.emit('userDeleted', { success: false });
        }
    });

    // Handle messages
    socket.on('message', (msg) => {
        const username = authenticatedUsers[socket.id];
        if (!username) return;

        messages.push(msg);
        if (messages.length > 100) messages.shift();

        try {
            console.log('Saving messages to file:', messages);
            fs.writeFileSync(messagesFilePath, JSON.stringify(messages));
        } catch (error) {
            console.error('Error saving messages to file:', error);
        }

        io.emit('message', msg);
    });

    socket.on('requestMessages', () => {
        console.log(`Sending previous messages to ${socket.id}`);
        socket.emit('previousMessages', messages);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.id);
        delete authenticatedUsers[socket.id];
    });
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

cron.schedule('0 0 * * *', () => {
    messages = [];
    try {
        fs.writeFileSync(messagesFilePath, JSON.stringify(messages));
        console.log('Chat messages cleared at midnight.');
    } catch (error) {
        console.error('Error clearing messages file:', error);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
