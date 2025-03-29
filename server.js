const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files (if any)
app.use(express.static('public'));

// Listen for incoming connections
io.on('connection', (socket) => {
  console.log('a user connected');

  // Listen for messages from clients
  socket.on('message', (msg) => {
    console.log('message: ' + msg);

    // Broadcast the message to all other clients
    io.emit('message', msg); // Send to all clients
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

// Start the server on port 3000
server.listen(process.env.PORT || 3000, () => {
  console.log('Server is running...');
});
