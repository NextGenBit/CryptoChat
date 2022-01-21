const users = [];

// Join user to chat
function userJoin(id, username, room, pubKey, timestamp) {

    const index = users.findIndex(user => user.id === id);
    const user = {id, username, room, pubKey, timestamp};

    if (index !== -1) {
        users[index] = user
    } else {
        users.push(user);
    }

    return user;
}

// Get current user
function getCurrentUser(id) {
    return users.find(user => user.id === id);
}

function updatePubKey(id, key) {
    const index = users.findIndex(user => user.id === id);

    if (index !== -1) {
        users[index].pubKey = key
        return users[index]
    }

    return false
}

// User leaves chat
function userLeave(id) {
    const index = users.findIndex(user => user.id === id);

    if (index !== -1) {
        return users.splice(index, 1)[0];
    }
}

// Get room users
function getRoomUsers(room) {
    return users.filter(user => user.room === room);
}

module.exports = {
    updatePubKey,
    userJoin,
    getCurrentUser,
    userLeave,
    getRoomUsers
};
