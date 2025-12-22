import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { io } from "socket.io-client";

console.log("Main.js geladen (Animation Update)");

// --- KONFIGURATION ---
const TIME_STEP = 1 / 60;
const SPRINT_SPEED = 25;
const WALK_SPEED = 15;
const JUMP_FORCE = 12;
const PLAYER_RADIUS = 0.8;
const KILL_Z = -15;
const MAX_AMMO = 30;
const MAX_HEALTH = 100;
const DAMAGE_BODY = 15;
const DAMAGE_HEAD = 40;

// Manuelle Skalierung (User Wunsch: 0.45)
const SOLDIER_SCALE_FIX = 0.45;

const WEAPON_HIP_POS = new THREE.Vector3(0.4, -0.4, -0.8);
const WEAPON_ADS_POS = new THREE.Vector3(0, -0.25, -0.6);
const FOV_NORMAL = 75;
const FOV_ADS = 40;

// --- GLOBALE VARIABLEN ---
let scene, camera, renderer, world, playerBody, controls;
let weapon;
let particles = [];
let socket;
let myUserId = null;
let otherPlayers = {};
let isConnected = false;
let soldierTemplate = null;
let soldierAnimations = []; // Speicher für die Animationen

// Game State
let ammo = MAX_AMMO;
let currentHealth = MAX_HEALTH;
let myKills = 0;
let myDeaths = 0;
let myScore = 0;

let isReloading = false;
let isAiming = false;
let isDead = false;
let lastDamageTime = 0;

// UI Elemente
let uiAmmo, uiScore, uiHealth, uiReloadHint, crosshair, uiStatus, damageOverlay, scoreboard, deathScreen;

const moveState = { forward: false, backward: false, left: false, right: false, sprint: false };
let canJump = false;
const clock = new THREE.Clock();
let accumulator = 0;

const inputVector = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

let playerMaterial, groundMaterial;

// --- START SEQUENZ ---
try {
    initGame();
    initSocket();
    setupBlocker();
    loadSoldierModel();
} catch (error) {
    console.error("CRITICAL ERROR IN INIT:", error);
    alert("Fehler: " + error.message);
}

function loadSoldierModel() {
    const loader = new GLTFLoader();
    loader.load('./soldier.glb', (gltf) => {
        console.log("Soldier Model erfolgreich geladen!");
        const model = gltf.scene;
        soldierAnimations = gltf.animations; // Animationen speichern

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Materialien verbessern, falls sie zu dunkel sind
                if (child.material) {
                    child.material.side = THREE.FrontSide; // Performance
                }
            }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const height = size.y;
        
        if (height > 0) {
            const targetHeight = 1.8;
            let scaleFactor = targetHeight / height;
            scaleFactor *= SOLDIER_SCALE_FIX;
            model.scale.set(scaleFactor, scaleFactor, scaleFactor);
        }
        
        soldierTemplate = model;

        // Nachträgliches Update für bereits existierende Spieler
        for (let id in otherPlayers) {
            const p = otherPlayers[id];
            const fallback = p.mesh.getObjectByName("fallbackVisual");
            if (fallback) {
                p.mesh.remove(fallback);
                addSoldierVisualToPlayer(p);
            }
        }
        
    }, undefined, (error) => {
        console.error("Fehler beim Laden des Soldier Models:", error);
    });
}

function addSoldierVisualToPlayer(playerObj) {
    if (!soldierTemplate) return;

    const visual = SkeletonUtils.clone(soldierTemplate);
    visual.rotation.y = Math.PI;
    playerObj.mesh.add(visual);

    // Animation Mixer erstellen
    if (soldierAnimations.length > 0) {
        playerObj.mixer = new THREE.AnimationMixer(visual);
        // Wir nehmen einfach die erste Animation (oft "Run" oder "Idle")
        // Falls du spezifische Namen hast, kannst du hier filtern
        const clip = soldierAnimations[0];
        const action = playerObj.mixer.clipAction(clip);
        action.play();
        console.log("Spiele Animation:", clip.name);
    }
}

function setupBlocker() {
    const blocker = document.getElementById('blocker');
    if(!blocker) return;
    const statusText = blocker.querySelector('div:last-child');
    if(statusText) statusText.innerText = "(Bereit zum Starten)";
    blocker.addEventListener('click', () => {
        if (isDead) return;
        if (controls) {
            controls.lock();
            blocker.style.display = 'none';
        }
    });
}

