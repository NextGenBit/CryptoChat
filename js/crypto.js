let privateKey = null
let privateKeySign = null

const namedCurveECC = "P-521"
const hashMethod = "SHA-384"

async function generateKeyPairs() {

    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: namedCurveECC,
        },
        true,
        ["deriveKey", "deriveBits"]
    );
    privateKey = keyPair.privateKey


    const keyPairSign = await window.crypto.subtle.generateKey(
        {
            name: "ECDSA",
            namedCurve: namedCurveECC,
        },
        true,
        ["sign", "verify"]
    );
    privateKeySign = keyPairSign.privateKey

    return {
        ecdh: await window.crypto.subtle.exportKey("jwk", keyPair.publicKey),
        ecdsa: await window.crypto.subtle.exportKey("jwk", keyPairSign.publicKey)
    }
}

async function signMessage(encoded) {

    const signature = await window.crypto.subtle.sign(
        {
            name: "ECDSA",
            hash: hashMethod
        },
        privateKeySign,
        encoded
    );


    return new Uint8Array(signature)
}

async function verifyMessage(encoded, signature, publicKeyecdsa) {

    const publicKey = await window.crypto.subtle.importKey(
        "jwk",
        publicKeyecdsa,
        {
            name: "ECDSA",
            namedCurve: namedCurveECC,
        },
        true,
        ["verify"]
    );

    return await window.crypto.subtle.verify(
        {
            name: "ECDSA",
            hash: hashMethod,
        },
        publicKey,
        signature,
        encoded
    );

}


async function getSharedKey(RemotepublicKeyJwk) {

    if (privateKey === null) {
        return false
    }

    try {

        const publicKey = await window.crypto.subtle.importKey(
            "jwk",
            RemotepublicKeyJwk,
            {
                name: "ECDH",
                namedCurve: namedCurveECC,
            },
            true,
            []
        );

        return await window.crypto.subtle.deriveKey(
            {
                "name": "ECDH",
                "public": publicKey
            },
            privateKey,
            {name: "AES-GCM", length: 256},
            true,
            ["encrypt", "decrypt"]
        );
    } catch (e) {
        console.log(`Error with shared Key: ${e}`)
        return false
    }
}

async function encryptCk(text, key) {

    const rawKey = new TextEncoder().encode(key);

    const importedKey = await window.crypto.subtle.importKey(
        "raw",
        rawKey,
        "AES-GCM",
        true,
        ["encrypt"]
    )

    return await encrypt(text, importedKey)

}

async function decryptCk(objText, key, ecdsaPubKey) {

    const rawKey = new TextEncoder().encode(key);

    const importedKey = await window.crypto.subtle.importKey(
        "raw",
        rawKey,
        "AES-GCM",
        true,
        ["decrypt"]
    )

    return await decrypt(objText, importedKey, ecdsaPubKey)
}


async function encrypt(text, encryptionKey) {

    try {

        const encodedText = new TextEncoder().encode(text);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            encryptionKey,
            encodedText
        );

        const uintArray = new Uint8Array(encryptedData);
        const string = btoa(String.fromCharCode.apply(null, uintArray))

        const signature = await signMessage(encodedText)

        return {
            "encText": string,
            "iv": iv,
            "signature": signature
        }

    } catch (e) {
        console.log(`Error encrypting message: ${e}`)
        return false
    }
}

async function decrypt(text, decryptionKey, ecdsaPubKey) {

    try {
        const iv = new Uint8Array(Object.values(text.iv)).buffer
        const signature = new Uint8Array(Object.values(text.signature)).buffer

        const string = atob(text.encText);

        const uintArray = new Uint8Array(
            [...string].map((char) => char.charCodeAt(0))
        );

        const algorithm = {
            name: "AES-GCM",
            iv: iv
        };

        const decryptedData = await window.crypto.subtle.decrypt(
            algorithm,
            decryptionKey,
            uintArray
        );

        const verify = await verifyMessage(decryptedData, signature, ecdsaPubKey)

        return {
            text: new TextDecoder().decode(decryptedData),
            verified: verify
        }

    } catch (e) {
        console.log(`Error decrypting message: ${e}`)
        return false
    }
}