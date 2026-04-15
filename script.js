/* ================================================================
   LOCALINK — COMPLETE SCRIPT
   Features: Auth, Realtime Tracking, Geofencing, Chat,
             WebRTC Voice/Video Calls, Admin Panel, SOS
   ================================================================ */

// ─── CONFIGURATION ────────────────────────────────────────────
const SUPABASE_URL = 'https://ugspkzccuifbqktdkxhb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XOS9IqSAeMhVE_InL_z2jg_19Zr-qJP';
const sb           = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TRACK_INTERVAL   = 8000;   // ms between location pushes
const STATIONARY_DIST  = 5;      // metres — below this = "stationary"

// ─── STATE ────────────────────────────────────────────────────
let currentUser   = null;
let userProfile   = null;
let isTracking    = false;
let trackTimer    = null;
let lastLatLng    = null;
let map           = null;
let myMarker      = null;
let peerMarkers   = {};          // { userId: L.marker }
let peerProfiles  = {};          // { userId: profileObj }
let geofences     = [];
let geofenceCircles = [];
let insideZones   = {};          // { geofenceId: boolean }
let activeChatUID = null;
let chatSub       = null;
let currentTab    = 'login';
let currentNav    = 'map';

// ─── WebRTC ───────────────────────────────────────────────────
let pc           = null;
let localStream  = null;
let callSub      = null;
const STUN_CFG   = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// ─── HELPERS ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showToast(msg, type = '', duration = 3000) {
    const t   = $('toast');
    t.textContent = msg;
    t.className   = `toast show ${type}`;
    setTimeout(() => { t.className = 'toast hidden'; }, duration);
}

function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── MAP ─────────────────────────────────────────────────────
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap © CARTO'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

function myIcon() {
    return L.divIcon({
        className: '',
        html: `<div style="
            width:18px; height:18px; background:#5b6af5; border:3px solid #fff;
            border-radius:50%; box-shadow:0 0 0 4px rgba(91,106,245,0.35);">
        </div>`,
        iconSize: [18, 18], iconAnchor: [9, 9]
    });
}

function peerIcon(name, online) {
    const color = online ? '#22c55e' : '#94a3b8';
    const letter = (name || '?')[0].toUpperCase();
    return L.divIcon({
        className: '',
        html: `<div style="
            width:34px; height:34px; background:${color}; border:2.5px solid #fff;
            border-radius:50%; box-shadow:0 3px 9px rgba(0,0,0,0.2);
            display:flex; align-items:center; justify-content:center;
            color:#fff; font-family:Outfit,sans-serif; font-weight:700; font-size:13px;">
            ${letter}
        </div>`,
        iconSize: [34, 34], iconAnchor: [17, 17]
    });
}

function updateMyMarker(lat, lng) {
    if (!myMarker) {
        myMarker = L.marker([lat, lng], { icon: myIcon(), zIndexOffset: 1000 }).addTo(map)
            .bindPopup('<b>You</b>');
    } else {
        myMarker.setLatLng([lat, lng]);
    }
}

function updatePeerMarker(uid, lat, lng) {
    const prof = peerProfiles[uid];
    const name = prof?.name || 'User';
    const online = prof?.status === 'online';
    if (!peerMarkers[uid]) {
        peerMarkers[uid] = L.marker([lat, lng], { icon: peerIcon(name, online) })
            .addTo(map)
            .on('click', () => openProfile(uid));
    } else {
        peerMarkers[uid].setLatLng([lat, lng]);
        peerMarkers[uid].setIcon(peerIcon(name, online));
    }
}

// ─── AUTH ─────────────────────────────────────────────────────
async function bootApp() {
    initMap();
    const saved = localStorage.getItem('localink_user');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            const { data } = await sb.from('profiles').select('*').eq('id', parsed.id).eq('password', parsed.pass).single();
            if (data) {
                userProfile = data;
                currentUser = { id: data.id, email: data.login_id };
                onLoginSuccess();
                return;
            }
        } catch(e) {}
    }
    showAuth();
}