function initSocket() {
    console.log("Verbinde Socket...");
    socket = io(window.location.origin);

    socket.on('connect', () => {
        console.log("Verbunden! ID:", socket.id);
        isConnected = true;
        myUserId = socket.id;
        if(uiStatus) { uiStatus.innerText = "ONLINE"; uiStatus.style.color = "#00ff00"; }
    });

    socket.on('connect_error', (err) => {
        if(uiStatus) { uiStatus.innerText = "OFFLINE"; uiStatus.style.color = "red"; }
    });

    socket.on('init', (data) => {
        myUserId = data.id;
        for (let id in data.players) {
            if (id !== myUserId) createOtherPlayer(id, data.players[id]);
        }
        updateScoreboard(data.players);
    });

    socket.on('playerJoined', (data) => createOtherPlayer(data.id, data));
    socket.on('playerLeft', (id) => removeOtherPlayer(id));

    socket.on('updatePositions', (data) => {
        for (let id in data) {
            if (otherPlayers[id]) {
                otherPlayers[id].targetPos.set(data[id].x, data[id].y - 0.9, data[id].z);
                otherPlayers[id].targetRotY = data[id].qy;
            }
        }
    });

    socket.on('playerHit', (data) => {
        if (data.id === myUserId) {
            currentHealth = data.health;
            lastDamageTime = Date.now();
            takeDamageEffect();
            updateUI();
        } else if (otherPlayers[data.id]) {
            updateEnemyHealthBar(data.id, data.health);
        }
    });

    socket.on('playerDied', (data) => {
        updateScoreboard(data.players);
        if (data.players[myUserId]) {
            myKills = data.players[myUserId].kills;
            myScore = data.players[myUserId].score;
            myDeaths = data.players[myUserId].deaths;
            updateUI();
        }
        if (data.victimId === myUserId) die();
        else if (otherPlayers[data.victimId]) {
            createExplosion(otherPlayers[data.victimId].mesh.position, 0xff0000);
            otherPlayers[data.victimId].mesh.visible = false;
        }
    });

    socket.on('playerRespawned', (data) => {
        if (data.id !== myUserId && otherPlayers[data.id]) {
            const p = otherPlayers[data.id];
            p.mesh.visible = true;
            updateEnemyHealthBar(data.id, MAX_HEALTH);
            p.mesh.position.set(data.x, data.y - 0.9, data.z);
            p.targetPos.set(data.x, data.y - 0.9, data.z);
        }
    });
}

function initGame() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(FOV_NORMAL, window.innerWidth / window.innerHeight, 0.1, 10000);
    scene.add(camera);

    createWeapon();
    createUI();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Heller
    scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2); // Heller
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    world = new CANNON.World();
    world.gravity.set(0, -30, 0);

    groundMaterial = new CANNON.Material('ground');
    playerMaterial = new CANNON.Material('player');
    const physicsContact = new CANNON.ContactMaterial(groundMaterial, playerMaterial, {
        friction: 0.0,
        restitution: 0.0
    });
    world.addContactMaterial(physicsContact);

    const playerShape = new CANNON.Sphere(PLAYER_RADIUS);
    playerBody = new CANNON.Body({
        mass: 5,
        shape: playerShape,
        material: playerMaterial,
        linearDamping: 0.9,
        angularDamping: 1.0,
        fixedRotation: true
    });
    playerBody.position.set(0, 5, 0);
    world.addBody(playerBody);

    playerBody.addEventListener('collide', (e) => {
        const contactNormal = new CANNON.Vec3();
        e.contact.ni.negate(contactNormal);
        if (contactNormal.y > 0.5) canJump = true;
    });

    controls = new PointerLockControls(camera, document.body);
    
    controls.addEventListener('unlock', () => {
        if (!isDead) document.getElementById('blocker').style.display = 'flex';
    });
    
    document.addEventListener('mousedown', (event) => {
        if (isDead) return;
        if (controls.isLocked) {
            if (event.button === 0) shoot();
            else if (event.button === 2) isAiming = true;
        }
    });

    document.addEventListener('mouseup', (event) => {
        if (event.button === 2) isAiming = false;
    });

    document.addEventListener('contextmenu', (event) => event.preventDefault());

    loadCustomMap('./map.glb');
    
    setupInputs();
    window.addEventListener('resize', onWindowResize);
    
    updateUI();
    animate();
}

