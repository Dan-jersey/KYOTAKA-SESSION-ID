// Perfect QR Code Generator for WhatsApp Bot
// Designed for maximum efficiency, security, and clarity

const express = require("express");
const pino = require("pino");
const { toBuffer } = require("qrcode");
const path = require("path");
const fs = require("fs-extra");
const { Boom } = require("@hapi/boom");
const {
    default: WasiWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    DisconnectReason,
    makeInMemoryStore,
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 5000;

// Default message for user
const MESSAGE = `
┌───⭓『
❒ *WASI-MD*
❒ _NOW DEPLOY IT_
└────────────⭓
┌───⭓
❒  • Chat with owner •
❒ *GitHub:* __https://github.com/WASI-MD_
❒ *Author:* _wa.me/923192173398_
❒ *YT:* _https://youtube.com/@wasitech10_
└────────────⭓
`;

// Paths and directories
const AUTH_DIR = path.join(__dirname, "auth_info_baileys");
const CLEANUP_MESSAGE = "Authentication folder cleaned and ready for a new session.";

// Clean authentication folder
if (fs.existsSync(AUTH_DIR)) {
    fs.emptyDirSync(AUTH_DIR);
    console.log(CLEANUP_MESSAGE);
}

// Core function to handle WhatsApp connection
async function initializeWhatsApp(res) {
    console.log("Initializing WhatsApp connection...");
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const socket = WasiWASocket({
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: [Browsers.Chrome, "Windows 10", "Chrome/108.0.0.0"],
        auth: state,
    });

    // Event listener for connection updates
    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("QR code generated. Scan to authenticate.");
            res.end(await toBuffer(qr)); // Send QR code as response
        }

        if (connection === "open") {
            console.log("WhatsApp connection established!");
            await handleSuccessfulConnection(socket);
        }

        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            handleDisconnection(reason, res, socket);
        }
    });

    // Save credentials on update
    socket.ev.on("creds.update", saveCreds);
}

// Handle successful WhatsApp connection
async function handleSuccessfulConnection(socket) {
    try {
        const user = socket.user.id;
        const creds = fs.readFileSync(path.join(AUTH_DIR, "creds.json"));
        const sessionId = Buffer.from(creds).toString("base64");

        console.log(`
==================== SESSION ID ==========================
SESSION-ID ==> ${sessionId}
==========================================================
        `);

        // Send session ID and default message
        const initialMessage = await socket.sendMessage(user, { text: sessionId });
        await socket.sendMessage(user, { text: MESSAGE }, { quoted: initialMessage });

        // Clean up authentication folder for security
        await delay(1000);
        fs.emptyDirSync(AUTH_DIR);
        console.log(CLEANUP_MESSAGE);
    } catch (error) {
        console.error("Error during successful connection handling:", error);
    }
}

// Handle disconnections and retry logic
function handleDisconnection(reason, res, socket) {
    switch (reason) {
        case DisconnectReason.connectionClosed:
            console.log("Connection closed. Reconnecting...");
            initializeWhatsApp(res);
            break;
        case DisconnectReason.connectionLost:
            console.log("Connection lost. Retrying...");
            initializeWhatsApp(res);
            break;
        case DisconnectReason.restartRequired:
            console.log("Restart required. Restarting...");
            initializeWhatsApp(res);
            break;
        case DisconnectReason.timedOut:
            console.log("Connection timed out. Retrying...");
            initializeWhatsApp(res);
            break;
        default:
            console.error("Unexpected disconnection. Reason:", reason);
            break;
    }
}

// Main endpoint for QR code generation
app.use("/", (req, res) => {
    console.log("Incoming request received.");
    initializeWhatsApp(res).catch((error) => {
        console.error("Error initializing WhatsApp:", error);
        res.status(500).send("Failed to initialize WhatsApp connection.");
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
})
