const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files like HTML (if applicable)
app.use(express.static("public"));

// Log when a user connects
io.on("connection", (socket) => {
    console.log("A user connected");

    // Log the received message and broadcast it
    socket.on("message", (msg) => {
        console.log("Message received:", msg); // Debugging log
        io.emit("message", msg); // Broadcast the message to all clients
    });

    // Log when a user disconnects
    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
