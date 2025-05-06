const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");
const cron = require("node-cron");
const path = require("path");

const app = express();
const server = http.createServer(app);

// === CORS Configuration ===
const FRONTEND_ORIGIN = "https://unknown.ftp.sh";

app.use(cors({
  origin: FRONTEND_ORIGIN,
  methods: ["GET", "POST"],
  credentials: true
}));

// Serve static files if you ever need to
app.use(express.static(path.join(__dirname, "public")));

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const USERS_FILE = path.join(__dirname, "users.json");
const MESSAGES_FILE = path.join(__dirname, "messages.json");

// Load or initialize users
function loadUserCredentials() {
  try {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
    const raw = fs.readFileSync(USERS_FILE, "utf-8");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Error loading users.json:", e);
    return {};
  }
}

// Save users back to file
function saveUserCredentials(creds) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(creds, null, 2));
    console.log("users.json updated");
  } catch (e) {
    console.error("Error writing users.json:", e);
  }
}

let userCredentials = loadUserCredentials();

// Load or initialize messages
let messages = [];
try {
  if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, "[]");
  messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf-8"));
} catch (e) {
  console.error("Error loading messages.json:", e);
  messages = [];
}

io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);
  socket.emit("previousMessages", messages);

  // Chat user authentication
  socket.on("authenticateChatUser", async (data, callback) => {
    console.log("🔑 auth attempt:", data.username);
    const hash = userCredentials[data.username];
    if (!hash) {
      console.log("❌ user not found:", data.username);
      return callback({ success: false });
    }
    const ok = await bcrypt.compare(data.password, hash);
    console.log(ok ? "✅ auth success" : "❌ auth failed", data.username);
    callback({ success: ok });
  });

  // Admin: add user
  socket.on("add-user", async ({ user, pwd }) => {
    console.log("➕ add-user:", user);
    if (!user || !pwd || userCredentials[user]) {
      return socket.emit("userAdded", { success: false });
    }
    const hash = await bcrypt.hash(pwd, 10);
    userCredentials[user] = hash;
    saveUserCredentials(userCredentials);
    socket.emit("userAdded", { success: true, user });
  });

  // Admin: list users
  socket.on("get-users", () => {
    const list = Object.keys(userCredentials).map(u => ({ username: u }));
    console.log("📃 get-users:", list);
    socket.emit("userList", list);
  });

  // Admin: edit user
  socket.on("edit-user", async ({ oldUsername, newUsername, newPassword }) => {
    console.log("✏️ edit-user:", oldUsername, "→", newUsername);
    if (
      !userCredentials[oldUsername] ||
      !newUsername ||
      !newPassword ||
      (newUsername !== oldUsername && userCredentials[newUsername])
    ) {
      return socket.emit("userUpdated", { success: false });
    }
    delete userCredentials[oldUsername];
    userCredentials[newUsername] = await bcrypt.hash(newPassword, 10);
    saveUserCredentials(userCredentials);
    socket.emit("userUpdated", { success: true, username: newUsername });
  });

  // Admin: delete user
  socket.on("delete-user", (username) => {
    console.log("➖ delete-user:", username);
    if (!userCredentials[username]) {
      return socket.emit("userDeleted", { success: false });
    }
    delete userCredentials[username];
    saveUserCredentials(userCredentials);
    socket.emit("userDeleted", { success: true, username });
  });

  // Handle chat messages
  socket.on("message", (msg) => {
    console.log("💬 message:", msg);
    messages.push(msg);
    if (messages.length > 100) messages.shift();
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    io.emit("message", msg);
  });

  // Send history on request
  socket.on("requestMessages", () => {
    console.log("📥 requestMessages");
    socket.emit("previousMessages", messages);
  });

  socket.on("disconnect", () => {
    console.log("🔌 User disconnected:", socket.id);
  });
});

// Daily reset at midnight
cron.schedule("0 0 * * *", () => {
  messages = [];
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  io.emit("chatReset");
  console.log("🕛 Chat cleared at midnight");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