function showAuth() {
    $('authOverlay').classList.remove('hidden');
}
function hideAuth() {
    $('authOverlay').classList.add('hidden');
}

async function handleAuth(e) {
    e.preventDefault();
    const loginId  = $('authEmail').value.trim();
    const password = $('authPassword').value;

    $('authBtnLabel').textContent = 'Verifying…';

    try {
        // Find existing profile with this ID and Password
        const { data: user, error } = await sb.from('profiles')
            .select('*')
            .eq('login_id', loginId)
            .eq('password', password)
            .single();
        
        if (error || !user) {
            // Check if this is the first ever user (to make them admin)
            const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true });
            if (count === 0) {
                console.log("Empty system. Initializing admin...");
                const { data: nData, error: iErr } = await sb.from('profiles')
                    .insert({ 
                        name: loginId.split('@')[0], 
                        login_id: loginId, 
                        password: password, 
                        role: 'admin' 
                    })
                    .select().single();
                if (iErr) throw iErr;
                userProfile = nData;
                currentUser = { id: nData.id, email: nData.login_id }; // Mock user object
                onLoginSuccess();
                showToast("Admin access granted! 🛡️", "success");
                return;
            }
            throw new Error("Invalid Login ID or Password.");
        }

        userProfile = user;
        currentUser = { id: user.id, email: user.login_id }; // Mock user object
        onLoginSuccess();
        
    } catch (err) {
        showToast(err.message, 'error');
    }
    $('authBtnLabel').textContent = 'Login';
}

async function onLoginSuccess() {
    localStorage.setItem('localink_user', JSON.stringify({ id: userProfile.id, pass: userProfile.password }));
    renderHeader();
    hideAuth();
    initRealtime();
    await loadGeofences();
    await loadPeers();
    renderContactList(currentNav);
    switchNav('map');
}

function renderHeader() {
    if (!userProfile) return;
    $('displayName').textContent = userProfile.name || 'User';
    $('avatarEl').textContent    = initials(userProfile.name);
}

async function logout() {
    localStorage.removeItem('localink_user');
    await stopTracking();
    location.reload();
}

