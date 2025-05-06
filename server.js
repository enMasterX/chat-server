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

function loadUserCredentials() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf-8');
            return JSON.parse(data);
        } else {
            return {};
        }
    } catch (err) {
        console.error('Error loading users.json:', err);
        return {};
    }
}

function saveUserCredentials() {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(userCredentials, null, 2));
    } catch (err) {
        console.error('Error writing users.json:', err);
    }
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
    socket.emit('previousMessages', messages);

    socket.on('authenticate', (password, callback) => {
        if (adminCredentials[password]) {
            authenticatedUsers[socket.id] = adminCredentials[password];
            callback({ success: true, username: "Burkes" });
        } else {
            callback({ success: false });
        }
    });

    socket.on('authenticateChatUser', (username, password, callback) => {
        if (userCredentials[username] && userCredentials[username] === password) {
            authenticatedUsers[socket.id] = username;
            callback({ success: true, username: username });
        } else {
            callback({ success: false });
        }
    });

    socket.on('message', (msg) => {
        const username = authenticatedUsers[socket.id];
        if (!username) return;

        messages.push(msg);
        if (messages.length > 100) messages.shift();

        try {
            fs.writeFileSync(messagesFilePath, JSON.stringify(messages));
        } catch (error) {
            console.error('Error saving messages to file:', error);
        }

        io.emit('message', msg);
    });

    socket.on('requestMessages', () => {
        socket.emit('previousMessages', messages);
    });

    socket.on('add-user', ({ user, pwd }) => {
        if (user && pwd && !(user in userCredentials)) {
            userCredentials[user] = pwd;
            saveUserCredentials();
            socket.emit('userAdded', { success: true, user });
        } else {
            socket.emit('userAdded', { success: false });
        }
    });

    socket.on('get-users', () => {
        const users = Object.keys(userCredentials).map(username => ({ username }));
        socket.emit('userList', users);
    });

    socket.on('edit-user', ({ oldUsername, newUsername, newPassword }) => {
        if (
            oldUsername in userCredentials &&
            newUsername &&
            newPassword &&
            (!(newUsername in userCredentials) || newUsername === oldUsername)
        ) {
            delete userCredentials[oldUsername];
            userCredentials[newUsername] = newPassword;
            saveUserCredentials();
            socket.emit('userUpdated', { success: true, username: newUsername });
        } else {
            socket.emit('userUpdated', { success: false });
        }
    });

    socket.on('delete-user', (username) => {
        if (username in userCredentials) {
            delete userCredentials[username];
            saveUserCredentials();
            socket.emit('userDeleted', { success: true, username });
        } else {
            socket.emit('userDeleted', { success: false });
        }
    });

    socket.on('disconnect', () => {
        delete authenticatedUsers[socket.id];
    });
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

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
