require('dotenv').config();
const loaders = require('./loaders/index.js');
const socket = require('./socket/index.js');
const express = require('express');
const socketio = require('socket.io');
const Chat = require('./models/chat');
const User = require('./models/user');
const request = require('request');
const app = express();
const { FCM_KEY } = process.env;
loaders(app);

// prod mode
const https = require('https');
const fs = require('fs');
const hostName = "api.portfolian.site";
const options = {
    ca: fs.readFileSync('/etc/letsencrypt/live/' + hostName + '/fullchain.pem'),
    key: fs.readFileSync('/etc/letsencrypt/live/' + hostName + '/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/' + hostName + '/cert.pem'),
};
const server = https.createServer(options, app).listen(443, () => {
    console.log('443:번 포트에서 대기중입니다.');
});

// // test mode
// const server = app.listen(3000, () => {
//     console.log('Start Server : localhost:3000');
// });

let redisConnect = async function(redisClient) {
    await redisClient.connect();
};
const redis = require('redis');
const redisClient = redis.createClient({
    host : "127.0.0.1",
    port : 6379
});
redisConnect(redisClient);

const whiteList = ['http://3.35.89.48:3000','http://localhost:3000','http://portfolian.site:3000',
                'https://portfolian.site:443','https://portfolian.site','https://3.35.89.48'];
const io = socketio(server, { path: '/socket.io',  cors: { origin: whiteList } });

io.on('connection',async function(socket) {
    console.log(`Connection : SocketId = ${socket.id}`);
    io.to(socket.id).emit('connection', {socketId : socket.id} ); 
    
    socket.on('auth', async function(data) {
        const auth_data = JSON.parse(JSON.stringify(data));
        const userId = auth_data.userId;
        console.log(`(auth) userId : ${userId} socket.id : ${socket.id}`);
        let isExist = await redisClient.exists(userId);
        if (isExist)
            await redisClient.del(userId);
        await redisClient.set(userId, socket.id);
        socket.userId = userId;
    });

    socket.on('chat:send', async function(data) {
        const message_data = JSON.parse(JSON.stringify(data));
        const messageContent = message_data.messageContent;
        const roomId = message_data.chatRoomId;
        const receiverId = message_data.receiver;
        const senderId = message_data.sender;
        console.log(`(chat:send) roomId : ${roomId} message : ${messageContent}`);

        // 저장하기
        let chatId = await Chat.createChat(message_data);
        // 로그인 유무 확인 후 socket으로 전송
        let isExist = await redisClient.exists(receiverId);
        if (isExist) {
            console.log(`(chat:send) receiver(${receiverId}) is in here`);
            let receiverSocketId = await redisClient.get(receiverId);
            io.to(receiverSocketId).emit('chat:receive',  message_data);
        }
        else
        {
            let senderNicknameInfo = await User.findNicknameById(senderId);
            let fcmTokenInfo = await User.findFCMTokenById(receiverId);
            let fcmKey = "key=" + FCM_KEY;
            console.log(`======server's fcm key : ${fcmKey}======`)
            console.log(`======receiver's fcm token : ${fcmTokenInfo.fcmToken}======`)
            const options = {
                uri:'https://fcm.googleapis.com/fcm/send',
                method: 'POST',
                headers : {
                    'Content-Type' : 'application/json',
                    'Authorization' : fcmKey
                },
                body:{ 
                "to": fcmTokenInfo.fcmToken,
                    "priority" : "high",
                    "notification" : { 
                        "title" : senderNicknameInfo.nickName,
                        "body" : messageContent,
                        "sound" : "default"
                        }
                },
                json:true
            }
            request.post(options, function (error, response, body) {
                console.log(`(chat:send) receiver(${receiverId}) is not in here => fcm`);
            });
        }
    });

    socket.on('chat:read', async function(data) {
        const read_data = JSON.parse(JSON.stringify(data));
        const roomId = read_data.chatRoomId;
        const userId = read_data.userId;
        await Chat.readChat(userId, roomId);
        console.log(`(chat:read) roomId : ${roomId} userId : ${userId}`);
    });

    socket.on('disconnect', async function () {
        const socketId = socket.id;
        const userId = socket.userId;
        console.log(`(disconnect) socket.id : ${socket.id} socket.userId : ${socket.userId}`);
       // let isExistBefore = await redisClient.exists(userId);
        await redisClient.del(userId);
        //let isExistAfter = await redisClient.exists(userId);
        //console.log(`(disconnect) Before : ${isExistBefore}  After :  ${isExistAfter} `);
    });
})

module.exports = app;