function createWeapon() {
    weapon = new THREE.Group();

    const geometry = new THREE.BoxGeometry(0.15, 0.15, 0.6);
    const material = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    weapon.add(mesh);

    const handleGeo = new THREE.BoxGeometry(0.12, 0.2, 0.15);
    const handleMesh = new THREE.Mesh(handleGeo, material);
    handleMesh.position.set(0, -0.15, 0.1);
    handleMesh.rotation.x = Math.PI / 8;
    weapon.add(handleMesh);

    const sightGeo = new THREE.BoxGeometry(0.04, 0.04, 0.1);
    const sightMesh = new THREE.Mesh(sightGeo, new THREE.MeshBasicMaterial({color: 0x00ff00}));
    sightMesh.position.set(0, 0.08, 0.2);
    weapon.add(sightMesh);

    weapon.position.copy(WEAPON_HIP_POS);
    camera.add(weapon);
}

function die() {
    if (isDead) return;
    isDead = true;
    controls.unlock();
    if(deathScreen) deathScreen.style.display = 'flex';
    if(weapon) weapon.visible = false;
}

function revive() {
    if (!isDead) return;
    socket.emit('respawn');
    respawnPlayerPhysics();
    isDead = false;
    currentHealth = MAX_HEALTH;
    if(deathScreen) deathScreen.style.display = 'none';
    if(weapon) weapon.visible = true;
    controls.lock();
    updateUI();
}

function respawnPlayerPhysics() {
    playerBody.position.set(0, 5, 0);
    playerBody.velocity.set(0, 0, 0);
    playerBody.angularVelocity.set(0, 0, 0);
    ammo = MAX_AMMO;
    isReloading = false;
}

function shoot() {
    if (isDead || isReloading || ammo <= 0) return;
    ammo--;
    updateUI();
    applyRecoil();

    raycaster.setFromCamera(center, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        let hitObj = hit.object;

        if (hitObj.userData.isHead || hitObj.userData.isBody) {
             const targetId = hitObj.userData.id;
             const isHeadshot = hitObj.userData.isHead;
             createExplosion(hit.point, isHeadshot ? 0xffff00 : 0xff0000);
             const dmg = isHeadshot ? DAMAGE_HEAD : DAMAGE_BODY;
             socket.emit('shoot', { targetId: targetId, damage: dmg });
             break;
        }
        if (hitObj.parent && hitObj.parent.userData && hitObj.parent.userData.isPlayerGroup) {
             const targetId = hitObj.parent.userData.id;
             createExplosion(hit.point, 0xff0000);
             socket.emit('shoot', { targetId: targetId, damage: DAMAGE_BODY });
             break;
        }
        if (hit.object.name !== 'bulletHole') {
            createHitMarker(hit.point, hit.face.normal);
            break;
        }
    }
}

