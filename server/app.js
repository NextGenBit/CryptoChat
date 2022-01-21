const socketio = require('socket.io');
const formatMessage = require('./messages');
const {
    updatePubKey,
    userJoin,
    getCurrentUser,
    userLeave,
    getRoomUsers
} = require('./users');

const lockedRooms = {}

// Attach Socket.io to serverd
const io = socketio.listen(3000);


/** Manage behavior of each client socket connection */
io.on('connection', (socket) => {
    console.log(`User Connected - Socket ID ${socket.id}`)

    socket.on('JOIN', (username, roomName, pubKey) => {

        if (!(roomName in lockedRooms)) {

            const timestamp = new Date().toLocaleTimeString()
            const user = userJoin(socket.id, username, roomName, pubKey, timestamp);

            //subscribe to room
            socket.join(user.room)

            socket.emit('ONLINE_LIST', getRoomUsers(user.room))
            socket.to(user.room).emit('NEW_JOIN', user)

        } else {
            socket.emit("ROOM_LOCKED", roomName);
            io.in(roomName).emit('INTRUSION_ATTEMPT', username)
        }
    })

    socket.on('UNLOCK', () => {
        const user = getCurrentUser(socket.id);

        if (user) {
            if (user.room in lockedRooms) {
                delete lockedRooms[user.room]
                io.in(user.room).emit("UNLOCKED", user.username);
            }
        }
    })

    socket.on('NO_TYPING', () => {
        const user = getCurrentUser(socket.id);
        if (user) {
            io.in(user.room).emit("USER_NOTYPING", socket.id);
        }
    })

    socket.on('TYPING', () => {
        const user = getCurrentUser(socket.id);
        if (user) {
            io.in(user.room).emit("USER_TYPING", socket.id);
        }
    })


    socket.on('CLEAN', () => {
        const user = getCurrentUser(socket.id);

        if (user) {
            io.in(user.room).emit("CLEAN_MESSAGES", user.username);
        }
    })

    socket.on('LOCK', () => {
        const user = getCurrentUser(socket.id);

        if (user) {
            lockedRooms[user.room] = true
            io.in(user.room).emit("LOCKED", user.username);
        }
    })

    /** Broadcast a received message to the room */
    socket.on('MESSAGE', (Messages) => {

        const user = getCurrentUser(socket.id);

        if (user) {
            console.log(`New Message from ${user.id}`)
            Messages.forEach(Message => {

                    const Receiver = Message.receiver
                    delete Message.receiver
                    socket.broadcast.to(Receiver).emit('MESSAGE', user.id, Message)
                }
            );
        }
    })

    /** Broadcast a new publickey to the room */
    socket.on('PUBLIC_KEY', (key) => {
        const user = updatePubKey(socket.id, key);
        if (user) {
            socket.to(user.room).emit('PUBLIC_KEY', socket.id, key)
        }
    })

    socket.on('disconnect', () => {

        console.log(`DISCONNECTION ${socket.id}`)

        const user = userLeave(socket.id);
        if (user) {
            io.to(user.room).emit('USER_LEFT', user)
        }
    });

});