const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const { Server } = require("socket.io");
const cron = require("node-cron");
const path = require("path");

// === Config ===
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = "https://enmasterx.ftp.sh";
const ADMIN_PASSWORD = "7482broncos";
const ADMIN_USERNAME = "Burkes";

// === App Setup ===
const app = express();
const server = http.createServer(app);
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// File paths
const USERS_FILE = path.join(__dirname, "users.json");
const MESSAGES_FILE = path.join(__dirname, "messages.json");

// Load or initialize users (plaintext passwords)
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8") || "{}");
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Load or initialize messages
function loadMessages() {
  if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, "[]");
  return JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf-8") || "[]");
}
function saveMessages(msgs) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgs, null, 2));
}

// In-memory store for users and messages
let userStore = loadUsers();
let messages = loadMessages();

// Map each socket.id to its authenticated chat username
const socketUsernames = {};

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);
  socket.emit("previousMessages", messages);

  // Admin login
  socket.on("authenticate", (pw, cb) => {
    const ok = pw === ADMIN_PASSWORD;
    cb({ success: ok, username: ok ? ADMIN_USERNAME : null });
  });

  // Chat user auth (plaintext)
  socket.on("authenticateChatUser", ({ username, password }, cb) => {
    const stored = userStore[username];
    const ok = stored && stored === password;
    console.log(ok ? "✅ User auth" : "❌ User auth failed", username);
    if (ok) {
      socketUsernames[socket.id] = username;
      cb({ success: true, username });
    } else {
      cb({ success: false, username: null });
    }
  });

  // Admin: list users with plaintext passwords
  socket.on("get-users", () => {
    const list = Object.entries(userStore).map(([u, pwd]) => ({
      username: u,
      password: pwd,
    }));
    socket.emit("userList", list);
  });

  // Admin: add user
  socket.on("add-user", ({ user, pwd }) => {
    if (userStore[user]) return socket.emit("userAdded", { success: false });
    userStore[user] = pwd;
    saveUsers(userStore);
    socket.emit("userAdded", { success: true, user });
  });

  // Admin: edit user
  socket.on("edit-user", ({ oldUsername, newUsername, newPassword }) => {
    if (
      !userStore[oldUsername] ||
      (newUsername !== oldUsername && userStore[newUsername])
    ) {
      return socket.emit("userUpdated", { success: false });
    }
    delete userStore[oldUsername];
    userStore[newUsername] = newPassword;
    saveUsers(userStore);
    socket.emit("userUpdated", { success: true, username: newUsername });
  });

  // Admin: delete user
  socket.on("delete-user", (username) => {
    if (!userStore[username])
      return socket.emit("userDeleted", { success: false });
    delete userStore[username];
    saveUsers(userStore);
    socket.emit("userDeleted", { success: true, username });
  });

  // Chat: handle message (clients send only raw text)
  socket.on("message", (msgText) => {
    // Look up who sent it
    const username = socketUsernames[socket.id] || "Anonymous";
    const fullMsg = `${username}: ${msgText}`;
    messages.push(fullMsg);
    if (messages.length > 100) messages.shift();
    saveMessages(messages);
    io.emit("message", fullMsg);
  });

  // Chat: history
  socket.on("requestMessages", () => socket.emit("previousMessages", messages));

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    delete socketUsernames[socket.id];
  });
});

// Daily clear
cron.schedule("0 0 * * *", () => {
  messages = [];
  saveMessages(messages);
  io.emit("chatReset");
});

server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