function createUI() {
    const hudContainer = document.createElement('div');
    hudContainer.style.position = 'absolute';
    hudContainer.style.width = '100%'; hudContainer.style.height = '100%';
    hudContainer.style.top = '0'; hudContainer.style.left = '0';
    hudContainer.style.pointerEvents = 'none'; hudContainer.style.userSelect = 'none';
    hudContainer.style.fontFamily = 'Arial, sans-serif'; hudContainer.style.textShadow = '1px 1px 2px black';
    document.body.appendChild(hudContainer);

    damageOverlay = document.createElement('div');
    damageOverlay.style.position = 'absolute';
    damageOverlay.style.top = '0'; damageOverlay.style.left = '0';
    damageOverlay.style.width = '100%'; damageOverlay.style.height = '100%';
    damageOverlay.style.backgroundColor = 'red'; damageOverlay.style.opacity = '0';
    damageOverlay.style.transition = 'opacity 0.1s';
    hudContainer.appendChild(damageOverlay);
    
    deathScreen = document.createElement('div');
    deathScreen.style.position = 'absolute';
    deathScreen.style.top = '0'; deathScreen.style.left = '0';
    deathScreen.style.width = '100%'; deathScreen.style.height = '100%';
    deathScreen.style.backgroundColor = 'rgba(0,0,0,0.8)';
    deathScreen.style.display = 'none';
    deathScreen.style.flexDirection = 'column';
    deathScreen.style.justifyContent = 'center';
    deathScreen.style.alignItems = 'center';
    deathScreen.style.pointerEvents = 'auto';
    hudContainer.appendChild(deathScreen);

    const deathTitle = document.createElement('h1');
    deathTitle.innerText = "YOU DIED";
    deathTitle.style.color = 'red'; deathTitle.style.fontSize = '80px';
    deathScreen.appendChild(deathTitle);

    const respawnBtn = document.createElement('button');
    respawnBtn.innerText = "RESPAWN";
    respawnBtn.style.padding = '20px 40px'; respawnBtn.style.fontSize = '30px';
    respawnBtn.style.cursor = 'pointer'; respawnBtn.style.backgroundColor = '#333';
    respawnBtn.style.color = 'white'; respawnBtn.style.border = '2px solid white';
    respawnBtn.onclick = () => revive();
    deathScreen.appendChild(respawnBtn);

    uiScore = document.createElement('div');
    uiScore.style.position = 'absolute'; uiScore.style.top = '20px'; uiScore.style.left = '50%';
    uiScore.style.transform = 'translateX(-50%)'; uiScore.style.fontSize = '32px'; uiScore.style.color = 'white';
    uiScore.innerText = 'SCORE: 0';
    hudContainer.appendChild(uiScore);

    uiStatus = document.createElement('div');
    uiStatus.style.position = 'absolute'; uiStatus.style.top = '20px'; uiStatus.style.right = '20px';
    uiStatus.style.fontSize = '16px'; uiStatus.innerText = 'CONNECTING...'; uiStatus.style.color = 'gray';
    hudContainer.appendChild(uiStatus);

    const statsContainer = document.createElement('div');
    statsContainer.style.position = 'absolute'; statsContainer.style.bottom = '30px';
    statsContainer.style.right = '40px'; statsContainer.style.textAlign = 'right';
    hudContainer.appendChild(statsContainer);

    uiAmmo = document.createElement('div');
    uiAmmo.style.fontSize = '48px'; uiAmmo.style.color = 'white'; uiAmmo.style.fontWeight = 'bold';
    uiAmmo.innerText = '30 / 30';
    statsContainer.appendChild(uiAmmo);

    uiHealth = document.createElement('div');
    uiHealth.style.fontSize = '32px'; uiHealth.style.color = '#00ff00'; uiHealth.style.fontWeight = 'bold';
    uiHealth.innerText = 'HP: 100';
    statsContainer.appendChild(uiHealth);

    uiReloadHint = document.createElement('div');
    uiReloadHint.style.position = 'absolute'; uiReloadHint.style.top = '60%'; uiReloadHint.style.left = '50%';
    uiReloadHint.style.transform = 'translate(-50%, -50%)'; uiReloadHint.style.fontSize = '24px';
    uiReloadHint.style.color = '#ff4444'; uiReloadHint.style.display = 'none';
    uiReloadHint.innerText = 'PRESS R TO RELOAD';
    hudContainer.appendChild(uiReloadHint);

    crosshair = document.createElement('div');
    crosshair.style.position = 'absolute'; crosshair.style.top = '50%'; crosshair.style.left = '50%';
    crosshair.style.width = '8px'; crosshair.style.height = '8px';
    crosshair.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    crosshair.style.borderRadius = '50%'; crosshair.style.transform = 'translate(-50%, -50%)';
    crosshair.style.border = '1px solid black'; crosshair.style.transition = 'opacity 0.2s';
    hudContainer.appendChild(crosshair);

    scoreboard = document.createElement('div');
    scoreboard.style.position = 'absolute'; scoreboard.style.top = '50%'; scoreboard.style.left = '50%';
    scoreboard.style.transform = 'translate(-50%, -50%)';
    scoreboard.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    scoreboard.style.padding = '20px'; scoreboard.style.borderRadius = '10px';
    scoreboard.style.color = 'white'; scoreboard.style.display = 'none';
    scoreboard.style.minWidth = '400px';
    scoreboard.innerHTML = '<h3>LEADERBOARD</h3><table style="width:100%"><tr><th>Player</th><th>Kills</th><th>Deaths</th><th>Score</th></tr></table>';
    hudContainer.appendChild(scoreboard);
}

