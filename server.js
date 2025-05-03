const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');
const { MongoClient } = require('mongodb');

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
let adminCredentials = { "7482broncos": "Burkes" };
let authenticatedUsers = {};
let userCredentials = {};

// MongoDB setup
const mongoUri = "mongodb+srv://chatuser:chatuser@cluster0.k1hbygu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
let db, userCredentialsCollection;

MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        db = client.db();
        userCredentialsCollection = db.collection('userCredentials');
        console.log("Connected to MongoDB");

        loadUserCredentials();
    })
    .catch(error => {
        console.error("Error connecting to MongoDB:", error);
    });

// Load user credentials from DB to memory
function loadUserCredentials() {
    userCredentialsCollection.find().toArray((err, users) => {
        if (err) {
            console.error('Error fetching users:', err);
        } else {
            users.forEach(user => {
                userCredentials[user.username] = user.password;
            });
            console.log('User credentials loaded into memory:', Object.keys(userCredentials));
        }
    });
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
        console.log(`Admin authentication attempt with password: ${password}`);
        if (adminCredentials[password]) {
            authenticatedUsers[socket.id] = adminCredentials[password];
            callback({ success: true, username: "Burkes" });
        } else {
            callback({ success: false });
        }
    });

    socket.on('authenticateChatUser', (username, password, callback) => {
        console.log(`Chat user authentication attempt: ${username}`);
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
        console.log('Client requested messages');
        socket.emit('previousMessages', messages);
    });

    // Added 'add-user' event handler
    socket.on('add-user', ({ user, pwd }) => {
        console.log(`Add user attempt: ${user}`);
        if (user && pwd) {
            userCredentialsCollection.insertOne({ username: user, password: pwd })
                .then(() => {
                    userCredentials[user] = pwd;
                    socket.emit('userAdded', { success: true, user });
                    console.log(`User added: ${user}`);
                })
                .catch(err => {
                    console.error('Error adding user to MongoDB:', err);
                    socket.emit('userAdded', { success: false });
                });
        } else {
            console.log('Add user failed: missing username or password');
            socket.emit('userAdded', { success: false });
        }
    });

    // Added 'get-users' event handler
    socket.on('get-users', () => {
        console.log('Received "get-users" event from client:', socket.id);

        userCredentialsCollection.find().sort({ username: 1 }).toArray((err, users) => {
            if (err) {
                console.error('Error fetching users from MongoDB:', err);
                socket.emit('userList', []);  // Send an empty list if error occurs
            } else {
                // Log the raw result from MongoDB
                console.log('MongoDB query results:', users);

                console.log(`Found ${users.length} users in MongoDB.`);
                if (users.length > 0) {
                    users.forEach((user, index) => {
                        console.log(`User ${index + 1}: ${user.username}`);
                    });
                } else {
                    console.log('No users found in MongoDB.');
                }

                socket.emit('userList', users);
            }
        });
    });

    socket.on('edit-user', ({ oldUsername, newUsername, newPassword }) => {
        console.log(`Edit user attempt: ${oldUsername} -> ${newUsername}`);
        if (
            oldUsername in userCredentials &&
            newUsername &&
            newPassword &&
            !(newUsername !== oldUsername && userCredentials[newUsername])
        ) {
            userCredentialsCollection.updateOne({ username: oldUsername }, {
                $set: { username: newUsername, password: newPassword }
            })
            .then(() => {
                delete userCredentials[oldUsername];
                userCredentials[newUsername] = newPassword;
                socket.emit('userUpdated', { success: true, username: newUsername });
                console.log(`User updated: ${oldUsername} -> ${newUsername}`);
            })
            .catch(err => {
                console.error('Error updating user in MongoDB:', err);
                socket.emit('userUpdated', { success: false });
            });
        } else {
            console.log('Edit user failed: invalid input or username taken');
            socket.emit('userUpdated', { success: false });
        }
    });

    socket.on('delete-user', (username) => {
        console.log(`Delete user attempt: ${username}`);
        if (username in userCredentials) {
            userCredentialsCollection.deleteOne({ username })
                .then(() => {
                    delete userCredentials[username];
                    socket.emit('userDeleted', { success: true, username });
                    console.log(`User deleted: ${username}`);
                })
                .catch(err => {
                    console.error('Error deleting user from MongoDB:', err);
                    socket.emit('userDeleted', { success: false });
                });
        } else {
            console.log('Delete user failed: user not found');
            socket.emit('userDeleted', { success: false });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.id);
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