// ─── NAVIGATION ───────────────────────────────────────────────
function switchNav(tab) {
    currentNav = tab;
    // 1. Update UI state
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    $(`nav${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');

    // 2. Handle specific tabs
    if (tab === 'map') {
        $('sidePanel').classList.add('hidden');
        $('bottomCard').classList.remove('hidden');
        if (window.innerWidth > 520) $('sidePanel').classList.remove('hidden');
    } else if (tab === 'chat' || tab === 'call') {
        $('sidePanel').classList.remove('hidden');
        $('bottomCard').classList.add('hidden');
        $('sidePanel').querySelector('.panel-title').textContent = tab === 'chat' ? 'Select to Chat' : 'Select to Call';
        renderContactList(tab);
    } else if (tab === 'admin') {
        openAdmin();
    } else if (tab === 'about') {
        openAbout();
    }
}

function openAbout() { $('aboutOverlay').classList.remove('hidden'); }
function closeAbout() { $('aboutOverlay').classList.add('hidden'); switchNav('map'); }


// ─── REALTIME ────────────────────────────────────────────────
function initRealtime() {
    // Location changes from peers
    sb.channel('locations-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'locations' }, async (payload) => {
            const loc = payload.new;
            if (loc.user_id === currentUser.id) return;
            if (!peerProfiles[loc.user_id]) await loadPeers();
            updatePeerMarker(loc.user_id, loc.lat, loc.lng);
        })
        .subscribe();

    // Profile status changes
    sb.channel('profiles-channel')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
            const p = payload.new;
            if (p.id === currentUser.id) return;
            peerProfiles[p.id] = p;
            renderContactList(currentNav);
            // Update marker icon
            const lat = peerMarkers[p.id]?.getLatLng()?.lat;
            const lng = peerMarkers[p.id]?.getLatLng()?.lng;
            if (lat) updatePeerMarker(p.id, lat, lng);
        })
        .subscribe();

    // Incoming call signals
    callSub = sb.channel('call-signal')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals' }, (p) => {
            const sig = p.new;
            if (sig.callee_id !== currentUser.id) return;
            if (sig.type === 'offer') handleIncomingCall(sig);
            if (sig.type === 'answer') handleCallAnswer(sig);
            if (sig.type === 'ice') handleRemoteICE(sig);
            if (sig.type === 'end') endCall(false);
        })
        .subscribe();
}

// ─── TRACKING ────────────────────────────────────────────────
async function toggleTracking() {
    if (isTracking) await stopTracking();
    else await startTracking();
}

async function startTracking() {
    if (!navigator.geolocation) { showToast('GPS not available on this device.', 'error'); return; }
    isTracking = true;
    updateTrackingUI(true);
    sendLocation(); // first send immediately
    trackTimer = setInterval(sendLocation, TRACK_INTERVAL);
}

async function stopTracking() {
    if (trackTimer) { clearInterval(trackTimer); trackTimer = null; }
    if (myMarker)   { myMarker.remove(); myMarker = null; }
    isTracking = false;
    updateTrackingUI(false);
    await sb.from('profiles').update({ status: 'offline' }).eq('id', currentUser.id);
}

function sendLocation() {
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const newLatLng = L.latLng(lat, lng);

        // Battery-aware: skip if stationary
        if (lastLatLng && lastLatLng.distanceTo(newLatLng) < STATIONARY_DIST) {
            $('locationCaption').textContent = 'Stationary – saving battery';
            return;
        }
        lastLatLng = newLatLng;
        $('locationCaption').textContent = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;

        updateMyMarker(lat, lng);
        map.panTo([lat, lng]);

        // Push to DB
        await sb.from('locations').insert({ user_id: currentUser.id, lat, lng, timestamp: new Date().toISOString() });
        await sb.from('profiles').update({ status: 'online' }).eq('id', currentUser.id);

        // Geofence check
        checkGeofences(lat, lng);
    }, null, { enableHighAccuracy: true, timeout: 8000 });
}

function updateTrackingUI(online) {
    const btn    = $('toggleBtn');
    const dot    = $('statusLabel');
    const dotEl  = dot.querySelector('.dot');
    if (online) {
        btn.textContent   = 'Stop Sharing';
        btn.className     = 'toggle-btn offline-btn';
        dot.innerHTML     = '<span class="dot online"></span> Online & Sharing';
    } else {
        btn.textContent   = 'Go Online';
        btn.className     = 'toggle-btn online-btn';
        dot.innerHTML     = '<span class="dot offline"></span> Offline';
        $('locationCaption').textContent = 'Press Go Online to start';
    }
}

// ─── GEOFENCING ──────────────────────────────────────────────
async function loadGeofences() {
    const { data } = await sb.from('geofences').select('*');
    if (!data) return;
    geofences = data;
    geofenceCircles.forEach(c => c.remove());
    geofenceCircles = [];
    geofences.forEach(gf => {
        const circle = L.circle([gf.lat, gf.lng], {
            radius: gf.radius, color: '#5b6af5',
            fillColor: '#5b6af5', fillOpacity: 0.07, weight: 1.5
        }).addTo(map).bindTooltip(gf.name, { permanent: true, direction: 'center', className: 'gf-label' });
        geofenceCircles.push(circle);
        insideZones[gf.id] = false;
    });
}

async function checkGeofences(lat, lng) {
    for (const gf of geofences) {
        const dist    = L.latLng(lat, lng).distanceTo(L.latLng(gf.lat, gf.lng));
        const inside  = dist <= gf.radius;
        const wasIn   = insideZones[gf.id];

        if (inside && !wasIn) {
            insideZones[gf.id] = true;
            showToast(`📍 You arrived at ${gf.name}`, 'success');
            await sb.from('geofence_logs').insert({ user_id: currentUser.id, geofence_id: gf.id, event: 'enter' });
        } else if (!inside && wasIn) {
            insideZones[gf.id] = false;
            showToast(`👋 You left ${gf.name}`, 'warn');
            await sb.from('geofence_logs').insert({ user_id: currentUser.id, geofence_id: gf.id, event: 'exit' });
        }
    }
}

// ─── CONTACTS & PEERS ────────────────────────────────────────
async function loadPeers() {
    const { data } = await sb.from('profiles').select('*').neq('id', currentUser.id);
    if (data) data.forEach(p => { peerProfiles[p.id] = p; });
    // Load last known position
    for (const uid of Object.keys(peerProfiles)) {
        const { data: loc } = await sb.from('locations')
            .select('lat,lng').eq('user_id', uid).order('timestamp', { ascending: false }).limit(1);
        if (loc && loc[0]) updatePeerMarker(uid, loc[0].lat, loc[0].lng);
    }
}

function renderContactList(mode = 'chat') {
    const list = $('contactsList');
    const uids = Object.keys(peerProfiles);
    if (uids.length === 0) { list.innerHTML = '<p class="muted">No contacts yet.</p>'; return; }
    list.innerHTML = uids.map(uid => {
        const p      = peerProfiles[uid];
        const online = p.status === 'online';
        const action = mode === 'chat' ? `openChat('${uid}')` : `startCall('${uid}', false)`;
        return `<div class="contact-item" onclick="${action}">
            <div class="avatar sm">${initials(p.name)}</div>
            <div>
                <div class="username">${p.name || p.email.split('@')[0]}</div>
                <div class="muted small">${online ? '🟢 Online' : '⚫ Offline'}</div>
            </div>
        </div>`;
    }).join('');
}

// ─── PROFILE POPUP ───────────────────────────────────────────
function openProfile(uid) {
    const p = peerProfiles[uid];
    if (!p) return;
    $('ppAvatar').textContent = initials(p.name);
    $('ppName').textContent   = p.name || 'User';
    $('ppEmail').textContent  = p.email;
    $('ppStatus').textContent = p.status === 'online' ? '🟢 Online' : '⚫ Offline';
    $('ppChatBtn').onclick    = () => { closeProfile(); openChat(uid); };
    $('ppCallBtn').onclick    = () => { closeProfile(); startCall(uid, false); };
    $('ppVideoBtn').onclick   = () => { closeProfile(); startCall(uid, true); };
    $('profilePopup').classList.remove('hidden');
}
function closeProfile() { $('profilePopup').classList.add('hidden'); }

// ─── CHAT ────────────────────────────────────────────────────
async function openChat(uid) {
    activeChatUID = uid;
    const p = peerProfiles[uid];
    $('chatTitle').textContent  = p?.name || 'Chat';
    $('chatAvatar').textContent = initials(p?.name);
    $('chatStatus').textContent = p?.status === 'online' ? '🟢 Online' : '⚫ Offline';
    $('chatWindow').classList.remove('hidden');

    await fetchChatHistory();

    // Subscribe to new messages
    if (chatSub) sb.removeChannel(chatSub);
    chatSub = sb.channel('chat-' + [currentUser.id, uid].sort().join('-'))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
            const m = p.new;
            if ((m.sender_id === currentUser.id && m.receiver_id === activeChatUID) ||
                (m.sender_id === activeChatUID && m.receiver_id === currentUser.id)) {
                appendBubble(m);
            }
        })
        .subscribe();
}

function closeChat() {
    activeChatUID = null;
    if (chatSub) { sb.removeChannel(chatSub); chatSub = null; }
    $('chatWindow').classList.add('hidden');
}

async function fetchChatHistory() {
    const uid = activeChatUID;
    const { data } = await sb.from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${uid}),and(sender_id.eq.${uid},receiver_id.eq.${currentUser.id})`)
        .order('timestamp', { ascending: true })
        .limit(80);
    const body = $('chatBody');
    body.innerHTML = '';
    if (!data || data.length === 0) {
        body.innerHTML = '<p class="muted center-text">Start the conversation 👋</p>';
        return;
    }
    data.forEach(m => appendBubble(m, false));
    body.scrollTop = body.scrollHeight;
}