function updateScoreboard(playersData) {
    if (!scoreboard) return;
    const sorted = [];
    for(let id in playersData) {
        sorted.push({ id: id, ...playersData[id], isMe: id === myUserId });
    }
    sorted.sort((a, b) => b.score - a.score);
    let html = '<h3 style="text-align:center; border-bottom:1px solid #444; padding-bottom:10px;">LEADERBOARD (Hold TAB)</h3><table style="width:100%; text-align:center;"><tr><th>Player</th><th>Kills</th><th>Deaths</th><th>Score</th></tr>';
    sorted.forEach(p => {
        const color = p.isMe ? '#00ff00' : 'white';
        const name = p.isMe ? 'YOU' : p.id.substring(0, 6);
        html += `<tr style="color:${color}"><td>${name}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.score}</td></tr>`;
    });
    html += '</table>';
    scoreboard.innerHTML = html;
}

function updateUI() {
    if(uiScore) uiScore.innerText = `SCORE: ${myScore}`;
    if(uiAmmo) uiAmmo.innerText = `${ammo} / ${MAX_AMMO}`;
    if(uiHealth) {
        uiHealth.innerText = `HP: ${Math.max(0, Math.floor(currentHealth))}`;
        if (currentHealth > 50) uiHealth.style.color = '#00ff00';
        else if (currentHealth > 25) uiHealth.style.color = '#ffff00';
        else uiHealth.style.color = '#ff0000';
    }
    if (ammo <= 0 && !isReloading) {
        if(uiReloadHint) uiReloadHint.style.display = 'block';
        if(uiAmmo) uiAmmo.style.color = 'red';
    } else {
        if(uiReloadHint) uiReloadHint.style.display = 'none';
        if(uiAmmo) uiAmmo.style.color = 'white';
    }
    if(crosshair) crosshair.style.opacity = isAiming ? '0' : '1';
}

function takeDamageEffect() {
    if (damageOverlay) {
        damageOverlay.style.opacity = '0.4';
        setTimeout(() => damageOverlay.style.opacity = '0', 200);
    }
}

function createHitMarker(position, normal) {
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const material = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    if (normal) marker.position.add(normal.clone().multiplyScalar(0.02));
    scene.add(marker);
    setTimeout(() => { scene.remove(marker); geometry.dispose(); material.dispose(); }, 2000);
}

function applyRecoil() {
    if (!weapon) return;
    const recoilAmount = isAiming ? 0.1 : 0.25;
    weapon.position.z += recoilAmount;
    weapon.position.y += recoilAmount * 0.2;
    weapon.rotation.x += recoilAmount * 0.5;
}

function reloadWeapon() {
    if (isReloading || ammo === MAX_AMMO) return;
    isReloading = true;
    updateUI();
    setTimeout(() => {
        ammo = MAX_AMMO;
        isReloading = false;
        updateUI();
    }, 1500);
}

function updateWeaponAnimation(deltaTime, time) {
    if (!weapon || isDead) return;
    const targetPos = isAiming ? WEAPON_ADS_POS.clone() : WEAPON_HIP_POS.clone();
    const isMoving = (moveState.forward || moveState.backward || moveState.left || moveState.right) && canJump;
    if (isMoving) {
        const bobSpeed = moveState.sprint ? 18 : 10;
        const bobAmount = isAiming ? 0.005 : 0.03;
        targetPos.y += Math.sin(time * bobSpeed) * bobAmount;
        targetPos.x += Math.cos(time * bobSpeed) * bobAmount * 0.5;
    }
    if (isReloading) {
        weapon.rotation.x -= 10 * deltaTime;
        targetPos.y = -0.8;
    } else {
        const recoverySpeed = 10 * deltaTime;
        weapon.rotation.x = THREE.MathUtils.lerp(weapon.rotation.x, 0, recoverySpeed);
    }
    const moveSpeed = isAiming ? 20 * deltaTime : 10 * deltaTime;
    weapon.position.lerp(targetPos, moveSpeed);
    const targetFov = isAiming ? FOV_ADS : FOV_NORMAL;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 15 * deltaTime);
    camera.updateProjectionMatrix();
}

