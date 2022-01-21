# CryptoChat
A minimalist, end-to-end ECDH/ECDSA encrypted chat application.

Based on https://github.com/triestpa/Open-Cryptochat.


ECDH is being used for key exchange and ECDSA for digital signature verification. AES256 is used to encrypt the message using the derived key from ECDH.
There is an optional feature to encrypt the Public Keys from ECDH using a custom symmetric key.

There are some keyboard shortcuts as well to enhance security:
 
 * Shift + K | Generates New KeyPairs and send them to all Online Users
 * Shift + L | Locks the Room you are in. No new members can join
 * Shift + U | Unlocks a locked room
 * Shift + C | Clear all messages from the UI locally
 * Shift + Z | Force to clear all messages from the UI for all online users in the room

You can join a room or/and set a username from URL parameters. Example:

```
https://cryptochat-url/?room=roomToJoin&username=guest
```

![Screenshot 1](https://i.ibb.co/Px4ZT7b/Screenshot-1.png)

