const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const { google } = require('googleapis');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.urlencoded({ extended: true }));

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "aomsin18037";
const CLIENT_TOKEN = process.env.CLIENT_TOKEN || "AOMXD+_SECRET_2026";
const SHEET_ID = process.env.SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || "HWID";
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function sheetRange(range) {
    const safeName = SHEET_NAME.replace(/'/g, "''");
    return `'${safeName}'!${range}`;
}

let adminSessions = new Set();
let users = {};
let sockets = {};
let bannedUsers = {};
let userLimits = {};
let userNames = {};

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

let sheetsClient = null;

async function initGoogleSheet() {
    try {
        if (!SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) {
            console.log("Google Sheet disabled: missing SHEET_ID or GOOGLE_SERVICE_ACCOUNT_JSON");
            return;
        }

        // 👇 ใส่ตรงนี้
        console.log("SHEET_ID:", SHEET_ID);
        console.log("SHEET_NAME:", SHEET_NAME);
        console.log("Google JSON loaded:", !!GOOGLE_SERVICE_ACCOUNT_JSON);

        const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);

        if (credentials.private_key) {
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        sheetsClient = google.sheets({
            version: 'v4',
            auth
        });

        console.log("Google Sheet connected");

        await loadSheetData();
    }
    catch (err) {
        console.log("Google Sheet init error:", err.message);
    }
}

async function loadSheetData() {
    try {
        if (!sheetsClient) return;

        const range = sheetRange("A2:G");

        const result = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range
        });

        const rows = result.data.values || [];

        bannedUsers = {};
        userLimits = {};

        rows.forEach(row => {
            const hwid = row[0];
            const banned = row[1];
            const limit = row[2];
	        const username = row[3];
                        const lastLogin = row[4];
                        const lastLogout = row[5];

            if (!hwid) return;

            if (String(banned).toUpperCase() === "TRUE") {
                bannedUsers[hwid] = true;
            }

            userLimits[hwid] = parseInt(limit) || 1;
	       users[hwid] = {
    	sessions: new Set(),
    	lastLogin: lastLogin || '-',
    	lastLogout: lastLogout || '-',
    	forceShutdown: false
	};

            if (!users[hwid]) {
                users[hwid] = {
                    sessions: new Set(),
                    lastLogin: '-',
                    lastLogout: '-',
                    forceShutdown: false
                };
            }
        });

        console.log("Sheet data loaded:", rows.length);
    }
    catch (err) {
        console.log("Load sheet error:", err.message);
    }
}

async function saveUserToSheet(hwid) {
    try {
        if (!sheetsClient || !hwid) return;

        const range = sheetRange("A2:G");

        const result = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range
        });

        const rows = result.data.values || [];

        let rowIndex = -1;

        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === hwid) {
                rowIndex = i + 2;
                break;
            }
        }

        const banned = bannedUsers[hwid] ? "TRUE" : "FALSE";
        const limit = userLimits[hwid] || 1;
        const username = userNames[hwid] || "USER-" + hwid;
const lastLogin = users[hwid]?.lastLogin || '-';
const lastLogout = users[hwid]?.lastLogout || '-';
const note = "";

const values = [[hwid, banned, limit, username, lastLogin, lastLogout, note]];

        const values = [[hwid, banned, limit, note]];

        if (rowIndex === -1) {
            await sheetsClient.spreadsheets.values.append({
                spreadsheetId: SHEET_ID,
                range: sheetRange("A:G"),
                valueInputOption: 'RAW',
                requestBody: {
                    values
                }
            });
        }
        else {
            await sheetsClient.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: sheetRange(`A${rowIndex}:G${rowIndex}`),
                valueInputOption: 'RAW',
                requestBody: {
                    values
                }
            });
        }

        console.log("Saved to sheet:", hwid);
    }
    catch (err) {
        console.log("Save sheet error:", err.message);
    }
}

function getCookie(req, name) {
    const cookies = req.headers.cookie || "";
    const match = cookies.match(new RegExp(name + "=([^;]+)"));
    return match ? match[1] : null;
}

function requireAdmin(req, res, next) {
    const token = getCookie(req, "admin_token");

    if (token && adminSessions.has(token)) {
        return next();
    }

    return res.redirect("/login");
}

