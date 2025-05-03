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
            userCredentials[user] = pwd;
            socket.emit('userAdded', { success: true, user });
        } else {
            socket.emit('userAdded', { success: false });
        }
    });

    socket.on('get-users', () => {
        socket.emit('userList', userCredentials);
    });

    socket.on('edit-user', ({ oldUsername, newUsername, newPassword }) => {
        if (
            oldUsername in userCredentials &&
            newUsername &&
            newPassword &&
            !(newUsername !== oldUsername && userCredentials[newUsername])
        ) {
            delete userCredentials[oldUsername];
            userCredentials[newUsername] = newPassword;
            socket.emit('userUpdated', { success: true, username: newUsername });
        } else {
            socket.emit('userUpdated', { success: false });
        }
    });

    socket.on('delete-user', (username) => {
        if (username in userCredentials) {
            delete userCredentials[username];
            socket.emit('userDeleted', { success: true, username });
        } else {
            socket.emit('userDeleted', { success: false });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.id);
        delete authenticatedUsers[socket.id];
    });
});