function createExplosion(position, color) {
    const particleCount = 12;
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const material = new THREE.MeshBasicMaterial({ color: color });
    for (let i = 0; i < particleCount; i++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.position.x += (Math.random() - 0.5) * 0.5;
        mesh.position.y += (Math.random() - 0.5) * 0.5;
        mesh.position.z += (Math.random() - 0.5) * 0.5;
        const velocity = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() * 5) + 2, (Math.random() - 0.5) * 8);
        scene.add(mesh);
        particles.push({ mesh, velocity, life: 1.0 });
    }
}

function updateParticles(deltaTime) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= deltaTime;
        p.velocity.y -= 15 * deltaTime;
        p.mesh.position.add(p.velocity.clone().multiplyScalar(deltaTime));
        p.mesh.rotation.x += p.velocity.z * deltaTime;
        p.mesh.rotation.y += p.velocity.x * deltaTime;
        const scale = p.life;
        p.mesh.scale.set(scale, scale, scale);
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
}

function createOtherPlayer(pid, data) {
    if (otherPlayers[pid]) return;
    const group = new THREE.Group();

    // 1. UNSICHTBARE HITBOXES
    const matHitbox = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0,
        depthWrite: false
    });
    
    // Body Hitbox
    const bodyGeo = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
    const bodyMesh = new THREE.Mesh(bodyGeo, matHitbox);
    bodyMesh.position.y = 0.9;
    bodyMesh.userData = { isPlayer: true, id: pid, isBody: true };
    group.add(bodyMesh);

    // Head Hitbox
    const headGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const headMesh = new THREE.Mesh(headGeo, matHitbox);
    headMesh.position.y = 1.65;
    headMesh.userData = { isPlayer: true, id: pid, isHead: true };
    group.add(headMesh);

    // 2. VISUELLES MODELL (Soldier oder Fallback)
    if (soldierTemplate) {
        addSoldierVisualToPlayer({ mesh: group });
    } else {
        const fallbackGeo = new THREE.BoxGeometry(0.5, 1.8, 0.5);
        const fallbackMat = new THREE.MeshStandardMaterial({color: 0x00ff00});
        const fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
        fallback.position.y = 0.9;
        fallback.name = "fallbackVisual";
        group.add(fallback);
    }

    // Waffe
    const gunGeo = new THREE.BoxGeometry(0.1, 0.1, 0.6);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.2, 1.4, 0.4);
    group.add(gun);

    // HP Bar
    const hpGroup = new THREE.Group();
    hpGroup.position.set(0, 2.0, 0);
    group.add(hpGroup);
    const hpBgGeo = new THREE.PlaneGeometry(1, 0.1);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const hpBg = new THREE.Mesh(hpBgGeo, hpBgMat);
    hpGroup.add(hpBg);
    const hpFgGeo = new THREE.PlaneGeometry(1, 0.1);
    hpFgGeo.translate(0.5, 0, 0);
    const hpFgMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const hpFg = new THREE.Mesh(hpFgGeo, hpFgMat);
    hpFg.position.x = -0.5; hpFg.position.z = 0.01; hpFg.name = "hpBar";
    hpGroup.add(hpFg);
    
    group.userData = { isPlayerGroup: true, id: pid };
    if (data.x !== undefined) {
        group.position.set(data.x, data.y - 0.9, data.z);
        group.rotation.y = data.qy || 0;
    }
    if (data.isDead) group.visible = false;
    scene.add(group);
    otherPlayers[pid] = {
        mesh: group, hpGroup: hpGroup, hpBar: hpFg,
        targetPos: group.position.clone(), targetRotY: 0,
        mixer: null // Platzhalter für Animation Mixer
    };
    updateEnemyHealthBar(pid, data.health || 100);
}

function updateEnemyHealthBar(pid, health) {
    if (!otherPlayers[pid]) return;
    const p = otherPlayers[pid];
    const healthPercent = Math.max(0, health / MAX_HEALTH);
    p.hpBar.scale.x = healthPercent;
    if(healthPercent > 0.5) p.hpBar.material.color.setHex(0x00ff00);
    else if(healthPercent > 0.25) p.hpBar.material.color.setHex(0xffff00);
    else p.hpBar.material.color.setHex(0xff0000);
}

function removeOtherPlayer(pid) {
    if (otherPlayers[pid]) {
        createExplosion(otherPlayers[pid].mesh.position, 0xff0000);
        scene.remove(otherPlayers[pid].mesh);
        delete otherPlayers[pid];
    }
}