function appendBubble(m, scroll = true) {
    const sent = m.sender_id === currentUser.id;
    const body = $('chatBody');
    const div  = document.createElement('div');
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = sent ? 'flex-end' : 'flex-start';
    div.innerHTML = `
        <div class="bubble ${sent ? 'sent' : 'received'}">${escHTML(m.content)}</div>
        <div class="bubble-time">${fmtTime(m.timestamp)}</div>`;
    body.appendChild(div);
    if (scroll) body.scrollTop = body.scrollHeight;
}

function escHTML(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function sendMessage() {
    if (!activeChatUID) return;
    const input   = $('msgInput');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    await sb.from('messages').insert({
        sender_id: currentUser.id, receiver_id: activeChatUID,
        content, timestamp: new Date().toISOString()
    });
}

// ─── WebRTC CALLS ────────────────────────────────────────────
async function startCall(uid, withVideo = false) {
    const p = peerProfiles[uid];
    showCallUI(p?.name || 'User', 'Calling…');

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
    $('localVideo').srcObject = localStream;
    if (!withVideo) $('localVideo').style.display = 'none';

    pc = new RTCPeerConnection(STUN_CFG);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = e => { $('remoteVideo').srcObject = e.streams[0]; };
    pc.onicecandidate = e => {
        if (e.candidate) pushSignal(uid, 'ice', { candidate: e.candidate });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await pushSignal(uid, 'offer', { sdp: offer, withVideo });
    $('callState').textContent = 'Ringing…';
}

async function handleIncomingCall(sig) {
    const caller = peerProfiles[sig.caller_id];
    if (!confirm(`📞 Incoming call from ${caller?.name || 'Someone'}. Accept?`)) {
        await pushSignal(sig.caller_id, 'end', {});
        return;
    }
    showCallUI(caller?.name || 'User', 'Connected');

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: sig.data.withVideo });
    $('localVideo').srcObject = localStream;
    if (!sig.data.withVideo) $('localVideo').style.display = 'none';

    pc = new RTCPeerConnection(STUN_CFG);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = e => { $('remoteVideo').srcObject = e.streams[0]; };
    pc.onicecandidate = e => {
        if (e.candidate) pushSignal(sig.caller_id, 'ice', { candidate: e.candidate });
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sig.data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await pushSignal(sig.caller_id, 'answer', { sdp: answer });
}

async function handleCallAnswer(sig) {
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sig.data.sdp));
    $('callState').textContent = 'Connected';
}

