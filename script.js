// --- CONFIGURATION ---
const SUPABASE_URL = 'https://ugspkzccuifbqktdkxhb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XOS9IqSAeMhVE_InL_z2jg_19Zr-qJP';

// Initialize Supabase
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- APP STATE ---
let user = null;
let isTracking = false;
let watchId = null;
let map, myMarker;
let markers = {}; // Other users' markers

// --- MAP INITIALIZATION ---
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 13);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
}

// --- AUTH LOGIC ---
async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        user = session.user;
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('userName').innerText = user.email.split('@')[0];
        fetchProfiles();
        subscribeToLocations();
    } else {
        document.getElementById('authModal').style.display = 'flex';
    }
}

async function handleAuth() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
        // Try sign up if login fails
        const { data: sData, error: sError } = await supabase.auth.signUp({ email, password });
        if (sError) alert(sError.message);
        else alert('Check your email for verification!');
    } else {
        location.reload();
    }
}

// --- TRACKING LOGIC ---
function toggleTracking() {
    if (isTracking) {
        stopTracking();
    } else {
        startTracking();
    }
}

function startTracking() {
    if (!("geolocation" in navigator)) return alert("Geolocation not supported");

    isTracking = true;
    updateUI(true);

    watchId = navigator.geolocation.watchPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        
        // Update Marker
        if (!myMarker) {
            myMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("You").openPopup();
        } else {
            myMarker.setLatLng([latitude, longitude]);
        }
        map.panTo([latitude, longitude]);

        // Save to Supabase
        await supabase.from('locations').insert({
            user_id: user.id,
            lat: latitude,
            lng: longitude
        });

        // Update profile status
        await supabase.from('profiles').update({ status: 'online' }).eq('id', user.id);
        
    }, (err) => console.error(err), { enableHighAccuracy: true });
}

async function stopTracking() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    isTracking = false;
    updateUI(false);
    await supabase.from('profiles').update({ status: 'offline' }).eq('id', user.id);
}

function updateUI(online) {
    const btn = document.getElementById('toggleBtn');
    const status = document.getElementById('userStatus');
    
    if (online) {
        btn.innerHTML = '<i data-lucide="power"></i> <span>Go Offline</span>';
        btn.classList.add('danger');
        status.innerText = 'Online';
        status.classList.remove('offline');
        status.classList.add('online');
    } else {
        btn.innerHTML = '<i data-lucide="power"></i> <span>Go Online</span>';
        btn.classList.remove('danger');
        status.innerText = 'Offline';
        status.classList.remove('online');
        status.classList.add('offline');
    }
    lucide.createIcons();
}

// --- REALTIME ---
function subscribeToLocations() {
    supabase.channel('public:locations')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'locations' }, (payload) => {
            const loc = payload.new;
            if (loc.user_id === user.id) return;
            
            if (!markers[loc.user_id]) {
                markers[loc.user_id] = L.marker([loc.lat, loc.lng]).addTo(map);
            } else {
                markers[loc.user_id].setLatLng([loc.lat, loc.lng]);
            }
        })
        .subscribe();
}

async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('*').neq('id', user.id);
    // You could list these in a UI element
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    checkUser();
    document.getElementById('authBtn').addEventListener('click', handleAuth);
    document.getElementById('toggleBtn').addEventListener('click', toggleTracking);
});
