const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let users = {};
let sockets = {};

function now() {
    return new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}
/* ===========================
   หน้า ADMIN PANEL
=========================== */
app.get('/', (req, res) => {

    let rows = '';

    for (let hwid in users) {

        let u = users[hwid];
        let online = u.sessions.size > 0;

        let status = "OFFLINE";
        let color = "#ff4444";

        if (u.forceShutdown === true) {
            status = "✖ FORCE SHUTDOWN";
            color = "#ff0000";
        }
        else if (online) {
            status = "ONLINE";
            color = "#00ff66";
        }

        rows += `
        <tr>
            <td>${hwid}</td>

            <td style="
                color:${color};
                font-weight:bold;
            ">
                ${status}
            </td>

            <td>${u.sessions.size}</td>
            <td>${u.lastLogin}</td>
            <td>${u.lastLogout}</td>

            <td>
                <a href="/shutdown/${hwid}"
                onclick="return confirm('Shutdown ${hwid} ?')">
                    <button class="kill-btn">✖</button>
                </a>
            </td>
        </tr>
        `;
    }

    const totalHwid = Object.keys(users).length;
    const onlineNow = Object.values(users)
        .filter(x => x.sessions.size > 0).length;

    res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="2">
<title>Trigger Bot XD+</title>

<style>

*{
margin:0;
padding:0;
box-sizing:border-box;
}

body{
background:radial-gradient(circle at top left,#0f172a,#020617 60%);
color:white;
font-family:Arial;
min-height:100vh;
padding:30px;
}

.title{
text-align:center;
font-size:56px;
font-weight:900;
letter-spacing:4px;
margin-bottom:8px;

background:linear-gradient(
90deg,
#ffd700,
#fff3a0,
#ffcc00,
#fff7c0,
#ffd700
);

background-size:300% 300%;
-webkit-background-clip:text;
-webkit-text-fill-color:transparent;

animation:
goldMove 5s ease infinite,
glowPulse 1.5s infinite alternate;
}

.subtitle{
text-align:center;
color:#94a3b8;
font-size:14px;
letter-spacing:2px;
margin-bottom:18px;
}

.line{
width:430px;
height:4px;
margin:0 auto 30px auto;
border-radius:50px;

background:linear-gradient(
90deg,
#00ff99,
#00ffff,
#00ff99
);

box-shadow:
0 0 10px #00ffcc,
0 0 25px #00ffff,
0 0 45px #00ff99;
}

.panel{
max-width:1450px;
margin:auto;
background:rgba(255,255,255,0.05);
border:1px solid rgba(255,255,255,0.08);
border-radius:18px;
padding:22px;
backdrop-filter:blur(10px);
box-shadow:0 0 30px rgba(0,255,255,0.08);
}

.stats{
display:flex;
gap:15px;
flex-wrap:wrap;
margin-bottom:18px;
}

.box{
flex:1;
min-width:220px;
background:rgba(255,255,255,0.04);
border-radius:14px;
padding:18px;
border:1px solid rgba(255,255,255,0.05);
}

.box-title{
color:#94a3b8;
font-size:14px;
margin-bottom:8px;
}

.red-num{
font-size:34px;
font-weight:bold;
color:#ff3333;
}

.green-num{
font-size:34px;
font-weight:bold;
color:#00ff66;
}

.topbar{
margin-bottom:18px;
}

.shutdown-all{
background:#ff1e1e;
color:white;
border:none;
padding:12px 18px;
border-radius:10px;
cursor:pointer;
font-weight:bold;
font-size:15px;
}

.shutdown-all:hover{
background:#ff4444;
}

table{
width:100%;
border-collapse:collapse;
overflow:hidden;
border-radius:14px;
}

th{
background:#111827;
color:#00ffff;
padding:14px;
border-bottom:1px solid #334155;
font-size:14px;
}

td{
padding:14px;
text-align:center;
border-bottom:1px solid rgba(255,255,255,0.06);
font-size:14px;
}

tr:hover{
background:rgba(255,255,255,0.04);
}

.kill-btn{
width:36px;
height:36px;
border:none;
border-radius:50%;
background:#ff2020;
color:white;
font-size:20px;
font-weight:bold;
cursor:pointer;
box-shadow:0 0 8px rgba(255,0,0,.4);
}

.kill-btn:hover{
background:#ff5555;
transform:scale(1.08);
}

.footer{
text-align:center;
margin-top:18px;
color:#64748b;
font-size:13px;
}

@keyframes goldMove{
0%{background-position:0% 50%;}
50%{background-position:100% 50%;}
100%{background-position:0% 50%;}
}

@keyframes glowPulse{
from{
text-shadow:
0 0 8px #ffd700,
0 0 18px #fff2a8;
}
to{
text-shadow:
0 0 14px #ffd700,
0 0 30px #fff7c0,
0 0 50px #ffcc00;
}
}

</style>
</head>

<body>

<h1 class="title">Trigger Bot XD+ Protocols</h1>
<div class="subtitle">REALTIME LICENSE CONTROL PANEL</div>
<div class="line"></div>

<div class="panel">

<div class="stats">

<div class="box">
<div class="box-title">TOTAL USER</div>
<div class="red-num">${totalHwid}</div>
</div>

<div class="box">
<div class="box-title">ONLINE NOW</div>
<div class="green-num">${onlineNow}</div>
</div>

</div>

<div class="topbar">
<a href="/shutdownall"
onclick="return confirm('Shutdown ALL users ?')">
<button class="shutdown-all">SHUTDOWN ALL</button>
</a>
</div>

<table>
<tr>
<th>HWID</th>
<th>STATUS</th>
<th>OPEN NOW</th>
<th>LAST LOGIN</th>
<th>LAST LOGOUT</th>
<th>CONTROL</th>
</tr>

${rows}

</table>

<div class="footer">
POWER By AOM XD+ Protocols ©
</div>

</div>

</body>
</html>
`);
});

/* ===========================
   SHUTDOWN รายคน
=========================== */
app.get('/shutdown/:hwid', (req, res) => {

    const hwid = req.params.hwid;

    if (users[hwid]) {
        users[hwid].forceShutdown = true;
        users[hwid].sessions.clear();
        users[hwid].lastLogout = now();
    }

    if (sockets[hwid]) {
        sockets[hwid].send(JSON.stringify({
            cmd: "shutdown"
        }));

        delete sockets[hwid];
    }

    res.redirect('/');
});

/* ===========================
   SHUTDOWN ALL
=========================== */
app.get('/shutdownall', (req, res) => {

    for (let hwid in sockets) {

        if (users[hwid]) {
            users[hwid].forceShutdown = true;
            users[hwid].sessions.clear();
            users[hwid].lastLogout = now();
        }

        sockets[hwid].send(JSON.stringify({
            cmd: "shutdown"
        }));
    }

    sockets = {};

    res.redirect('/');
});

/* ===========================
   WEBSOCKET
=========================== */
wss.on('connection', ws => {

    ws.on('message', msg => {

        let data = JSON.parse(msg);

        let hwid = data.hwid;
        let session = data.session;

        if (!users[hwid]) {
            users[hwid] = {
                sessions: new Set(),
                lastLogin: '-',
                lastLogout: '-',
                forceShutdown: false
            };
        }

        if (data.type === "online") {

            users[hwid].forceShutdown = false;

            sockets[hwid] = ws;
            users[hwid].sessions.add(session);
            users[hwid].lastLogin = now();
            users[hwid].lastLogout = '-';
        }

        if (data.type === "offline") {

            users[hwid].sessions.delete(session);
            users[hwid].lastLogout = now();

            if (users[hwid].sessions.size === 0)
                delete sockets[hwid];
        }

    });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("=================================");
    console.log("Trigger Bot XD+ STARTED");
    console.log("PORT : " + PORT);
    console.log("=================================");
});