async function handleRemoteICE(sig) {
    if (!pc || !sig.data.candidate) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(sig.data.candidate)); } catch (e) {}
}

async function endCall(sendSignal = true) {
    if (sendSignal && activeChatUID) await pushSignal(activeChatUID, 'end', {});
    if (pc) { pc.close(); pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    $('callOverlay').classList.add('hidden');
    $('localVideo').srcObject = null;
    $('remoteVideo').srcObject = null;
}

async function pushSignal(calleeId, type, data) {
    await sb.from('call_signals').insert({ caller_id: currentUser.id, callee_id: calleeId, type, data });
}

function showCallUI(name, state) {
    $('callName').textContent   = name;
    $('callState').textContent  = state;
    $('callAvatar').textContent = initials(name);
    $('callOverlay').classList.remove('hidden');
}

function toggleMic() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; showToast(track.enabled ? '🎙️ Mic on' : '🔇 Mic off'); }
}

function toggleCamera() {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; showToast(track.enabled ? '📷 Camera on' : '📷 Camera off'); }
}

// ─── SOS ────────────────────────────────────────────────────
async function sendSOS() {
    if (!confirm('🚨 Send SOS alert with your location to all contacts?')) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        await sb.from('messages').insert({
            sender_id: currentUser.id, receiver_id: null,
            content: `🆘 SOS ALERT from ${userProfile?.name}! Location: ${lat.toFixed(5)}, ${lng.toFixed(5)} — https://maps.google.com/?q=${lat},${lng}`,
            timestamp: new Date().toISOString()
        });
        showToast('🆘 SOS alert sent!', 'error', 5000);
    });
}

