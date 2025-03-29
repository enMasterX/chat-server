const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Use Render’s assigned PORT or default to 10000
const PORT = process.env.PORT || 10000;

io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("message", (msg) => {
        io.emit("message", msg);
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
