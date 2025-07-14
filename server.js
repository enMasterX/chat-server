// server.js
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

// In‐memory state
let showUsernames = false;              // ← feature flag
const adminSockets = new Set();         // track authenticated admin sockets

// Load or initialize users (plaintext passwords)
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8") || "{}");
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Load or initialize messages (array of {username, message})
function loadMessages() {
  if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, "[]");
  return JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf-8") || "[]");
}
function saveMessages(msgs) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgs, null, 2));
}

let userStore = loadUsers();
let messages = loadMessages();

// Helper to format based on toggle
function format(msgObj) {
  return showUsernames && msgObj.username
    ? `${msgObj.username}: ${msgObj.message}`
    : msgObj.message;
}

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // Immediately send current toggle status
  socket.emit("username-display-status", showUsernames);

  // Send history
  socket.emit(
    "previousMessages",
    messages.map(format)
  );

  // --- Admin login ---
  socket.on("authenticate", (pw, cb) => {
    const ok = pw === ADMIN_PASSWORD;
    if (ok) adminSockets.add(socket.id);
    cb({ success: ok, username: ok ? ADMIN_USERNAME : null });
  });

  // Admin: toggle username display
  socket.on("set-username-display", (flag) => {
    if (!adminSockets.has(socket.id)) return;
    showUsernames = !!flag;
    // inform all clients of new setting
    io.emit("username-display-status", showUsernames);
    // also resend history in new format
    io.emit(
      "previousMessages",
      messages.map(format)
    );
    console.log("⚙️ showUsernames set to", showUsernames);
  });

  // --- Chat user auth ---
  socket.on("authenticateChatUser", ({ username, password }, cb) => {
    const stored = userStore[username];
    const ok = stored && stored === password;
    console.log(ok ? "✅ User auth" : "❌ User auth failed", username);
    if (ok) socket.User = username;
    cb({ success: ok, username: ok ? username : null });
  });

  // --- Admin user management ---
  socket.on("get-users", () => {
    if (!adminSockets.has(socket.id)) return;
    const list = Object.entries(userStore).map(([u, pwd]) => ({
      username: u,
      password: pwd,
    }));
    socket.emit("userList", list);
  });

  socket.on("add-user", ({ user, pwd }, cb) => {
    if (!adminSockets.has(socket.id) || userStore[user]) {
      return cb({ success: false });
    }
    userStore[user] = pwd;
    saveUsers(userStore);
    cb({ success: true });
  });

  socket.on("edit-user", ({ oldUsername, newUsername, newPassword }, cb) => {
    if (
      !adminSockets.has(socket.id) ||
      !userStore[oldUsername] ||
      (newUsername !== oldUsername && userStore[newUsername])
    ) {
      return cb({ success: false });
    }
    delete userStore[oldUsername];
    userStore[newUsername] = newPassword;
    saveUsers(userStore);
    cb({ success: true });
  });

  socket.on("delete-user", (username, cb) => {
    if (!adminSockets.has(socket.id) || !userStore[username]) {
      return cb({ success: false });
    }
    delete userStore[username];
    saveUsers(userStore);
    cb({ success: true });
  });

  // --- Chat messages ---
  socket.on("message", ({ username, message }) => {
    if (!socket.User) return;
    const msgObj = { username, message };
    messages.push(msgObj);
    if (messages.length > 100) messages.shift();
    saveMessages(messages);
    io.emit("message", format(msgObj));
    console.log(`${username}: ${message}`);
  });

  // History request
  socket.on("requestMessages", () => {
    socket.emit(
      "previousMessages",
      messages.map(format)
    );
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    adminSockets.delete(socket.id);
  });
});

// Daily clear
cron.schedule("0 0 * * *", () => {
  messages = [];
  saveMessages(messages);
  io.emit("chatReset");
});

server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