// ─── ADMIN PANEL ─────────────────────────────────────────────
function openAdmin() {
    $('adminOverlay').classList.remove('hidden');
    console.log("Opening Admin Panel. Profile:", userProfile);
    const isAdmin = userProfile?.role === 'admin';
    
    // Toggle UI visibility based on role
    const tabs = $('adminTabs');
    if (tabs) tabs.classList.toggle('hidden', !isAdmin);

    ['adminUsers', 'adminGeofences', 'adminGroups'].forEach(id => {
        const el = $(id);
        if (el) el.classList.add('hidden');
    });
    
    const lock = $('adminAuthLock');
    if (lock) lock.classList.toggle('hidden', isAdmin);
    
    if (isAdmin) {
        $('adminUsers').classList.remove('hidden'); // Default tab
        loadAdminUsers();
    }
}
function closeAdmin() { $('adminOverlay').classList.add('hidden'); }

async function elevateToAdmin() {
    // Hidden functionality - remains for emergency but no longer in UI
}

async function nuclearReset() {
    if (!confirm("🚨 TOTAL SYSTEM WIPE: This will delete ALL users, tracking data, and messages. This cannot be undone. Proceed?")) return;
    
    showToast("Wiping database...", "warn");
    
    try {
        // We attempt to delete all rows by using a filter that matches everything
        const tables = ['locations', 'messages', 'geofences', 'geofence_logs', 'call_signals', 'profiles'];
        
        for (const table of tables) {
            const { error } = await sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (error) console.warn(`Note: Could not clear ${table} (may be empty or restricted).`);
        }
        
        showToast("Database Wipe Successful! Please refresh.", "success", 5000);
        await sb.auth.signOut();
        setTimeout(() => location.reload(), 2000);
    } catch (err) {
        showToast("Error during wipe: " + err.message, "error");
    }
}

async function adminCreateUser() {
    const name  = $('newUserName').value.trim();
    const loginId = $('newUserEmail').value.trim();
    let pass    = $('newUserPass').value.trim();
    
    if (!name || !loginId) { showToast("Name and ID required.", "warn"); return; }
    if (!pass) pass = Math.random().toString(36).slice(-8);
    
    showToast("Saving user...", "info");
    
    try {
        const { data, error } = await sb.from('profiles').insert({
            name, 
            login_id: loginId, 
            password: pass, 
            role: 'standard'
        }).select().single();
        
        if (error) {
            if (error.message.includes('unique')) throw new Error("This Login ID is already taken.");
            throw error;
        }

        alert(`✅ User Created!\n\nName: ${name}\nLogin ID: ${loginId}\nPassword: ${pass}`);
        
        $('newUserName').value = ''; $('newUserEmail').value = ''; $('newUserPass').value = '';
        $('createUserForm').classList.add('hidden');
        loadAdminUsers();
    } catch (err) {
        showToast(err.message, "error");
    }
}