/* ===========================
   LOGIN
=========================== */
app.get('/login', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>Admin Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{
    background:radial-gradient(circle at top left,#0f172a,#020617 60%);
    color:white;
    font-family:Arial;
    height:100vh;
    display:flex;
    justify-content:center;
    align-items:center;
}
.login-box{
    width:360px;
    background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.1);
    border-radius:18px;
    padding:30px;
    box-shadow:0 0 40px rgba(255,215,0,.18);
}
.login-title{
    text-align:center;
    font-size:34px;
    font-weight:900;
    color:gold;
    text-shadow:0 0 20px gold;
    margin-bottom:8px;
}
.login-sub{
    text-align:center;
    color:#94a3b8;
    margin-bottom:20px;
}
input{
    width:100%;
    padding:13px;
    margin:9px 0;
    border:none;
    border-radius:10px;
    background:#111827;
    color:white;
    outline:none;
}
button{
    width:100%;
    padding:13px;
    margin-top:12px;
    border:none;
    border-radius:10px;
    background:gold;
    color:#111;
    font-weight:bold;
    cursor:pointer;
}
</style>
</head>
<body>
<form class="login-box" method="POST" action="/login">
    <div class="login-title">Trigger Bot XD+</div>
    <div class="login-sub">ADMIN LOGIN</div>
    <input name="username" placeholder="Username" required>
    <input name="password" type="password" placeholder="Password" required>
    <button type="submit">LOGIN</button>
</form>
</body>
</html>
`);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = crypto.randomBytes(32).toString("hex");
        adminSessions.add(token);

        res.setHeader("Set-Cookie", `admin_token=${token}; HttpOnly; Path=/; SameSite=Strict`);
        return res.redirect("/");
    }

    res.send(`
        <body style="background:#020617;color:white;font-family:Arial;text-align:center;padding-top:100px;">
            <h2 style="color:red;">Login Failed</h2>
            <a href="/login" style="color:gold;">Back</a>
        </body>
    `);
});

app.get('/logout', (req, res) => {
    const token = getCookie(req, "admin_token");

    if (token) {
        adminSessions.delete(token);
    }

    res.setHeader("Set-Cookie", "admin_token=; Max-Age=0; Path=/");
    res.redirect("/login");
});

app.get('/ping', (req, res) => {
    res.status(200).send('OK');
});

app.use(requireAdmin);

/* ===========================
   ADMIN PANEL
=========================== */
app.get('/', (req, res) => {

    let rows = '';

    for (let hwid in users) {
        let u = users[hwid];
        let online = u.sessions.size > 0;

        let status = "OFFLINE";
        let statusClass = "status-offline";

        if (bannedUsers[hwid]) {
            status = "🚫 BANNED";
            statusClass = "status-banned";
        }
        else if (u.forceShutdown === true) {
            status = "✖ FORCE SHUTDOWN";
            statusClass = "status-force";
        }
        else if (online) {
            status = "ONLINE";
            statusClass = "status-online";
        }

        rows += `
        <tr>
            <td>
    <form method="POST" action="/setname/${encodeURIComponent(hwid)}" class="name-form">
        <input name="username" value="${userNames[hwid] || "USER-" + hwid}" class="name-input">
        <button type="submit" class="name-btn">SAVE</button>
    </form>
</td>

<td class="hwid">${hwid}</td>

            <td>
                <span class="${statusClass}">${status}</span>
            </td>

            <td>${u.sessions.size}</td>

            <td>
                <form method="POST" action="/limit/${encodeURIComponent(hwid)}" class="limit-form">
                    <input name="limit" value="${userLimits[hwid] || 1}" class="limit-input">
                    <button type="submit" class="limit-btn">SET</button>
                </form>
            </td>

            <td>${u.lastLogin}</td>
            <td>${u.lastLogout}</td>

            <td>
                <form method="POST" action="/shutdown/${encodeURIComponent(hwid)}"
                style="display:inline;"
                onsubmit="return confirm('Shutdown ${hwid} ?')">
                    <button class="kill-btn" type="submit">✖</button>
                </form>

                ${bannedUsers[hwid] ? `
                    <form method="POST" action="/unban/${encodeURIComponent(hwid)}"
                    style="display:inline;">
                        <button class="ban-btn unban" type="submit">UNBAN</button>
                    </form>
                ` : `
                    <form method="POST" action="/ban/${encodeURIComponent(hwid)}"
                    style="display:inline;"
                    onsubmit="return confirm('Ban ${hwid} ?')">
                        <button class="ban-btn" type="submit">BAN</button>
                    </form>
                `}
            </td>
        </tr>
        `;
    }

    const totalHwid = Object.keys(users).length;
    const onlineNow = Object.values(users).filter(x => x.sessions.size > 0).length;
    const bannedCount = Object.keys(bannedUsers).length;

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
    background:linear-gradient(90deg,#ffd700,#fff3a0,#ffcc00,#fff7c0,#ffd700);
    background-size:300% 300%;
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    animation:goldMove 5s ease infinite, glowPulse 1.5s infinite alternate;
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
    background:linear-gradient(90deg,#00ff99,#00ffff,#00ff99);
    box-shadow:0 0 10px #00ffcc,0 0 25px #00ffff,0 0 45px #00ff99;
}

.panel{
    max-width:1500px;
    margin:auto;
    background:rgba(255,255,255,0.05);
    border:1px solid rgba(255,255,255,0.08);
    border-radius:18px;
    padding:22px;
    box-shadow:0 0 30px rgba(0,255,255,0.08);
}

.stats{
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:15px;
    margin-bottom:18px;
}

.box{
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

.orange-num{
    font-size:34px;
    font-weight:bold;
    color:#ff7a00;
}

.topbar{
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:18px;
}

.left-actions{
    display:flex;
    gap:10px;
}

.action-btn{
    color:white;
    border:none;
    padding:12px 18px;
    border-radius:10px;
    cursor:pointer;
    font-weight:bold;
    font-size:15px;
}

.logout-btn{
    background:#334155;
}

.logout-btn:hover{
    background:#475569;
}

.shutdown-all{
    background:#ff1e1e;
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

.hwid{
    font-weight:bold;
    color:#e5e7eb;
}

.status-online{
    color:#00ff66;
    font-weight:bold;
}

.status-offline{
    color:#ff4444;
    font-weight:bold;
}

.status-force{
    color:#ff0000;
    font-weight:bold;
}

.status-banned{
    color:#ff7a00;
    font-weight:bold;
}

.limit-form{
    display:flex;
    justify-content:center;
    align-items:center;
    gap:6px;
}

.limit-input{
    width:58px;
    text-align:center;
    padding:8px;
    border-radius:8px;
    border:none;
    outline:none;
    background:#f8fafc;
    color:#111;
    font-weight:bold;
}

.limit-btn{
    border:none;
    border-radius:8px;
    background:#00aaff;
    color:white;
    padding:8px 11px;
    font-weight:bold;
    cursor:pointer;
}

.limit-btn:hover{
    background:#22c7ff;
}

.kill-btn{
    width:38px;
    height:38px;
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

.ban-btn{
    border:none;
    border-radius:9px;
    background:#ff7a00;
    color:white;
    padding:10px 13px;
    font-weight:bold;
    cursor:pointer;
    margin-left:6px;
}

.ban-btn:hover{
    background:#ff9f1a;
}

.unban{
    background:#00aa55;
}

.unban:hover{
    background:#00cc66;
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
        text-shadow:0 0 8px #ffd700,0 0 18px #fff2a8;
    }
    to{
        text-shadow:0 0 14px #ffd700,0 0 30px #fff7c0,0 0 50px #ffcc00;
    }
}

.name-form{
    display:flex;
    justify-content:center;
    align-items:center;
    gap:6px;
}

.name-input{
    width:130px;
    text-align:center;
    padding:8px;
    border-radius:8px;
    border:none;
    outline:none;
    background:#f8fafc;
    color:#111;
    font-weight:bold;
}

.name-btn{
    border:none;
    border-radius:8px;
    background:#7c3aed;
    color:white;
    padding:8px 11px;
    font-weight:bold;
    cursor:pointer;
}

.name-btn:hover{
    background:#8b5cf6;
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

    <div class="box">
        <div class="box-title">BANNED</div>
        <div class="orange-num">${bannedCount}</div>
    </div>
</div>

<div class="topbar">
    <div class="left-actions">
        <a href="/logout">
            <button class="action-btn logout-btn">LOGOUT</button>
        </a>

        <form method="POST" action="/shutdownall"
        onsubmit="return confirm('Shutdown ALL users ?')">
            <button class="action-btn shutdown-all" type="submit">SHUTDOWN ALL</button>
        </form>
    </div>
</div>

<table>
<tr>
        <th>USER</th>
    <th>HWID</th>
    <th>STATUS</th>
    <th>OPEN NOW</th>
    <th>LIMIT</th>
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
   SET USER NAME
=========================== */
app.post('/setname/:hwid', async (req, res) => {
    const hwid = decodeURIComponent(req.params.hwid);
    const username = (req.body.username || "").trim();

    userNames[hwid] = username || "USER-" + hwid;

    await saveUserToSheet(hwid);

    res.redirect('/');
});

/* ===========================
   SET LIMIT
=========================== */
app.post('/limit/:hwid', async (req, res) => {
    const hwid = decodeURIComponent(req.params.hwid);

    let limit = parseInt(req.body.limit);

    if (isNaN(limit) || limit < 1) {
        limit = 1;
    }

    userLimits[hwid] = limit;
    await saveUserToSheet(hwid);

    res.redirect('/');
});

/* ===========================
   SHUTDOWN รายคน
=========================== */
app.post('/shutdown/:hwid', (req, res) => {
    const hwid = decodeURIComponent(req.params.hwid);

    if (users[hwid]) {
        users[hwid].forceShutdown = true;
        users[hwid].sessions.clear();
        users[hwid].lastLogout = now();
    }

    if (sockets[hwid]) {
        sockets[hwid].send(JSON.stringify({
            cmd: "shutdown",
            reason: "manual_shutdown"
        }));

        delete sockets[hwid];
    }

    res.redirect('/');
});

/* ===========================
   SHUTDOWN ALL
=========================== */
app.post('/shutdownall', (req, res) => {
    for (let hwid in sockets) {
        if (users[hwid]) {
            users[hwid].forceShutdown = true;
            users[hwid].sessions.clear();
            users[hwid].lastLogout = now();
        }

        sockets[hwid].send(JSON.stringify({
            cmd: "shutdown",
            reason: "shutdown_all"
        }));
    }

    sockets = {};

    res.redirect('/');
});

/* ===========================
   BAN USER
=========================== */
app.post('/ban/:hwid', async (req, res) => {
    const hwid = decodeURIComponent(req.params.hwid);

    bannedUsers[hwid] = true;
    await saveUserToSheet(hwid);
    if (users[hwid]) {
        users[hwid].forceShutdown = true;
        users[hwid].sessions.clear();
        users[hwid].lastLogout = now();
    }

    if (sockets[hwid]) {
        sockets[hwid].send(JSON.stringify({
            cmd: "shutdown",
            reason: "banned"
        }));

        delete sockets[hwid];
    }

    res.redirect('/');
});

/* ===========================
   UNBAN USER
=========================== */
app.post('/unban/:hwid', async (req, res) => {
    const hwid = decodeURIComponent(req.params.hwid);

    delete bannedUsers[hwid];
    await saveUserToSheet(hwid);

    if (users[hwid]) {
        users[hwid].forceShutdown = false;
    }

    res.redirect('/');
});

/* ===========================
   WEBSOCKET
=========================== */
wss.on('connection', ws => {
    ws.on('message', msg => {
        try {
            let data = JSON.parse(msg);

            if (data.token !== CLIENT_TOKEN) {
                ws.send(JSON.stringify({
                    cmd: "shutdown",
                    reason: "invalid_token"
                }));
                return;
            }

            let hwid = data.hwid;
            let session = data.session;

            if (!hwid || !session) {
                return;
            }

            if (bannedUsers[hwid]) {
                ws.send(JSON.stringify({
                    cmd: "shutdown",
                    reason: "banned"
                }));
                return;
            }

            if (!users[hwid]) {
                users[hwid] = {
                    sessions: new Set(),
                    lastLogin: '-',
                    lastLogout: '-',
                    forceShutdown: false
                };
            }

	        if (!userNames[hwid]) {
    		userNames[hwid] = "USER-" + hwid;

            if (data.type === "online") {
                users[hwid].forceShutdown = false;

                const limit = userLimits[hwid] || 1;

                if (users[hwid].sessions.size >= limit) {
                    ws.send(JSON.stringify({
                        cmd: "shutdown",
                        reason: "limit_exceeded"
                    }));
                    return;
                }

                sockets[hwid] = ws;
                users[hwid].sessions.add(session);
                users[hwid].lastLogin = now();
                users[hwid].lastLogout = '-';

		saveUserToSheet(hwid);

            }

            if (data.type === "offline") {
                users[hwid].sessions.delete(session);
                users[hwid].lastLogout = now();

		saveUserToSheet(hwid);
		
                if (users[hwid].sessions.size === 0) {
                    delete sockets[hwid];
                }
            }
        }
        catch (err) {
            console.log("Invalid message:", err.message);
        }
    });
});

const PORT = process.env.PORT || 3000;

initGoogleSheet();

server.listen(PORT, () => {
    console.log("=================================");
    console.log("Trigger Bot XD+ STARTED");
    console.log("PORT : " + PORT);
    console.log("=================================");
});