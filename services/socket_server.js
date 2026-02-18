const { Server } = require('socket.io');

let io;

function initSocket(httpServer) {
    console.log('Initializing Socket.IO server...');
    io = new Server(httpServer, {
        cors: { origin: '*' }   // tighten this in production
    });
    io.on('connection', (socket) => {
        console.log('📱 Flutter client connected:', socket.id);
        socket.on('disconnect', () => console.log('Flutter client disconnected:', socket.id));
    });

    return io;
}

// Call this from whatsapp_service.js to push events to Flutter
function getIO() { return io; }

module.exports = { initSocket, getIO };