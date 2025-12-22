const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Pfad zum 'public' Ordner definieren
const publicPath = path.join(__dirname, 'public');

// Debugging: Zeige in der Konsole an, wo wir suchen
console.log("-----------------------------------");
console.log("Server sucht Dateien in:", publicPath);
if (fs.existsSync(publicPath)) {
    console.log("Ordner 'public' gefunden: JA");
    if (fs.existsSync(path.join(publicPath, 'index.html'))) {
        console.log("Datei 'index.html' gefunden: JA");
    } else {
        console.error("ACHTUNG: 'index.html' fehlt im 'public' Ordner!");
    }
} else {
    console.error("ACHTUNG: Ordner 'public' nicht gefunden! Bitte erstelle ihn.");
}
console.log("-----------------------------------");

// Statische Dateien bereitstellen
app.use(express.static(publicPath));

// Explizite Route für die Startseite (hilft bei Fehlersuche)
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send(`
            <h1>Fehler: index.html nicht gefunden!</h1>
            <p>Der Server sucht hier: <code>${indexPath}</code></p>
            <p>Bitte stelle sicher, dass du einen Ordner namens <b>public</b> hast und die <b>index.html</b> darin liegt.</p>
        `);
    }
});

// --- GAME STATE ---
let players = {};
const MAX_HEALTH = 100;

io.on('connection', (socket) => {
    console.log('Spieler verbunden:', socket.id);

    players[socket.id] = {
        id: socket.id,
        x: 0, y: 5, z: 0, qy: 0,
        health: MAX_HEALTH,
        isDead: false,
        score: 0, kills: 0, deaths: 0
    };

    socket.emit('init', { id: socket.id, players: players });
    socket.broadcast.emit('playerJoined', players[socket.id]);

    socket.on('updatePosition', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].qy = data.qy;
        }
    });

    socket.on('shoot', (data) => {
        const target = players[data.targetId];
        const shooter = players[socket.id];

        if (target && !target.isDead && shooter) {
            target.health -= data.damage;
            io.emit('playerHit', { id: data.targetId, health: target.health });

            if (target.health <= 0) {
                target.isDead = true;
                target.deaths++;
                shooter.kills++;
                shooter.score += (data.damage >= 40) ? 150 : 100;

                io.emit('playerDied', {
                    victimId: data.targetId,
                    killerId: socket.id,
                    players: players
                });
            }
        }
    });

    socket.on('respawn', () => {
        if (players[socket.id]) {
            players[socket.id].isDead = false;
            players[socket.id].health = MAX_HEALTH;
            players[socket.id].x = 0;
            players[socket.id].y = 5;
            players[socket.id].z = 0;
            io.emit('playerRespawned', players[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        console.log('Spieler weg:', socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

setInterval(() => {
    io.emit('updatePositions', players);
}, 1000 / 60);

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Spiel läuft auf: http://localhost:${PORT}`);
});
