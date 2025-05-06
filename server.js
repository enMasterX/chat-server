const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');
const bcrypt = require('bcrypt');  // Import bcrypt

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://unknown.ftp.sh",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

const messagesFilePath = path.join(__dirname, 'messages.json');
const usersFilePath = path.join(__dirname, 'users.json');
let adminCredentials = { "7482broncos": "Burkes" };
let authenticatedUsers = {};
let userCredentials = loadUserCredentials();

// Load user credentials from users.json
function loadUserCredentials() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf-8');
            return data ? JSON.parse(data) : {};  // Return an empty object if the file is empty
        } else {
            return {};  // Return empty object if the file doesn't exist
        }
    } catch (err) {
        console.error('Error loading users.json:', err);
        return {};  // Return empty object if an error occurs
    }
}

// Save updated user credentials back to users.json
function saveUserCredentials() {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(userCredentials, null, 2));
    } catch (err) {
        console.error('Error writing users.json:', err);
    }
}

// Load messages from messages.json
let messages = [];
try {
    const storedMessages = fs.readFileSync(messagesFilePath, 'utf-8');
    messages = JSON.parse(storedMessages);
} catch (error) {
    console.error('Error reading messages from file:', error);
}

io.on('connection', (socket) => {
    console.log('A user connected: ' + socket.id);
    socket.emit('previousMessages', messages);

    // Admin authentication
    socket.on('authenticate', (password, callback) => {
        if (adminCredentials[password]) {
            authenticatedUsers[socket.id] = adminCredentials[password];
            callback({ success: true, username: "Burkes" });
        } else {
            callback({ success: false });
        }
    });

    // Chat user authentication with bcrypt for password comparison
    socket.on('authenticateChatUser', async (username, password, callback) => {
        // Check if the user exists and compare hashed password
        if (userCredentials[username]) {
            const isPasswordCorrect = await bcrypt.compare(password, userCredentials[username]);
            if (isPasswordCorrect) {
                authenticatedUsers[socket.id] = username;
                callback({ success: true, username: username });
                return;
            }
        }
        callback({ success: false });
    });

    // Handle incoming messages
    socket.on('message', (msg) => {
        const username = authenticatedUsers[socket.id];
        if (!username) return;  // Ignore message if the user is not authenticated

        messages.push(msg);
        if (messages.length > 100) messages.shift();  // Limit to 100 messages

        // Try to save messages to file
        try {
            fs.writeFileSync(messagesFilePath, JSON.stringify(messages));
        } catch (error) {
            console.error('Error saving messages to file:', error);
        }

        io.emit('message', msg);  // Broadcast new message to all connected clients
    });

    // Handle request for previous messages
    socket.on('requestMessages', () => {
        socket.emit('previousMessages', messages);
    });

    // Add a new user (hash the password using bcrypt)
    socket.on('add-user', async ({ user, pwd }) => {
        if (user && pwd && !(user in userCredentials)) {
            const hashedPassword = await bcrypt.hash(pwd, 10);  // Hash the password
            userCredentials[user] = hashedPassword;
            saveUserCredentials();
            socket.emit('userAdded', { success: true, user });
        } else {
            socket.emit('userAdded', { success: false });
        }
    });

    // Get the list of users
    socket.on('get-users', () => {
        const users = Object.keys(userCredentials).map(username => ({ username }));
        socket.emit('userList', users);
    });

    // Edit a user (update hashed password)
    socket.on('edit-user', async ({ oldUsername, newUsername, newPassword }) => {
        if (
            oldUsername in userCredentials &&
            newUsername &&
            newPassword &&
            (!(newUsername in userCredentials) || newUsername === oldUsername)
        ) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);  // Hash the new password
            delete userCredentials[oldUsername];
            userCredentials[newUsername] = hashedPassword;
            saveUserCredentials();
            socket.emit('userUpdated', { success: true, username: newUsername });
        } else {
            socket.emit('userUpdated', { success: false });
        }
    });

    // Delete a user
    socket.on('delete-user', (username) => {
        if (username in userCredentials) {
            delete userCredentials[username];
            saveUserCredentials();
            socket.emit('userDeleted', { success: true, username });
        } else {
            socket.emit('userDeleted', { success: false });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        delete authenticatedUsers[socket.id];
    });
});

// Clear chat messages daily at midnight
cron.schedule('0 0 * * *', () => {
    messages = [];
    try {
        fs.writeFileSync(messagesFilePath, JSON.stringify(messages));
        console.log('Chat messages cleared at midnight.');
    } catch (error) {
        console.error('Error clearing messages file:', error);
    }
});

// Serve admin page
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