function adminTab(tab, btn) {
    ['adminUsers','adminGeofences','adminGroups'].forEach(id => {
        const el = $(id);
        if (el) el.classList.add('hidden');
    });
    const map = { users: 'adminUsers', geofences: 'adminGeofences', groups: 'adminGroups' };
    if ($(map[tab])) $(map[tab]).classList.remove('hidden');
    
    document.querySelectorAll('.tab-row .tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    if (tab === 'users')      loadAdminUsers();
    if (tab === 'geofences')  loadAdminGeofences();
    if (tab === 'groups')     loadAdminGroups();
}

async function loadAdminUsers() {
    const { data } = await sb.from('profiles').select('*');
    const tbody = $('usersTableBody');
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="muted">No users.</td></tr>'; return; }
    tbody.innerHTML = data.map(u => `
        <tr>
            <td>${u.name || '—'}</td>
            <td>${u.email}</td>
            <td>
                <select onchange="setRole('${u.id}', this.value)" style="border:none;background:transparent;font-family:Outfit,sans-serif;cursor:pointer;">
                    <option value="standard" ${u.role==='standard'?'selected':''}>Standard</option>
                    <option value="admin"    ${u.role==='admin'?'selected':''}>Admin</option>
                </select>
            </td>
            <td><button class="btn danger" style="padding:4px 10px;font-size:0.75rem;" onclick="deleteUser('${u.id}')">Delete</button></td>
        </tr>`).join('');
}

async function setRole(uid, role) {
    await sb.from('profiles').update({ role }).eq('id', uid);
    showToast('Role updated ✓', 'success');
}

async function deleteUser(uid) {
    if (!confirm('Delete this user?')) return;
    await sb.from('profiles').delete().eq('id', uid);
    showToast('User deleted.', 'warn');
    loadAdminUsers();
    delete peerProfiles[uid];
    renderContactList();
}

async function loadAdminGeofences() {
    const { data } = await sb.from('geofences').select('*');
    const list = $('geofencesList');
    if (!data || data.length === 0) { list.innerHTML = '<p class="muted">No zones yet.</p>'; return; }
    list.innerHTML = data.map(gf => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span><b>${gf.name}</b> — ${gf.lat.toFixed(4)}, ${gf.lng.toFixed(4)} (${gf.radius}m)</span>
            <button class="btn danger" style="padding:4px 10px;font-size:0.75rem;" onclick="deleteGeofence('${gf.id}')">×</button>
        </div>`).join('');
}

async function addGeofence() {
    const name = $('gfName').value.trim(), lat = parseFloat($('gfLat').value),
          lng  = parseFloat($('gfLng').value), radius = parseFloat($('gfRadius').value);
    if (!name || isNaN(lat) || isNaN(lng) || isNaN(radius)) { showToast('Fill all zone fields.', 'error'); return; }
    await sb.from('geofences').insert({ name, lat, lng, radius, created_by: currentUser.id });
    showToast(`Zone "${name}" added ✓`, 'success');
    [$('gfName'),$('gfLat'),$('gfLng'),$('gfRadius')].forEach(f => f.value = '');
    loadAdminGeofences();
    await loadGeofences();
}

async function deleteGeofence(id) {
    await sb.from('geofences').delete().eq('id', id);
    showToast('Zone removed.', 'warn');
    loadAdminGeofences();
    await loadGeofences();
}

async function loadAdminGroups() {
    const { data } = await sb.from('groups').select('*');
    const list = $('groupsList');
    if (!data || data.length === 0) { list.innerHTML = '<p class="muted">No groups yet.</p>'; return; }
    list.innerHTML = data.map(g => `
        <div style="padding:6px 0;border-bottom:1px solid #f1f5f9;"><b>${g.name}</b></div>`).join('');
}

async function createGroup() {
    const name = $('grpName').value.trim();
    if (!name) return;
    await sb.from('groups').insert({ name, created_by: currentUser.id });
    $('grpName').value = '';
    showToast(`Group "${name}" created ✓`, 'success');
    loadAdminGroups();
}

// ─── EVENT WIRING ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    bootApp();

    $('toggleBtn').addEventListener('click', toggleTracking);
    $('logoutBtn').addEventListener('click', logout);
    $('adminBtn').addEventListener('click', openAdmin);
    $('sosBtn').addEventListener('click', sendSOS);

    $('voiceCallBtn').addEventListener('click', () => activeChatUID && startCall(activeChatUID, false));
    $('videoCallBtn').addEventListener('click', () => activeChatUID && startCall(activeChatUID, true));
    $('muteMicBtn').addEventListener('click',  toggleMic);
    $('toggleCamBtn').addEventListener('click', toggleCamera);
    $('endCallBtn').addEventListener('click',   () => endCall(true));

    $('sendBtn').addEventListener('click', sendMessage);
    $('msgInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

    // Tip: click map at current pos to add geofence lat/lng in admin
    map.on('click', (e) => {
        if (!$('adminOverlay').classList.contains('hidden')) {
            $('gfLat').value = e.latlng.lat.toFixed(6);
            $('gfLng').value = e.latlng.lng.toFixed(6);
            showToast('📍 Coordinates captured from map click!', 'success');
        }
    });
});
