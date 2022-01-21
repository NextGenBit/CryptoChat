/** The core Vue instance controlling the UI */
const vm = new Vue({
    el: '#vue-instance',
    data() {
        return {
            socket: null,
            originPublicKey: null,
            onlineUsers: {},
            messages: [],
            notifications: [],
            typingTimeout: undefined,
            LockedRoom: false,
            typing: false,
            symmetricKey: null,
            JoinedRoom: false,
            username: "Test" + Math.floor(Math.random() * 1000),
            RoomToJoin: "SuperRoom" + Math.floor(Math.random() * 1000),
            draft: ''
        }
    },
    async created() {

        this.username = this.getUrlParam("username", "Guest" + Math.floor(Math.random() * 1000))
        this.RoomToJoin = this.getUrlParam("room", "Room" + Math.floor(Math.random() * 1000))

        this.addNotification('Welcome!')


        await this.generatePairs()
        this.addNotification(`Your username is ${this.username}`)

        // Initialize socketio
        this.socket = io()
        this.setupSocketListeners()
    },
    methods: {
        /** Setup Socket.io event listeners */
        setupSocketListeners() {
            // Automatically join default room on connect
            this.socket.on('connect', () => {
                this.JoinedRoom = false
                this.addNotification('Connected To Server.')
                this.joinRoom()
            })

            // Notify user that they have lost the socket connection
            this.socket.on('disconnect', () => this.addNotification('Lost Connection'))

            // Decrypt and display message when received
            this.socket.on('MESSAGE', async (userId, chat) => {
                const fromUser = this.getUser(userId)

                if (fromUser) {

                    const derivedKey = await getSharedKey(fromUser.pubKey.ecdh)
                    const decode = await decrypt(chat.message, derivedKey, fromUser.pubKey.ecdsa)

                    if (decode === false) {
                        this.addNotification(`Failed to decrypt message from ${fromUser.username}`, true)
                        return
                    } else if (!decode.verified) {
                        this.addNotification(`SIGNATURE ERROR FROM ${fromUser.username}! WARNING`, true)
                        return
                    }

                    this.addMessage({
                        text: decode.text,
                        sender: fromUser.username
                    })

                    if (!document.hasFocus()) {
                        this.newMessageSound()
                    }

                }

            })

            // Broadcast public key when a new room is joined
            this.socket.on('ONLINE_LIST', async (users) => {

                this.JoinedRoom = true
                this.addNotification(`You have Joined the Room. Fetching Online list`)

                this.onlineUsers = {}
                users.forEach((user) => {
                    if (user.id != this.socket.id) {
                        this.onlineUsers[user.id] = user
                    }
                })
            })

            // We tried to join a LOCKED ROOM.
            this.socket.on('ROOM_LOCKED', (room) => {
                this.addNotification(`Room ${room} is locked. You can not join`)
            })

            // Someone LOCKED the room. report it
            this.socket.on('LOCKED', (username) => {
                this.LockedRoom = true
                this.addNotification(`Room Locked by ${username}`)
            })

            // Someone LOCKED the room. report it
            this.socket.on('UNLOCKED', (username) => {
                this.LockedRoom = false
                this.addNotification(`Room UnLocked by ${username}`)
            })

            // Someone LOCKED the room. report it
            this.socket.on('USER_TYPING', (userId) => {
                const user = this.getUser(userId)
                if (user) {
                    user.typing = true

                    vm.onlineUsers.__ob__.dep.notify()
                }
            })

            this.socket.on('USER_NOTYPING', (userId) => {
                const user = this.getUser(userId)
                if (user) {
                    user.typing = false
                    vm.onlineUsers.__ob__.dep.notify()
                }
            })

            // Someone LOCKED the room. report it
            this.socket.on('CLEAN_MESSAGES', (username) => {
                this.messages = []
                this.addNotification(`Forced Messages Clean-up by ${username}`)
            })

            // Broadcast public key when a new room is joined
            this.socket.on('NEW_JOIN', (user) => {
                this.addNotification(`Joined Room - ${user.username}`)
                this.onlineUsers[user.id] = user
            })

            // Save public key when received
            this.socket.on('PUBLIC_KEY', async (userId, keys) => {

                const [success, pubKeys] = await this.parsePubKey(keys)

                if (!success) {
                    this.addNotification(`Public Key Received but the decryption failed.`, true)
                }

                this.updateKeys(userId, pubKeys)
            })

            // Clear destination public key if other user leaves room
            this.socket.on('USER_LEFT', (user) => {
                this.addNotification(`User ${user.username} left the room`)

                if (user.id in this.onlineUsers) {
                    delete this.onlineUsers[user.id]
                }
            })

            // Notify room that someone attempted to join
            this.socket.on('INTRUSION_ATTEMPT', (username) => {
                this.addNotification(`${username} tried to join this room but it is locked`, true)
            })
        },

        /** Encrypt and emit the current draft message */
        async sendMessage() {
            // Don't send message if there is nothing to send
            if (!this.draft || this.draft === '') {
                return
            }

            const TypedMessage = this.draft

            //reset it
            this.draft = ''

            //add local messsage to UI
            this.addMessage({
                'text': TypedMessage,
                'sender': this.username
            })

            //await this.generatePairs(true)

            let encryptedMsgs = [];
            for (const [userId, onlineUser] of Object.entries(this.onlineUsers)) {

                const textEncrypted = TypedMessage
                const derivedKey = await getSharedKey(onlineUser.pubKey.ecdh)
                const encrypted = await encrypt(textEncrypted, derivedKey)

                if (encrypted === false) {
                    this.addNotification(`Failed to encrypt message for ${onlineUser.username}. Ignoring...`, true)
                    continue
                }

                encryptedMsgs.push({
                    'message': encrypted,
                    'receiver': onlineUser.id
                })
            }

            this.draft = ''

            //clear typing timeout and send it
            clearTimeout(this.typingTimeout);
            this.timeoutFunction()


            if (encryptedMsgs.length > 0) {
                this.socket.emit('MESSAGE', encryptedMsgs)
            }
        },

        newMessageSound() {
            const src = 'https://proxy.notificationsounds.com/notification-sounds/me-too-603/download/file-sounds-1144-me-too.mp3';
            const audio = new Audio(src);
            audio.play();
        },


        lockRoom() {
            if (this.JoinedRoom && !this.LockedRoom) {
                this.socket.emit('LOCK')
            }
        },

        UnlockRoom() {
            if (this.JoinedRoom && this.LockedRoom) {
                this.socket.emit('UNLOCK')
            }
        },

        /** Join the specified chatroom */
        joinRoom() {
            if (this.JoinedRoom === false && this.originPublicKey) {
                this.addNotification(`Connecting to Room #${this.RoomToJoin}`)

                // Reset room state variables
                this.onlineUsers = {}
                //this.messages = []

                // Emit room join request.
                this.socket.emit('JOIN', this.username, this.RoomToJoin, this.originPublicKey)
            }
        },

        /** Add message to UI, and scroll the view to display the new message. */
        addMessage(message) {
            this.messages.push(message)
            this.autoscroll(this.$refs.chatContainer)
        },

        /** Append a notification message in the UI */
        addNotification(message, urgent = false) {
            const timestamp = new Date().toLocaleTimeString()
            this.notifications.push({message, timestamp, urgent})
            this.autoscroll(this.$refs.notificationContainer)
        },

        /** Emit the public key to all users in the chatroom */
        sendPublicKey() {
            if (this.originPublicKey) {
                this.socket.emit('PUBLIC_KEY', this.originPublicKey)
            }
        },

        getUrlParam(parameter, defaultvalue) {
            var urlparameter = defaultvalue;
            if (window.location.href.indexOf(parameter) > -1) {
                urlparameter = this.getUrlVars()[parameter];
            }
            return urlparameter;
        },

        getUrlVars() {
            var vars = {};
            var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, key, value) {
                vars[key] = value;
            });
            return vars;
        },

        cleanMessages() {
            this.messages.forEach(function (message, index, object) {
                if (this.getCurrentTime() > message.sent + 60) {
                    object.splice(index, 1);
                }
            });
        },

        getCurrentTime() {
            return new Date().getTime() / 1000
        },


        async generatePairs(send = false) {

            if (this.symmetricKey && !(this.symmetricKey.length == 32 || this.symmetricKey.length == 16)) {
                this.addNotification(`Symmetric key needs to be 16 or 32 bytes long.`, true)
                this.symmetricKey = null
                return
            }

            this.originPublicKey = null
            
            //generate new key pairs
            this.originPublicKey = await generateKeyPairs()

            if (this.symmetricKey && this.originPublicKey) {

                //encrypt our publicKeys using the SymmetricKey (AES)
                console.log(this.originPublicKey)
                this.originPublicKey.ecdh.x = await encryptCk(this.originPublicKey.ecdh.x, this.symmetricKey)
                this.originPublicKey.ecdh.y = await encryptCk(this.originPublicKey.ecdh.y, this.symmetricKey)

                //Re-parse PublicKeys from onlineUsers using our Symmetric-key. 
                for (const [userId, onlineUser] of Object.entries(this.onlineUsers)) {
                    const [success, pubKeyParsed] = await this.parsePubKey(onlineUser.pubKey)
                    this.updateKeys(userId, pubKeyParsed)
                    console.log(pubKeyParsed)
                }

                this.addNotification(`New Encrypted Keypair Generated`, true)
            } else {
                this.addNotification(`New Keypair Generated`, true)
            }

            if (send) {
                //send public key to all Online Users
                this.sendPublicKey()
            }
        },


        async parsePubKey(keys) {

            const ecdhKey = keys.ecdh

            if (this.symmetricKey === null && !(ecdhKey.x.encText)) {
                return [true, keys]
            }

            const decryptedX = await decryptCk(ecdhKey.x, this.symmetricKey, keys.ecdsa)
            const decryptedY = await decryptCk(ecdhKey.y, this.symmetricKey, keys.ecdsa)

            if (decryptedY === false || decryptedX === false) {
                return [false, keys]
            }

            if (!(decryptedX.verified || decryptedY.verified)) {
                this.addNotification(`WARNING! SIGNATURE ERROR.`, true)
                return [false, keys]
            }

            keys.ecdh.x = decryptedX.text
            keys.ecdh.y = decryptedY.text

            return [true, keys]
        },

        getUser(userId) {
            if (userId in this.onlineUsers) {
                return this.onlineUsers[userId]
            }
            return false
        },

        updateKeys(userId, key) {
            if (userId in this.onlineUsers) {
                this.onlineUsers[userId].pubKey = key
            }
        },

        /** Autoscoll DOM element to bottom */
        autoscroll(element) {
            if (element) {
                element.scrollTop = element.scrollHeight
            }
        },

        timeoutFunction() {
            this.typing = false;
            this.socket.emit('NO_TYPING')
        }
    },

    mounted() {
        window.addEventListener("keydown", async function (e) {

            if (this.typing === false) {
                this.typing = true
                this.socket.emit('TYPING')
                this.typingTimeout = setTimeout(this.timeoutFunction, 3000);
            } else {
                clearTimeout(this.typingTimeout);
                this.typingTimeout = setTimeout(this.timeoutFunction, 3000);
            }
            
            if (e.shiftKey) {

                if (e.key == "K") {
                    await this.generatePairs(true)
                }

                if (e.key == "U") {
                    this.UnlockRoom()
                }

                if (e.key == "L") {
                    this.lockRoom()
                }

                if (e.key == "C") {
                    this.messages = []
                }

                if (e.key == "Z") {
                    this.socket.emit('CLEAN')
                }
            }
        }.bind(this));
    }
})
