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
let userCredentials = {}; // ✅ Keep this in memory for use

// MongoDB setup
const mongoUri = "mongodb+srv://chatuser:chatuser@cluster0.k1hbygu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
let db, userCredentialsCollection;

MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        db = client.db();
        userCredentialsCollection = db.collection('userCredentials');
        console.log("Connected to MongoDB");

        // Load initial user credentials from MongoDB into the in-memory object
        loadUserCredentials();
    })
    .catch(error => {
        console.error("Error connecting to MongoDB:", error);
    });

// Function to load user credentials from MongoDB
function loadUserCredentials() {
    userCredentialsCollection.find().toArray((err, users) => {
        if (err) {
            console.error('Error fetching users:', err);
        } else {
            // Update the in-memory userCredentials object
            users.forEach(user => {
                userCredentials[user.username] = user.password;
            });
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
        if (user && pwd) {
            // Save to MongoDB
            userCredentialsCollection.insertOne({ username: user, password: pwd })
                .then(() => {
                    userCredentials[user] = pwd; // Update in-memory object
                    socket.emit('userAdded', { success: true, user });
                })
                .catch(err => {
                    console.error('Error adding user to MongoDB:', err);
                    socket.emit('userAdded', { success: false });
                });
        } else {
            socket.emit('userAdded', { success: false });
        }
    });

    socket.on('get-users', () => {
        // Ensure data is available from MongoDB before sending
        userCredentialsCollection.find().toArray((err, users) => {
            if (err) {
                console.error('Error fetching users:', err);
                return;
            }

            // Sort users alphabetically
            const sortedUsers = users.sort((a, b) => a.username.localeCompare(b.username));
            socket.emit('userList', sortedUsers);
        });
    });

    socket.on('edit-user', ({ oldUsername, newUsername, newPassword }) => {
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
            })
            .catch(err => {
                console.error('Error updating user in MongoDB:', err);
                socket.emit('userUpdated', { success: false });
            });
        } else {
            socket.emit('userUpdated', { success: false });
        }
    });

    socket.on('delete-user', (username) => {
        if (username in userCredentials) {
            userCredentialsCollection.deleteOne({ username })
                .then(() => {
                    delete userCredentials[username];
                    socket.emit('userDeleted', { success: true, username });
                })
                .catch(err => {
                    console.error('Error deleting user from MongoDB:', err);
                    socket.emit('userDeleted', { success: false });
                });
        } else {
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
