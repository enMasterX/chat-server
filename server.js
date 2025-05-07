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
app.use(cors({ origin: FRONTEND_ORIGIN, methods: ["GET","POST"], credentials: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Socket.IO with CORS
const io = new Server(server, {
  cors: { origin: FRONTEND_ORIGIN, methods: ["GET","POST"], credentials: true }
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

// User structure: { [username]: { hash: string, pwd: string } }
let userStore = loadUsers();
let messages = loadMessages();

io.on("connection", socket => {
  console.log("🔌 Connected:", socket.id);
  socket.emit("previousMessages", messages);

  // Admin login
  socket.on("authenticate", (pw, cb) => {
    const ok = pw === ADMIN_PASSWORD;
    cb({ success: ok, username: ok ? ADMIN_USERNAME : null });
  });

  // Chat user auth
  socket.on("authenticateChatUser", async ({ username, password }, cb) => {
    const user = userStore[username];
    if (!user) return cb({ success: false });
    const ok = await bcrypt.compare(password, user.hash);
    cb({ success: ok, username: ok ? username : null });
  });

  // Admin: list users including plaintext passwords
  socket.on("get-users", () => {
    const list = Object.entries(userStore).map(([u, { hash, pwd }]) => ({ username: u, password: pwd }));
    socket.emit("userList", list);
  });

  // Admin: add user
  socket.on("add-user", async ({ user, pwd }) => {
    if (userStore[user]) return socket.emit("userAdded", { success: false });
    const hash = await bcrypt.hash(pwd, 10);
    userStore[user] = { hash, pwd };
    saveUsers(userStore);
    socket.emit("userAdded", { success: true, user });
  });

  // Admin: edit user
  socket.on("edit-user", async ({ oldUsername, newUsername, newPassword }) => {
    if (!userStore[oldUsername] || (newUsername !== oldUsername && userStore[newUsername])) {
      return socket.emit("userUpdated", { success: false });
    }
    delete userStore[oldUsername];
    const hash = await bcrypt.hash(newPassword, 10);
    userStore[newUsername] = { hash, pwd: newPassword };
    saveUsers(userStore);
    socket.emit("userUpdated", { success: true, username: newUsername });
  });

  // Admin: delete user
  socket.on("delete-user", username => {
    if (!userStore[username]) return socket.emit("userDeleted", { success: false });
    delete userStore[username];
    saveUsers(userStore);
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
});

server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));