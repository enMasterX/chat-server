const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");
const cron = require("node-cron");
const path = require("path");

// === Config ===
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = "https://unknown.ftp.sh";
const ADMIN_PASSWORD = "7482broncos";
const ADMIN_USERNAME = "Burkes";

// === App Setup ===
const app = express();
const server = http.createServer(app);

// CORS for Express
app.use(cors({ origin: FRONTEND_ORIGIN, methods: ["GET","POST"], credentials: true }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET","POST"],
    credentials: true
  }
});

// File paths
const USERS_FILE = path.join(__dirname, "users.json");
const MESSAGES_FILE = path.join(__dirname, "messages.json");

// Load or initialize users
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

let userCredentials = loadUsers();
let messages = loadMessages();

// Socket.IO events
io.on("connection", socket => {
  console.log("🔌 Connected:", socket.id);
  socket.emit("previousMessages", messages);

  // Admin login
  socket.on("authenticate", (pw, cb) => {
    const ok = pw === ADMIN_PASSWORD;
    console.log(ok ? "✅ Admin auth" : "❌ Admin auth failed", pw);
    cb({ success: ok, username: ok ? ADMIN_USERNAME : null });
  });

  // Chat user auth
  socket.on("authenticateChatUser", async ({ username, password }, cb) => {
    const hash = userCredentials[username];
    if (!hash) return cb({ success: false });
    const ok = await bcrypt.compare(password, hash);
    console.log(ok ? "✅ User auth" : "❌ User auth failed", username);
    cb({ success: ok, username: ok ? username : null });
  });

  // Admin: list users
  socket.on("get-users", () => {
    const list = Object.keys(userCredentials).map(u => ({ username: u }));
    socket.emit("userList", list);
  });

  // Admin: add user
  socket.on("add-user", async ({ user, pwd }) => {
    if (userCredentials[user]) return socket.emit("userAdded", { success: false });
    userCredentials[user] = await bcrypt.hash(pwd, 10);
    saveUsers(userCredentials);
    socket.emit("userAdded", { success: true, user });
  });

  // Admin: edit user
  socket.on("edit-user", async ({ oldUsername, newUsername, newPassword }) => {
    if (!userCredentials[oldUsername] ||
        (newUsername !== oldUsername && userCredentials[newUsername])) {
      return socket.emit("userUpdated", { success: false });
    }
    delete userCredentials[oldUsername];
    userCredentials[newUsername] = await bcrypt.hash(newPassword, 10);
    saveUsers(userCredentials);
    socket.emit("userUpdated", { success: true, username: newUsername });
  });

  // Admin: delete user
  socket.on("delete-user", username => {
    if (!userCredentials[username]) return socket.emit("userDeleted", { success: false });
    delete userCredentials[username];
    saveUsers(userCredentials);
    socket.emit("userDeleted", { success: true, username });
  });

  // Chat: handle message
  socket.on("message", msg => {
    messages.push(msg);
    if (messages.length > 100) messages.shift();
    saveMessages(messages);
    io.emit("message", msg);
  });

  // Chat: history
  socket.on("requestMessages", () => socket.emit("previousMessages", messages));

  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

// Daily clear
cron.schedule("0 0 * * *", () => {
  messages = [];
  saveMessages(messages);
  io.emit("chatReset");
  console.log("🕛 Chat cleared at midnight");
});

server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));