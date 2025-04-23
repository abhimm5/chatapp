const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const User = require("./models/User");
const Room = require("./models/Room");
const multer = require("multer");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const { Server } = require("socket.io");
const mongoURI = process.env.MONGO_URI;

// server.js - top

const memoryUsers = new Map(); // socket.id → user object

const memoryRooms = new Map(); // roomName → { users: Set of socket.ids or usernames, ... }
const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://openchatting.netlify.app",
    methods: ["GET", "POST"],
    credentials: true
  }
});







// Serve static files (e.g., HTML, CSS, JS) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors({
  origin: "https://openchatting.netlify.app",
  credentials: true
}));
 // general CORS for REST/API calls

app.get("/api/something", (req, res) => {
  res.json({ message: "✅ Successfully hit backend API!" });
});


// MongoDB connection setup
mongoose.connect(mongoURI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));




app.use(express.static("public"));

// Multer setup: Store file in temp folder before processing
const storage = multer.diskStorage({
    destination: "public/temp/", // Temporary folder
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

// Route to upload & resize avatar
const sharp = require("sharp");


//express-rate-limit to limit avatar uploads:
const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // Limit to 5 requests per minute
    message: "Too many uploads, please try again later.",
});

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
}





// Handle user connection
io.on("connection", (socket) => {
 // console.log("New client connected", socket.id);

function findUserByUsername(memoryUsers, username) {
  for (const [_, value] of memoryUsers) {
    if (value.username === username) {
      return value;  // Return the user as soon as it's found
    }
  }
  return null;  // Return null if no user is found
}




// avatar setup 
app.post("/uploadAvatar", uploadLimiter, upload.single("avatar"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

        const username = req.body.username;
        const inputPath = req.file.path;
        const randomString = generateRandomString(16);
        const outputPath = `public/avatars/${randomString + "_"+ Date.now()}.png`; // Save as PNG

        // Resize & make circular
        await sharp(inputPath)
            .resize(50, 50)
            .composite([{ // Mask to make it circular
                input: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50">
        <circle cx="25" cy="25" r="25" fill="white"/>
    </svg>`
),

                blend: "dest-in"
            }])
            .toFile(outputPath);

        // Remove temp file
        fs.unlinkSync(inputPath);

        // Save in DB
        const filePath = `/avatars/${path.basename(outputPath)}`;
        


        // ✅ First, check if the user is in memory (based on username)
    const user = findUserByUsername(memoryUsers, username);

        if(user){
            user.profilePic = profilePicture || user.profilePic;
            await User.findOneAndUpdate({ username }, { profilePic: filePath });
        } else {
           console.log("user not found profile picture cant be uploaded")
        }

        res.json({ success: true, filePath });

    } catch (error) {
        console.error("Error during avatar upload:", error);
        res.status(500).json({ success: false, error: "Upload failed", details: error.message });
    }

});



//getAllUsers()

  // When a user sets their username
socket.on("setUser", async (username, chatLimit, roomName, profilePicture) => {
  try {
    console.log("🔎 Checking if user exists ======>", username);

    // ✅ First, check if the user is in memory (based on username)
    const user = findUserByUsername(memoryUsers, username);

    if (user) {
      // ✅ Update in-memory
      user.socketID = socket.id;
      user.status = "online";
      user.room = roomName;
      user.profilePic = profilePicture || user.profilePic;

      // ✅ Also update in MongoDB
      await User.updateOne(
        { username },
        {
          $set: {
            socketID: socket.id,
            status: "online",
            room: roomName,
            profilePic: user.profilePic
          }
        }
      );
      console.log(`🔄 Updated existing user ${username} in memory and MongoDB.`);
    } else {
      // ✅ New user — build user object
      const newUser = {
        username,
        socketID: socket.id,
        status: "online",
        chatLimit,
        room: roomName,
        profilePic: profilePicture || "/avatars/default_avatar.png",
      };

      // ✅ Save to in-memory (use username as key for quick lookup if possible)
      memoryUsers.set(socket.id, newUser);

      // ✅ Save to MongoDB
      await User.create(newUser);

      console.log(`✅ New user ${username} added to memory and MongoDB.`);
    }

    // ✅ Optional: console log memory state
    console.log("🧠 Memory Users =>", Array.from(memoryUsers.values()));
  } catch (error) {
    console.error("❌ Error in setUser:", error);
  }
});



socket.on("sendIntroMessage", async (username, roomName) => {
  if (roomName) {
    console.log(username, "has joined");
    console.log(getAllRoom(), "present room status");

    // Check if the user is in memory (O(1) lookup)
    let user = memoryUsers.get(username);

    if (!user) {
      // If not found in memory, fetch the user from the database (O(1) to check memory)
      user = await User.findOne({ username });

      if (user) {
        const newUser = {
          username,
          socketID: socket.id,
          status: "online",
          chatLimit: user.chatLimit, // Assuming chatLimit is in user data
          room: roomName,
          profilePic: user.profilePic || "/avatars/default_avatar.png",
        };
        memoryUsers.set(username, newUser);
      }
    }

    // Join the room (O(1) operation)
    socket.join(roomName);
    sendRoomList(); // Send updated room list when a user joins

    // Add user to the room's memory (O(1) operation)
    if (!memoryRooms.has(roomName)) {
      memoryRooms.set(roomName, { users: new Set() });  // Initialize the room with an empty user set
    }
    memoryRooms.get(roomName).users.add(username); // O(1) for Set operations

    // Get all users in the room from memory (O(n) where n is the number of users in the room)
    const roomData = memoryRooms.get(roomName);
    const usersInRoom = Array.from(roomData.users)
      .map((username) => memoryUsers.get(username)) // O(1) for Map lookup per user
      .filter(Boolean); // Removes any undefined values (safety check)

    // Emit from each user in the room (O(n) where n is the number of users)
    usersInRoom.forEach((roomUser) => {
      io.to(roomName).emit("receiveMessage", {
        text: "is connected",
        user: roomUser.username,
        intro: true,
      });
    });
  } else {
    // Handle case when roomName is falsy (Optional)
    let user = memoryUsers.get(username);

    if (!user) {
      user = await User.findOne({ username });
      if (user) {
        const newUser = {
          username,
          socketID: socket.id,
          status: "online",
          chatLimit: user.chatLimit,
          room: null,
          profilePic: user.profilePic || "/avatars/default_avatar.png",
        };
        memoryUsers.set(username, newUser);
      }
    }

    // Get all socket IDs in the room (if any) from memory
    const roomSockets = io.sockets.adapter.rooms.get(roomName);
    if (roomSockets) {
      const usersInRoom = Array.from(roomSockets)
        .map((socketID) => memoryUsers.get(socketID)) // O(1) lookup for each socketID
        .filter(Boolean); // Safely filter out undefined users

      // Emit "is not here" for each user in the room (O(n) where n is the number of users)
      usersInRoom.forEach((roomUser) => {
        io.to(roomName).emit("receiveMessage", {
          text: "is not here",
          user: roomUser.username,
          intro: true,
        });
      });
    }
  }
});








//getAllUsers()
  async function getAllUsers() {
  try {
    const users = await User.find(); // Fetch all users
    console.log("All users:", users);
  } catch (err) {
    console.error("Error retrieving users:", err);
  }
  }
  async function getAllRoom() {
  try {
    const room = await Room.find(); // Fetch all room
    console.log("All room:", room);
  } catch (err) {
    console.error("Error retrieving room:", err);
  }
  }





async function createNewRoom(username, socket) {
  const randomString = generateRandomString(16);
  let roomName = `room_${randomString + "_" + Date.now()}`;

  // Check if user exists in the database
  let user = await User.findOne({ username });
  if (!user) {
    console.log("User not found");
    return;
  }

  // Update user room in memory
  user.room = roomName;
  memoryUsers.set(username, { ...user.toObject(), room: roomName }); // Save to memoryUsers

  // Create and store the room in memory
  if (!memoryRooms.has(roomName)) {
    memoryRooms.set(roomName, { roomName, users: new Set([username]) });  // Store room with user in memory
  } else {
    memoryRooms.get(roomName).users.add(username);
  }

  // Update user profile in the new room (memory-based)
  socket.join(roomName);

  console.log(`🆕 New room ${roomName} created for ${username}`);
  socket.emit("randomConnectError", "Waiting for a partner...");
  socket.emit("setNewRoom", roomName);

  // Update the database after 10 seconds delay
  setTimeout(async () => {
    try {
      // Persist the room and user data to the database
      user.room = roomName;
      await user.save();  // Update user’s room in the database

      // Create the room document in the database
      let newRoom = new Room({
        roomName,
        users: [{ _id: user._id, username: user.username, profilePic: user.profilePic }]
      });

      await newRoom.save();  // Save room to the database

      console.log(`Database updated: Room ${roomName} created for ${username}`);
    } catch (error) {
      console.error("Error saving to database:", error);
    }
  }, 10000);  // 10 seconds delay
}






socket.on("validateRoom", async (username, chatLimit, roomName) => {
    try {
        // Step 1: Check in memory first
        let user = memoryUsers.get(username);
        let roomData = memoryRooms.get(roomName);

        // If user or room is not in memory, fetch from database
        if (!user) {
            user = await User.findOne({ username });
            if (!user) {
                socket.emit("roomValidationError", "User not found.");
                return;
            }
            memoryUsers.set(username, { ...user.toObject(), room: null }); // Add user to memory
        }

        if (!roomData) {
            let room = await Room.findOne({ roomName });
            if (!room) {
                socket.emit("roomValidationError", "Room not found.");
                return;
            }
            // Add room data to memory
            memoryRooms.set(roomName, { roomName: room.roomName, users: new Set(room.users.map(u => u.username)) });
            roomData = memoryRooms.get(roomName);
        }

        console.log("Validating room for:", username);

        // ✅ Check if user is already in the room (before checking if full)
        if (roomData.users.has(username)) {
            socket.emit("redirectToChat", { roomName });
            return;
        }

        // ✅ Prevent joining if room is full
        if (roomData.userLimit && roomData.users.size >= roomData.userLimit) {
            socket.emit("roomValidationError", "Room is full.");
            return;
        }

        console.log("Validating Successfully for:", username);

        // ✅ Allow joining (but no changes to userLimit)
        socket.emit("roomValidationSuccess", roomName);
    } catch (error) {
        console.error("Error in validateRoom:", error);
        socket.emit("roomValidationError", "Something went wrong.");
    }
});










socket.on("joinRoom", async (username, chatLimit, roomName) => {
    try {
        // Check if user exists in memory first
        let user = memoryUsers.get(username);
        if (!user) {
            // If not in memory, fetch user from database (only if necessary)
            user = await User.findOne({ username });
            if (!user) {
                socket.emit("error", "User not found.");
                return;
            }

            // Save user to memory after fetching from DB
            memoryUsers.set(username, { ...user.toObject(), room: null });
        }

        // Check if room exists in memory
        let roomData = memoryRooms.get(roomName);
        if (!roomData) {
            // If room doesn't exist, fetch from DB (fallback)
            let room = await Room.findOne({ roomName });
            if (!room) {
                socket.emit("error", "Room not found.");
                return;
            }

            // Save room to memory after fetching from DB
            memoryRooms.set(roomName, { roomName: room.roomName, users: new Set(room.users.map(u => u.username)) });
            roomData = memoryRooms.get(roomName);
        }

        // ✅ Check if the user is already in the room
        if (roomData.users.has(username)) {
            socket.emit("redirectToChat", { roomName });
            return;
        }

        // ✅ Check if the room is full
        if (roomData.userLimit && roomData.users.size >= roomData.userLimit) {
            socket.emit("roomValidationError", "Room is full.");
            return;
        }

        // ✅ Memory First - Add user to memory
        roomData.users.add(username);
        memoryUsers.set(username, { ...user, room: roomName });

        // ✅ Join the room
        socket.join(roomName);

        // ✅ Notify other users in the room
        roomData.users.forEach((userInRoom) => {
            let roomUser = memoryUsers.get(userInRoom);
            if (roomUser) {
                io.to(roomUser.socketID).emit("userJoined", { username: user.username, room: roomName });
            }
        });

        sendRoomList(); // Update the room list for the client

        // ✅ Redirect the user **AFTER** everything is done
        socket.emit("redirectToChat", { roomName });

        // ✅ Update the database after a short delay (e.g., 10 seconds)
        setTimeout(async () => {
            try {
                // Update user room in the database
                user.room = roomName;
                await user.save();

                // Add user to the room in the database
                let room = await Room.findOne({ roomName });
                if (room) {
                    room.users.push({ _id: user._id, username: user.username, profilePic: user.profilePic, socketID: socket.id });
                    await room.save();
                }

                console.log(`Room and user data updated in DB for ${username} in ${roomName}`);
            } catch (error) {
                console.error("Error saving to database:", error);
            }
        }, 10000);  // Delay of 10 seconds before database update

    } catch (error) {
        console.error("Error in joinRoom:", error);
    }
});























// Handle the random connect request (create a room if no available rooms)
socket.on("randomConnect", async (username, chatLimit) => {
   
    try {
        let user = await User.findOne({ username });

         console.log("Full chatlimit details ====>",chatLimit == null, chatLimit, user.chatLimit === null)
         let rooms = await Room.find({});
         console.log(rooms.length !== 0)

        if (!user) {
            socket.emit("randomConnectError", "User not found!");
            return;
        }

        if (user.room && rooms.length !== 0) {
            socket.emit("randomConnectError", "Room already exists please wait, let others to join your room");
            return;
        }
        if(user.chatLimit == "1"){
            socket.emit("randomConnectError", "Room can not be created for 1 poeple");
            return;
        }

        // Fetch all existing rooms
        let availableRoom = null;
        let singleUserRoom = null;

        

        // 🟢 2️⃣ Rooms exist → Find a suitable room
        if (user.chatLimit) {
            // a) **Find a room that exactly matches the chatLimit** (and is not full)
            availableRoom = rooms.find(room => room.userLimit === chatLimit && room.users.length < chatLimit);
            
            // b) **If no exact match, find a single-user room with no chatLimit**
            if (!availableRoom) {
                singleUserRoom = rooms.find(room => room.users.length === 1 && room.userLimit === 'null');
            }
        } else if(user.chatLimit === null) {
            // If no chatLimit, find a room with increasing number of users (but not exceeding its limit)
            for (let size = 1; size <= 10; size++) {
                availableRoom = rooms.find(room => 
                    room.users.length === size && 
                    (room.userLimit == "null" || room.users.length < room.userLimit)
                );
                console.log(availableRoom, rooms)
                if (availableRoom) break;
            }
        }

        // 🟢 3️⃣ If a valid room is found, join it
        if (availableRoom) {

            if (availableRoom.userLimit && availableRoom.users.length >= availableRoom.userLimit) {
                console.log("Room is full, creating a new one...");
                availableRoom = null; // ✅ Reset, so a new room is created
            } else {
                //change chatLimit of room
                if(availableRoom.userLimit == null && user.chatLimit !== null){
                    availableRoom.userLimit = user.chatLimit;
                    await availableRoom.save();
                }
                // Join the found room
                user.room = availableRoom.roomName;
                await user.save();

                availableRoom.users.push({ _id: user._id, username: user.username, profilePic: user.profilePic, socketID: user.socketID });
                await availableRoom.save();

                socket.join(availableRoom.roomName);
                console.log(`${username} joined ${availableRoom.roomName}`);

                // ✅ Notify all users in the room
                availableRoom.users.forEach((roomUser) => {
                    let otherUsers = availableRoom.users
                        .filter(u => u._id.toString() !== roomUser._id.toString())
                        .map(u => u.username);

                    io.to(roomUser.socketID).emit("startChat", otherUsers, availableRoom.roomName);
                });

                return;
            }
        }

        // 🟢 4️⃣ If no exact match, use a single-user room & set chatLimit
        if (singleUserRoom) {
            singleUserRoom.userLimit = chatLimit; // ✅ Set chatLimit dynamically
            await singleUserRoom.save();

            user.room = singleUserRoom.roomName;
            await user.save();

            singleUserRoom.users.push({ _id: user._id, username: user.username, profilePic: user.profilePic, socketID: user.socketID });
            await singleUserRoom.save();

            socket.join(singleUserRoom.roomName);
            console.log(`${username} joined ${singleUserRoom.roomName}`);

            // ✅ Notify all users in the room
            singleUserRoom.users.forEach((roomUser) => {
                let otherUsers = singleUserRoom.users
                    .filter(u => u._id.toString() !== roomUser._id.toString())
                    .map(u => u.username);

                io.to(roomUser.socketID).emit("startChat", otherUsers, singleUserRoom.roomName);
            });
            return;
        }

        // 🟢 1️⃣ No rooms exist → Create a new room
        if (!availableRoom && !singleUserRoom) {
            const randomString = generateRandomString(16);
    
            let newRoom = new Room({
                roomName: `room_${randomString}_${Date.now()}`,
                userLimit: chatLimit || null, // ✅ If no chatLimit, set to null
                users: [{ _id: user._id, username: user.username, profilePic: user.profilePic, socketID: user.socketID }]
            });

            await newRoom.save();
            user.room = newRoom.roomName;
            await user.save();
            socket.join(newRoom.roomName);

            console.log(`Created new room: ${newRoom.roomName}`);
            io.to(socket.id).emit("startChat", "Waiting for a partner...", newRoom.roomName);
            return;
        }

    } catch (error) {
        console.error("Error in randomConnect:", error);
    }
});






























 // getAllUsers()

 // Handle incoming messages in the room
socket.on("sendMessage", async (data) => {
    const { user, text, isImage, image, isEmoji, removeEmoji, imageUrl, enter } = data;

    console.log("Message received:", text);
    console.log("Memory Users:", memoryUsers);
    console.log("Memory Rooms:", memoryRooms);

    // Fetch user from memory
    let userObj = memoryUsers.get(user); // Use memory cache instead of DB query
    if (!userObj || !userObj.room) {
        console.log(`User ${user} is not in a room.`);
        return;
    }

    const roomName = userObj.room;

    // Fetch room from memory
    let room = memoryRooms.get(roomName); // Use memory cache instead of DB query
    if (!room) {
        console.log(`Room ${roomName} does not exist.`);
        return;
    }

    // Get all users in the room from memory cache
    const usersInRoom = room.users; // Now usersInRoom should contain usernames like ['VVV', 'AAA']
    console.log("Users in Room:", usersInRoom);

    // Send normal text/emoji messages instantly
    if (!isImage) {
        usersInRoom.forEach((username) => {
            let recipient = memoryUsers.get(username); // Access user object using username
            if (recipient) {
                console.log(`Sending message to ${recipient.username}`);
                io.to(recipient.socketID).emit("receiveMessage", {
                    text,
                    user,
                    isImage,
                    image,
                    isEmoji,
                    removeEmoji,
                    imageUrl,
                    enter
                });
            } else {
                console.log(`User ${username} not found in memoryUsers`);
            }
        });
    }

    // Handle image messages with delay
    if (isImage) {
        const placeholderData = {
            user,
            isImageLoading: true, // New flag for placeholder
        };

        // Send placeholder first
        usersInRoom.forEach((username) => {
            let recipient = memoryUsers.get(username); // Access user object using username
            if (recipient) {
                console.log(`Sending placeholder image to ${recipient.username}`);
                io.to(recipient.socketID).emit("receiveMessage", placeholderData);
            } else {
                console.log(`User ${username} not found in memoryUsers`);
            }
        });

        // Send real image after delay
        setTimeout(() => {
            usersInRoom.forEach((username) => {
                let recipient = memoryUsers.get(username); // Access user object using username
                if (recipient) {
                    console.log(`Sending real image to ${recipient.username}`);
                    io.to(recipient.socketID).emit("receiveMessage", {
                        text,
                        user,
                        isImage,
                        image,
                        isEmoji,
                        removeEmoji,
                        imageUrl,
                        enter
                    });
                } else {
                    console.log(`User ${username} not found in memoryUsers`);
                }
            });
        }, 2000); // Adjust delay as needed
    }
});












// Event listener for "dataClean" event
socket.on("dataClean", async () => {
  try {
    // Clear all users
    await User.deleteMany({});
    console.log("All users deleted!");

    // Clear all rooms
    await Room.deleteMany({});
    console.log("All rooms deleted!");
  } catch (error) {
    console.error("Error deleting data:", error);
  }
});


  // Handle Disconnection
socket.on("disconnect", async () => {

    
    try {
        let user = await User.findOne({ socketID: socket.id });

        if (user) {
            const roomName = user.room;
            console.log(`❌ User ${user.username} disconnected. His room is ${roomName} and ${socket.id}`);



            // Mark the user as offline instead of deleting
            await User.updateOne(
    { socketID: socket.id }, 
    { 
        $set: { status: "offline", lastActive: Date.now() } 
    }
);    


        }
    } catch (error) {
        console.error("Error handling disconnection:", error);
    }
});






socket.on("removeUser", async (userBio) => {
    await removeAvatar(userBio);
    await User.deleteOne({ username: userBio });
    console.log(`User ${userBio} removed`);
});




socket.on("heartbeat", async (roomName) => {
    console.log(`💓 Heartbeat from ${socket.id}${roomName ? ` in room ${roomName}` : ""}`);
    
    await User.updateOne(
        { socketID: socket.id },
        { $set: { lastActive: Date.now(), status: "online" } }
    );

    if (roomName) {
        roomHeartbeats[roomName] = Date.now();
    }
});


// When a user leaves a room
socket.on("leaveRoom", async (roomName, reason) => {
    await leaveRoom(socket.id, roomName, reason);
});


// Handle room list request
socket.on("getRooms", async () => {
    sendRoomList(); // Send room list on request
});



// Handle room list request
socket.on("checkRoom", async () => {
    getAllRoom(); // Send room list on request
});


// Handle room list request
socket.on("checkUser", async () => {
    getAllUsers(); // Send room list on request
});







});






// Periodically check for inactive users every 30 seconds
setInterval(async () => {
    const inactiveUsers = await User.find({ status: "offline" });

    for (const user of inactiveUsers) {
        if (Date.now() - user.lastActive > 30000) { // 30 seconds
            await leaveRoom(user.socketID, user.room); // Remove user from room
            
            await User.deleteOne({ username: user.username }); // Delete user from DB
            console.log(`🗑️ User ${user.username} removed due to inactivity.`);
            io.to(user.room).emit("userStatusChange", user.username, "disconnected", user.room);

            // 🔥 Check if the room is empty and delete it
            const room = await Room.findOne({ roomName: user.room });
            if (room && room.users.length === 0) {
                await Room.deleteOne({ roomName: user.room });
                console.log(`🚮 Room '${user.room}' deleted (empty).`);
            }
        }
    }
}, 30000); // Runs every 30 seconds







async function leaveRoom(socketID, roomName, reason) {
    const user = await User.findOne({ socketID });

    if (!user || user.room !== roomName) return;

    console.log(`${user.username} is leaving ${roomName}`);

    if (reason) {
        io.to(roomName).emit("userStatusChange", user.username, reason);
    } else {
        console.log("left ========>")
         io.to(roomName).emit("userStatusChange", user.username, "left the room");
    }

    await User.updateOne({ socketID }, { $set: { room: null } });

    let room = await Room.findOne({ roomName });

    if (room) {
        room.users = room.users.filter(u => u._id.toString() !== user._id.toString());
        console.log(`Removed ${user.username} from ${roomName}`);
        await room.save();

        if (room.users.length === 0) {
            await Room.deleteOne({ roomName });
            console.log(`Room ${roomName} deleted as it is empty.`);
        }
    }

    await checkAndRemoveEmptyRooms(); // Check and delete empty rooms

    sendRoomList();
}


const removeAvatar = async (username) => {
    try {
        const user = await User.findOne({ username });

        if (!user) {
            console.log(`User ${username} not found.`);
            return;
        }

        console.log("User data:", user); // Debugging log

        if (user.profilePic && typeof user.profilePic === 'string') {  
            // Extract filename from the path (removes leading '/avatars/')
            const avatarFilename = path.basename(user.profilePic);
            const avatarPath = path.join(__dirname, 'public/avatars', avatarFilename);

            console.log(avatarFilename,"=====",avatarPath)

            // Check if the avatar file exists
            if (fs.existsSync(avatarPath)) {
                fs.unlinkSync(avatarPath);
                console.log(`Deleted avatar file: ${avatarPath}`);
            } else {
                console.log(`Avatar file not found at: ${avatarPath}`);
            }

            // Remove avatar reference from database
            await User.updateOne({ username }, { $set: { profilePic: null } });

            console.log(`Avatar removed for user: ${username}`);
        } else {
            console.log(`No valid profile picture found for user: ${username}`);
        }
    } catch (error) {
        console.error("Error removing avatar:", error);
    }
};



async function sendRoomList() {
    const rooms = await Room.find().populate("users", "username profilePic"); 
    io.emit("roomList", rooms); // Send the updated list to all users in the lobby
}


async function checkAndRemoveEmptyRooms() {
    let emptyRooms = await Room.find({ users: { $size: 0 } }); // Find rooms with no users
    for (let room of emptyRooms) {
        await Room.deleteOne({ roomName: room.roomName }); // Delete empty rooms
    }

    if (emptyRooms.length > 0) sendRoomList(); // Update room list if any room was removed
}


// remove users if they are not logged in for 3 day
setInterval(async () => {
    const inactiveThreshold = Date.now() - 3 * 24 * 60 * 60 * 1000; // 72 hours ago

    try {
        const result = await User.deleteMany({ lastActive: { $lt: inactiveThreshold } });
        console.log(`Auto-removed ${result.deletedCount} inactive users.`);
    } catch (error) {
        console.error("Error auto-removing inactive users:", error);
    }
}, 3 * 24 * 60 * 60 * 1000); // Run every 72 hours or 3 days




// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server is running on openchatting.netlify.app"));


