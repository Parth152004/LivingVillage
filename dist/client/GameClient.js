import { Application } from 'pixi.js';
import { SimClock } from '../core/SimClock.js';
import { Camera } from './Camera.js';
import { TilemapRenderer } from './TilemapRenderer.js';
import { EntityRenderer } from './EntityRenderer.js';
import { InputController } from './InputController.js';
import { GameplayUI, checkBedProximity, resolveClosestInteractableEntity } from './GameplayUI.js';
import { SaveManager } from '../persistence/SaveManager.js';
import { createDefaultStorageDriver } from '../persistence/StorageDriver.js';
import { TILE_FLAGS } from '../world/ChunkGrid.js';
export class GameClient {
    sim;
    app;
    camera;
    input;
    ui;
    tilemapRenderer;
    entityRenderer;
    storage;
    accumulator = 0;
    isRunning = false;
    lastFrameTime = 0;
    fps = 60;
    frameCount = 0;
    fpsTimer = 0;
    hudElement;
    isSleepCommandPending = false;
    constructor(sim, options) {
        this.sim = sim;
        this.app = new Application();
        this.camera = new Camera(options.width ?? 800, options.height ?? 600);
        this.input = new InputController(this.sim);
        this.ui = new GameplayUI();
        this.tilemapRenderer = new TilemapRenderer();
        this.entityRenderer = new EntityRenderer();
        this.storage = options.storage ?? createDefaultStorageDriver();
        this.hudElement = options.hudElement;
    }
    async init(options) {
        const width = options.width ?? 800;
        const height = options.height ?? 600;
        await this.app.init({
            width,
            height,
            backgroundColor: 0x1c2b18, // Deep forest backdrop
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true
        });
        // Mount canvas into DOM
        options.containerElement.appendChild(this.app.canvas);
        // Add renderer scene layers
        this.app.stage.addChild(this.tilemapRenderer.container);
        this.app.stage.addChild(this.entityRenderer.container);
        // Setup input controller callbacks
        this.input.setCallbacks({
            onQuickSave: () => this.quickSave(),
            onQuickLoad: () => this.quickLoad(),
            onSelectSlot: (slot) => this.ui.selectSlot(slot),
            onContextAction: () => this.handleContextAction(),
            onConsumeAction: () => this.handleConsumeAction(),
            onToggleInventory: () => this.ui.toggleInventory(),
            onEscape: () => this.ui.closeAllModals(),
            onIsModalOpen: () => this.ui.isModalOpen
        });
        this.input.attach(window);
        // Setup UI callbacks
        this.ui.setCallbacks({
            onSleepTrigger: () => this.triggerSleep(),
            onContextAction: () => this.handleContextAction(),
            onShipItem: (itemId, quantity) => {
                const snap = this.sim.getRenderSnapshot(0.0);
                if (snap.shippingBinEntityId) {
                    this.sim.enqueueCommand('SHIP_ITEM', snap.playerEntityId, {
                        targetEntityId: snap.shippingBinEntityId,
                        itemId,
                        quantity,
                        payload: { itemId, quantity }
                    });
                }
            },
            onBuySeed: (seedItemId, quantity) => {
                const snap = this.sim.getRenderSnapshot(0.0);
                if (snap.seedCatalogEntityId) {
                    this.sim.enqueueCommand('BUY_SEED', snap.playerEntityId, {
                        targetEntityId: snap.seedCatalogEntityId,
                        seedItemId,
                        quantity,
                        payload: { seedItemId, quantity }
                    });
                }
            },
            onClaimQuest: (questId) => {
                const snap = this.sim.getRenderSnapshot(0.0);
                this.sim.enqueueCommand('CLAIM_QUEST', snap.playerEntityId, {
                    payload: { questId }
                });
            }
        });
        // Wire mobile touch joystick and action buttons
        this.ui.setupMobileControls(this.input, this);
        // Canvas click interaction for targeted player commands
        this.app.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        // Initial camera placement on player
        this.centerCameraOnPlayer(true);
    }
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }
    stop() {
        this.isRunning = false;
        this.input.detach(window);
    }
    loop(currentTime) {
        if (!this.isRunning)
            return;
        const deltaMs = Math.min(currentTime - this.lastFrameTime, 100); // Clamp spiral of death
        this.lastFrameTime = currentTime;
        const deltaSeconds = deltaMs / 1000.0;
        // 1. Calculate FPS
        this.frameCount++;
        this.fpsTimer += deltaMs;
        if (this.fpsTimer >= 500) {
            this.fps = Math.round((this.frameCount * 1000) / this.fpsTimer);
            this.frameCount = 0;
            this.fpsTimer = 0;
        }
        // 2. Poll input for continuous movement commands
        this.input.update();
        // 3. Authoritative tick accumulator (Fixed 20Hz / 50ms)
        this.accumulator += deltaSeconds;
        const stepInterval = SimClock.STEP_SECONDS;
        while (this.accumulator >= stepInterval) {
            this.sim.step();
            this.accumulator -= stepInterval;
        }
        // 4. Calculate sub-tick interpolation fraction for presentation
        const subTickAlpha = this.accumulator / stepInterval;
        // 5. Update presentation camera
        const snapshot = this.sim.getRenderSnapshot(subTickAlpha);
        const player = snapshot.entities.find(e => e.id === snapshot.playerEntityId);
        if (player) {
            this.camera.setTarget(player.x, player.y, false);
        }
        this.camera.update(deltaSeconds);
        // 6. Extract clean read-only snapshot & render
        this.tilemapRenderer.render(snapshot, this.camera);
        this.entityRenderer.render(snapshot, this.camera);
        // 7. Update Gameplay UI & HUD
        this.ui.update(snapshot);
        this.updateHUD(snapshot);
        requestAnimationFrame((t) => this.loop(t));
    }
    centerCameraOnPlayer(immediate) {
        if (this.sim.playerEntityId > 0) {
            const snapshot = this.sim.getRenderSnapshot(0.0);
            const player = snapshot.entities.find(e => e.id === snapshot.playerEntityId);
            if (player) {
                this.camera.setTarget(player.x, player.y, immediate);
            }
        }
    }
    handleCanvasClick(e) {
        if (this.ui.isSleeping || this.ui.isModalOpen)
            return;
        if (this.sim.isPaused) {
            this.ui.showFeedback('Simulation is paused', '#ffb74d');
            return;
        }
        const rect = this.app.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.camera.screenToWorld(screenX, screenY);
        const tileX = Math.floor(world.worldX);
        const tileY = Math.floor(world.worldY);
        const snapshot = this.sim.getRenderSnapshot(0.0);
        if (snapshot.playerEntityId === 0)
            return;
        const player = snapshot.entities.find(e => e.id === snapshot.playerEntityId);
        // 1. Direct clicks on interactable entities with reach validation (<= 1.5 tiles)
        const bed = snapshot.bedEntityId ? snapshot.entities.find(e => e.id === snapshot.bedEntityId) : null;
        if (bed && Math.floor(bed.x) === tileX && Math.floor(bed.y) === tileY) {
            if (player && Math.hypot(player.x - bed.x, player.y - bed.y) <= 1.5) {
                this.triggerSleep();
            }
            else {
                this.ui.showFeedback('Too far from bed', '#d32f2f');
            }
            return;
        }
        const shippingBin = snapshot.shippingBinEntityId ? snapshot.entities.find(e => e.id === snapshot.shippingBinEntityId) : null;
        if (shippingBin && Math.floor(shippingBin.x) === tileX && Math.floor(shippingBin.y) === tileY) {
            if (player && Math.hypot(player.x - shippingBin.x, player.y - shippingBin.y) <= 1.5) {
                this.ui.openShippingBin(snapshot);
            }
            else {
                this.ui.showFeedback('Too far from shipping bin', '#d32f2f');
            }
            return;
        }
        const seedCatalog = snapshot.seedCatalogEntityId ? snapshot.entities.find(e => e.id === snapshot.seedCatalogEntityId) : null;
        if (seedCatalog && Math.floor(seedCatalog.x) === tileX && Math.floor(seedCatalog.y) === tileY) {
            if (player && Math.hypot(player.x - seedCatalog.x, player.y - seedCatalog.y) <= 1.5) {
                this.ui.openSeedCatalog(snapshot);
            }
            else {
                this.ui.showFeedback('Too far from seed catalog', '#d32f2f');
            }
            return;
        }
        const animal = snapshot.entities.find(e => e.kind === 'animal' && Math.floor(e.x) === tileX && Math.floor(e.y) === tileY);
        if (animal) {
            if (player && Math.hypot(player.x - animal.x, player.y - animal.y) <= 2.0) {
                this.sim.enqueueCommand('PET_ANIMAL', snapshot.playerEntityId, { targetEntityId: animal.id });
            }
            else {
                this.ui.showFeedback('Too far from animal', '#d32f2f');
            }
            return;
        }
        const npc = snapshot.entities.find(e => e.kind === 'npc' && Math.floor(e.x) === tileX && Math.floor(e.y) === tileY);
        if (npc) {
            if (player && Math.hypot(player.x - npc.x, player.y - npc.y) <= 2.5) {
                this.sim.enqueueCommand('TALK_NPC', snapshot.playerEntityId, { targetEntityId: npc.id });
                const name = npc.name ?? 'Neighbor';
                const role = npc.npcRole ?? 'villager';
                const avatar = role === 'elder' ? '👴' : '👩‍🌾';
                const title = role === 'elder' ? 'Village Elder' : 'Town Merchant';
                const text = role === 'elder'
                    ? 'Welcome to Clover Valley! May your crops grow sweet and tall.'
                    : 'Need fresh seeds? Our stock is certified top-tier spring heirloom!';
                this.ui.openDialogue({ name, title, portraitIcon: avatar, text });
            }
            else {
                this.ui.showFeedback('Too far from neighbor', '#d32f2f');
            }
            return;
        }
        // 2. Translate selected hotbar item to authoritative command
        const selectedSlot = this.ui.selectedHotbarSlot;
        const item = snapshot.player?.inventory[selectedSlot] ?? null;
        if (item?.itemId === 'tool_hoe') {
            this.sim.enqueueCommand('TILL', snapshot.playerEntityId, { targetTileX: tileX, targetTileY: tileY });
        }
        else if (item?.itemId === 'tool_watering_can') {
            const chunkX = Math.floor(tileX / 32);
            const chunkY = Math.floor(tileY / 32);
            const localX = ((tileX % 32) + 32) % 32;
            const localY = ((tileY % 32) + 32) % 32;
            const chunk = snapshot.chunks.find(c => c.chunkX === chunkX && c.chunkY === chunkY);
            const targetTile = chunk?.tiles[localY * 32 + localX];
            const isWaterTile = targetTile ? (targetTile.flags & TILE_FLAGS.WATER) !== 0 : false;
            if (isWaterTile) {
                this.sim.enqueueCommand('REFILL_WATER', snapshot.playerEntityId, { targetTileX: tileX, targetTileY: tileY });
            }
            else {
                this.sim.enqueueCommand('WATER', snapshot.playerEntityId, { targetTileX: tileX, targetTileY: tileY });
            }
        }
        else if (item?.itemId && item.itemId.startsWith('seed_')) {
            this.sim.enqueueCommand('SOW', snapshot.playerEntityId, {
                targetTileX: tileX,
                targetTileY: tileY,
                payload: { seedItemId: item.itemId }
            });
        }
        else {
            // Empty hand or harvest
            this.sim.enqueueCommand('HARVEST', snapshot.playerEntityId, { targetTileX: tileX, targetTileY: tileY });
        }
    }
    handleContextAction() {
        if (this.ui.isSleeping)
            return;
        if (this.ui.isModalOpen) {
            this.ui.closeAllModals();
            return;
        }
        if (this.sim.isPaused) {
            this.ui.showFeedback('Simulation is paused', '#ffb74d');
            return;
        }
        const snapshot = this.sim.getRenderSnapshot(0.0);
        if (snapshot.playerEntityId === 0)
            return;
        const player = snapshot.entities.find(e => e.id === snapshot.playerEntityId);
        if (!player)
            return;
        // Check closest interactable within reach
        const closest = resolveClosestInteractableEntity(snapshot);
        if (closest) {
            if (closest.kind === 'bed') {
                this.triggerSleep();
                return;
            }
            else if (closest.kind === 'shipping_bin') {
                this.ui.openShippingBin(snapshot);
                return;
            }
            else if (closest.kind === 'seed_catalog') {
                this.ui.openSeedCatalog(snapshot);
                return;
            }
            else if (closest.kind === 'animal') {
                this.sim.enqueueCommand('PET_ANIMAL', snapshot.playerEntityId, { targetEntityId: closest.id });
                return;
            }
            else if (closest.kind === 'npc') {
                this.sim.enqueueCommand('TALK_NPC', snapshot.playerEntityId, { targetEntityId: closest.id });
                const npcEntity = snapshot.entities.find(e => e.id === closest.id);
                const name = npcEntity?.name ?? 'Neighbor';
                const role = npcEntity?.npcRole ?? 'villager';
                const avatar = role === 'elder' ? '👴' : '👩‍🌾';
                const title = role === 'elder' ? 'Village Elder' : 'Town Merchant';
                const text = role === 'elder'
                    ? 'Welcome to Clover Valley! May your crops grow sweet and tall.'
                    : 'Need fresh seeds? Our stock is certified top-tier spring heirloom!';
                this.ui.openDialogue({ name, title, portraitIcon: avatar, text });
                return;
            }
        }
        // Fallback: Farming action on tile player is standing on
        const targetTileX = Math.floor(player.x);
        const targetTileY = Math.floor(player.y);
        const selectedSlot = this.ui.selectedHotbarSlot;
        const item = snapshot.player?.inventory[selectedSlot] ?? null;
        if (item?.itemId === 'tool_hoe') {
            this.sim.enqueueCommand('TILL', snapshot.playerEntityId, { targetTileX, targetTileY });
        }
        else if (item?.itemId === 'tool_watering_can') {
            // Check if player is adjacent to any water tile within reach <= 1.5
            let refillTarget = null;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const checkX = targetTileX + dx;
                    const checkY = targetTileY + dy;
                    const dist = Math.hypot(player.x - (checkX + 0.5), player.y - (checkY + 0.5));
                    if (dist <= 1.5) {
                        const chunkX = Math.floor(checkX / 32);
                        const chunkY = Math.floor(checkY / 32);
                        const localX = ((checkX % 32) + 32) % 32;
                        const localY = ((checkY % 32) + 32) % 32;
                        const chunk = snapshot.chunks.find(c => c.chunkX === chunkX && c.chunkY === chunkY);
                        const checkTile = chunk?.tiles[localY * 32 + localX];
                        if (checkTile && (checkTile.flags & TILE_FLAGS.WATER) !== 0) {
                            refillTarget = { x: checkX, y: checkY };
                            break;
                        }
                    }
                }
                if (refillTarget)
                    break;
            }
            if (refillTarget) {
                this.sim.enqueueCommand('REFILL_WATER', snapshot.playerEntityId, { targetTileX: refillTarget.x, targetTileY: refillTarget.y });
            }
            else {
                this.sim.enqueueCommand('WATER', snapshot.playerEntityId, { targetTileX, targetTileY });
            }
        }
        else if (item?.itemId && item.itemId.startsWith('seed_')) {
            this.sim.enqueueCommand('SOW', snapshot.playerEntityId, {
                targetTileX,
                targetTileY,
                payload: { seedItemId: item.itemId }
            });
        }
        else {
            this.sim.enqueueCommand('HARVEST', snapshot.playerEntityId, { targetTileX, targetTileY });
        }
    }
    handleConsumeAction() {
        if (this.ui.isSleeping || this.ui.isInventoryOpen)
            return;
        if (this.sim.isPaused) {
            this.ui.showFeedback('Simulation is paused', '#ffb74d');
            return;
        }
        const snapshot = this.sim.getRenderSnapshot(0.0);
        if (snapshot.playerEntityId === 0)
            return;
        const selectedSlot = this.ui.selectedHotbarSlot;
        this.sim.enqueueCommand('CONSUME', snapshot.playerEntityId, { slotIndex: selectedSlot });
    }
    triggerSleep() {
        if (this.ui.isSleeping || this.isSleepCommandPending)
            return;
        if (this.sim.isPaused) {
            this.ui.showFeedback('Cannot sleep while simulation is paused', '#ffb74d');
            return;
        }
        const snapshot = this.sim.getRenderSnapshot(0.0);
        if (snapshot.playerEntityId === 0)
            return;
        // Proximity check before initiating sleep
        const player = snapshot.entities.find(e => e.id === snapshot.playerEntityId);
        const bed = snapshot.bedEntityId ? snapshot.entities.find(e => e.id === snapshot.bedEntityId) : null;
        if (!player || !bed || !checkBedProximity(player, bed)) {
            this.ui.showFeedback('Too far from bed', '#d32f2f');
            return;
        }
        this.isSleepCommandPending = true;
        // Enqueue authoritative SLEEP command
        this.sim.enqueueCommand('SLEEP', snapshot.playerEntityId, { targetEntityId: snapshot.bedEntityId });
        // Trigger visual sleep transition (2.2 seconds) with pre-sleep snapshot frozen
        this.input.enabled = false;
        this.ui.startSleepTransition(snapshot, undefined, () => {
            this.isSleepCommandPending = false;
            this.input.enabled = true;
        });
    }
    quickSave() {
        SaveManager.save('quicksave_slot', this.sim, this.storage);
        this.notifyHUD('💾 Quick Save Successful!');
    }
    quickLoad() {
        this.ui.closeAllModals();
        if (this.storage.exists('quicksave_slot')) {
            SaveManager.load('quicksave_slot', this.sim, this.storage);
            this.centerCameraOnPlayer(true);
            this.notifyHUD('📂 Quick Load Restored!');
        }
        else {
            this.notifyHUD('⚠️ No Quick Save Found!');
        }
    }
    notifyHUD(msg) {
        this.ui.showFeedback(msg);
    }
    updateHUD(snapshot) {
        if (!this.hudElement)
            return;
        const tickElem = document.getElementById('hud-tick');
        const stateElem = document.getElementById('hud-state');
        const posElem = document.getElementById('hud-pos');
        const fpsElem = document.getElementById('hud-fps');
        if (tickElem)
            tickElem.textContent = snapshot.tick.toString();
        if (fpsElem)
            fpsElem.textContent = `${this.fps} FPS`;
        if (stateElem) {
            stateElem.textContent = snapshot.isPaused ? '⏸️ PAUSED' : '▶️ RUNNING';
            stateElem.style.color = snapshot.isPaused ? '#ffb74d' : '#81c784';
        }
        if (posElem && snapshot.playerEntityId > 0) {
            const p = snapshot.entities.find(e => e.id === snapshot.playerEntityId);
            if (p) {
                posElem.textContent = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
            }
        }
    }
}
