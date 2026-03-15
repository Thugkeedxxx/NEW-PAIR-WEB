const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require("@whiskeysockets/baileys")
const P = require("pino")
const express = require("express")
const fetch = require("node-fetch")
const yts = require("yt-search")

const config = require("./config")
const sendMenu = require("./menu")
const startPairing = require("./lib/pair")

const app = express()
const PORT = process.env.PORT || 3000

async function startBot(){

    const { state, saveCreds } = await useMultiFileAuthState("session")

    const sock = makeWASocket({
        logger: P({ level: "silent" }),
        auth: state
    })

    // Auto save credentials
    sock.ev.on("creds.update", saveCreds)

    // Connection updates
    sock.ev.on("connection.update", (update)=>{
        const { connection } = update
        if(connection === "open") console.log("✅ THUGKEED ULTRA BOT CONNECTED")
        if(connection === "close") startBot() // auto reconnect
    })

    // 🔥 Pairing system
    if(!sock.authState.creds.registered){
        console.clear()
        console.log("⚡ THUGKEED ULTRA BOT - PAIRING REQUIRED")
        await startPairing(sock)
    }

    // Messages
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if(!msg.message) return

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text
        if(!text) return

        const from = msg.key.remoteJid

        // ANTILINK
        if(config.antilink && text.includes("chat.whatsapp.com")){
            await sock.sendMessage(from,{text:"🚫 Group links not allowed!"})
            const user = msg.key.participant
            await sock.groupParticipantsUpdate(from,[user],"remove")
        }

        // COMMANDS
        if(!text.startsWith(config.prefix)) return

        const command = text.slice(1).split(" ")[0].toLowerCase()
        const args = text.split(" ").slice(1).join(" ")

        // PING
        if(command === "ping") await sock.sendMessage(from,{text:"🏓 Bot alive"})

        // MENU
        if(command === "menu") await sendMenu(sock, from)

        // OWNER
        if(command === "owner") await sock.sendMessage(from,{text:`👑 Owner: ${config.owner}`})

        // AI
        if(command === "ai"){
            if(!args) return sock.sendMessage(from,{text:"Ask something"})
            const res = await fetch(config.aiApi + encodeURIComponent(args))
            const data = await res.json()
            await sock.sendMessage(from,{text:data.response})
        }

        // PLAY
        if(command === "play"){
            if(!args) return
            const search = await yts(args)
            const video = search.videos[0]
            await sock.sendMessage(from,{text:`🎵 ${video.title}\n${video.url}`})
        }

        // STICKER
        if(command === "sticker"){
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
            if(!quoted) return
            const media = await downloadMediaMessage({ message: quoted },"buffer",{})
            await sock.sendMessage(from,{sticker:media})
        }

        // TIKTOK
        if(command === "tiktok"){
            if(!args) return
            const api = await fetch(`https://api.tiklydown.eu.org/api/download?url=${args}`)
            const data = await api.json()
            await sock.sendMessage(from,{
                video:{url:data.video.noWatermark},
                caption:"🎬 TikTok Download"
            })
        }

        // GROUP MANAGEMENT
        if(msg.key.remoteJid.endsWith("@g.us")){
            if(command === "kick") await sock.groupParticipantsUpdate(from,[args],"remove")
            if(command === "add") await sock.groupParticipantsUpdate(from,[args],"add")
            if(command === "promote") await sock.groupParticipantsUpdate(from,[args],"promote")
            if(command === "demote") await sock.groupParticipantsUpdate(from,[args],"demote")
            if(command === "tagall"){
                const participants = (await sock.groupMetadata(from)).participants.map(p=>p.id)
                await sock.sendMessage(from,{
                    text: args || "⚡ Attention everyone!",
                    mentions: participants
                })
            }
            if(command === "group"){
                if(args === "open") await sock.groupSettingUpdate(from,"not_announcement")
                if(args === "close") await sock.groupSettingUpdate(from,"announcement")
            }
        }

        // SECURITY TOGGLES
        if(command === "antilink"){
            if(args === "on") config.antilink = true
            if(args === "off") config.antilink = false
            await sock.sendMessage(from,{text:`🚨 AntiLink ${config.antilink ? "Enabled" : "Disabled"}`})
        }

        if(command === "welcome"){
            if(args === "on") config.welcome = true
            if(args === "off") config.welcome = false
            await sock.sendMessage(from,{text:`👋 Welcome messages ${config.welcome ? "Enabled" : "Disabled"}`})
        }

    })

    // WELCOME SYSTEM
    sock.ev.on("group-participants.update", async data => {
        if(!config.welcome) return
        for(let user of data.participants){
            if(data.action === "add"){
                await sock.sendMessage(data.id,{
                    text:`👋 Welcome @${user.split("@")[0]}`,
                    mentions:[user]
                })
            }
        }
    })

    // 🔥 Pairing API for Vercel
    app.get("/pair", async (req,res)=>{
        const number = req.query.number
        if(!number) return res.status(400).json({error:"Missing number"})
        try{
            const code = await sock.requestPairingCode(number)
            res.json({ code })
        }catch(e){
            res.status(500).json({error:"Failed to generate code"})
        }
    })

    app.listen(PORT, ()=> console.log(`⚡ THUGKEED BOT API running on port ${PORT}`))
}

startBot()