function loadCustomMap(url) {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (!child.name.toLowerCase().includes('visual')) {
                    const worldScale = new THREE.Vector3();
                    child.getWorldScale(worldScale);
                    child.geometry.computeBoundingBox();
                    const box = child.geometry.boundingBox;
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    const worldPos = new THREE.Vector3();
                    child.getWorldPosition(worldPos);
                    const worldQuat = new THREE.Quaternion();
                    child.getWorldQuaternion(worldQuat);
                    const halfExtents = new CANNON.Vec3((size.x * Math.abs(worldScale.x)) / 2, (size.y * Math.abs(worldScale.y)) / 2, (size.z * Math.abs(worldScale.z)) / 2);
                    const shape = new CANNON.Box(halfExtents);
                    const body = new CANNON.Body({ mass: 0, material: groundMaterial });
                    body.position.copy(worldPos);
                    body.quaternion.copy(worldQuat);
                    body.addShape(shape);
                    world.addBody(body);
                }
            }
        });
        scene.add(gltf.scene);
    }, undefined, (error) => {
        console.error('Fehler beim Laden der Map:', error);
    });
}

function setupInputs() {
    document.addEventListener('keydown', (event) => {
        if (isDead && event.code !== 'Space') return;
        switch (event.code) {
            case 'KeyW': moveState.forward = true; break;
            case 'KeyS': moveState.backward = true; break;
            case 'KeyA': moveState.left = true; break;
            case 'KeyD': moveState.right = true; break;
            case 'ShiftLeft': moveState.sprint = true; break;
            case 'KeyR': reloadWeapon(); break;
            case 'Space':
                if (isDead) revive();
                else if (canJump) { playerBody.velocity.y = JUMP_FORCE; canJump = false; }
                break;
            case 'KeyP': respawnPlayerPhysics(); break;
            case 'Tab':
                if(scoreboard) scoreboard.style.display = 'block';
                event.preventDefault();
                break;
        }
    });
    document.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'KeyW': moveState.forward = false; break;
            case 'KeyS': moveState.backward = false; break;
            case 'KeyA': moveState.left = false; break;
            case 'KeyD': moveState.right = false; break;
            case 'ShiftLeft': moveState.sprint = false; break;
            case 'Tab':
                if(scoreboard) scoreboard.style.display = 'none';
                break;
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    accumulator += deltaTime;

    updateWeaponAnimation(deltaTime, clock.getElapsedTime());
    updateParticles(deltaTime);
    
    if (isConnected && playerBody && !isDead) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const angle = Math.atan2(dir.x, dir.z);
        socket.emit('updatePosition', {
            x: playerBody.position.x,
            y: playerBody.position.y,
            z: playerBody.position.z,
            qy: angle
        });
    }

    Object.values(otherPlayers).forEach(p => {
        p.mesh.position.lerp(p.targetPos, 10 * deltaTime);
        p.mesh.rotation.y = THREE.MathUtils.lerp(p.mesh.rotation.y, p.targetRotY, 10 * deltaTime);
        if (p.hpGroup) p.hpGroup.quaternion.copy(camera.quaternion);
        
        // Animation Mixer Update
        if (p.mixer) {
            p.mixer.update(deltaTime);
        }
    });

    while (accumulator >= TIME_STEP) {
        if (controls && controls.isLocked) {
            inputVector.set(0, 0, 0);
            camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();
            right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
            if (moveState.forward) inputVector.add(forward);
            if (moveState.backward) inputVector.sub(forward);
            if (moveState.right) inputVector.add(right);
            if (moveState.left) inputVector.sub(right);
            const currentSpeed = moveState.sprint ? SPRINT_SPEED : WALK_SPEED;
            if (inputVector.length() > 0) {
                inputVector.normalize().multiplyScalar(currentSpeed);
                playerBody.velocity.x = inputVector.x;
                playerBody.velocity.z = inputVector.z;
            } else {
                playerBody.velocity.x *= 0.8;
                playerBody.velocity.z *= 0.8;
            }
        }
        if (playerBody && playerBody.position.y < KILL_Z) {
            respawnPlayerPhysics();
        }
        world.step(TIME_STEP);
        accumulator -= TIME_STEP;
    }
    camera.position.copy(playerBody.position);
    camera.position.y += 0.6;
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
