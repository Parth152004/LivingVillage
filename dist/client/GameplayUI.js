import { TIME_CONFIG, FARMING_CONFIG } from '../farming/FarmingConfig.js';
import { PLAYER_CONFIG } from '../player/PlayerConfig.js';
import { isShippableItem, getCropSellPrice, getSeedBuyPrice } from '../economy/EconomyConfig.js';
import { audioManager } from './AudioSystem.js';
/**
 * Pure calculation: format Day and Time from simulation tick.
 * tick 0 = Day 1 00:00
 * tick 7,200 = Day 1 06:00
 * tick 36,000 = Day 2 06:00
 */
export function formatDayTime(tick) {
    const safeTick = Math.max(0, Math.floor(tick));
    const day = Math.floor(safeTick / TIME_CONFIG.TICKS_PER_IN_GAME_DAY) + 1;
    const ticksIntoDay = safeTick % TIME_CONFIG.TICKS_PER_IN_GAME_DAY;
    const hour = Math.floor(ticksIntoDay / TIME_CONFIG.TICKS_PER_IN_GAME_HOUR);
    const minuteTicks = ticksIntoDay % TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;
    const minute = Math.floor(minuteTicks / (TIME_CONFIG.TICKS_PER_SECOND * TIME_CONFIG.SECONDS_PER_IN_GAME_MINUTE));
    const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const dayString = `Day ${day}`;
    const fullDisplay = `${dayString}  ${timeString}`;
    return { day, hour, minute, timeString, dayString, fullDisplay };
}
/**
 * Pure calculation: format Energy display from snapshot.
 */
export function getEnergyDisplay(energy) {
    if (!energy) {
        return { current: 0, max: 100, percent: 0, text: 'Energy: 0 / 100' };
    }
    const current = Math.max(0, Math.round(energy.current));
    const max = Math.max(1, Math.round(energy.max));
    const percent = Math.min(100, Math.max(0, (current / max) * 100));
    return {
        current,
        max,
        percent,
        text: `Energy: ${current} / ${max}`
    };
}
/**
 * Pure calculation: format Gold display from authoritative numeric gold value.
 */
export function formatGoldDisplay(gold) {
    const safeGold = Math.max(0, Math.floor(gold ?? 0));
    return `🪙 ${safeGold}g`;
}
/**
 * Pure helper: item display metadata.
 */
export function getItemInfo(itemId) {
    if (!itemId) {
        return { name: 'Empty', icon: '', action: 'NONE' };
    }
    switch (itemId) {
        case 'tool_hoe':
            return { name: 'Hoe', icon: '⛏️', action: 'TILL' };
        case 'tool_watering_can':
            return { name: 'Watering Can', icon: '💧', action: 'WATER' };
        case 'seed_parsnip':
            return { name: 'Parsnip Seeds', icon: '🌱', action: 'SOW' };
        case 'crop_parsnip':
            return { name: 'Parsnip', icon: '🥕', action: 'EAT' };
        case 'crop_potato':
            return { name: 'Potato', icon: '🥔', action: 'EAT' };
        case 'crop_cauliflower':
            return { name: 'Cauliflower', icon: '🥦', action: 'EAT' };
        case 'seed_potato':
            return { name: 'Potato Seeds', icon: '🌱', action: 'SOW' };
        case 'seed_cauliflower':
            return { name: 'Cauliflower Seeds', icon: '🌱', action: 'SOW' };
        case 'seed_carrot':
            return { name: 'Carrot Seeds', icon: '🌱', action: 'SOW' };
        case 'crop_carrot':
            return { name: 'Carrot', icon: '🥕', action: 'EAT' };
        case 'seed_tomato':
            return { name: 'Tomato Seeds', icon: '🌱', action: 'SOW' };
        case 'crop_tomato':
            return { name: 'Tomato', icon: '🍅', action: 'EAT' };
        case 'product_egg':
            return { name: 'Fresh Egg', icon: '🥚', action: 'EAT' };
        case 'product_milk':
            return { name: 'Fresh Milk', icon: '🥛', action: 'EAT' };
        case 'product_large_egg':
            return { name: 'Large Golden Egg', icon: '✨', action: 'EAT' };
        default:
            return { name: itemId, icon: '📦', action: 'NONE' };
    }
}
/**
 * Pure helper: check bed proximity affordance.
 */
export function checkBedProximity(playerPos, bedPos, reach = PLAYER_CONFIG.BED_INTERACTION_REACH) {
    return Math.hypot(playerPos.x - bedPos.x, playerPos.y - bedPos.y) <= reach;
}
/**
 * Resolves the closest interactable entity to the player within reach <= 1.5 tiles.
 *
 * Uses strict Euclidean distance:
 * dist = Math.hypot(player.x - entity.x, player.y - entity.y)
 *
 * Deterministic Tie-Breaker (for equidistant entities):
 * Bed > ShippingBin > SeedCatalog > NPC > Animal
 *
 * Returns null if no interactable entity is within 1.5 tiles reach.
 */
export function resolveClosestInteractableEntity(snapshot, reach = PLAYER_CONFIG.BED_INTERACTION_REACH) {
    if (snapshot.playerEntityId === 0)
        return null;
    const player = snapshot.entities.find(e => e.id === snapshot.playerEntityId);
    if (!player)
        return null;
    const candidates = [];
    for (const entity of snapshot.entities) {
        if (entity.kind === 'bed' ||
            entity.kind === 'shipping_bin' ||
            entity.kind === 'seed_catalog' ||
            entity.kind === 'animal' ||
            entity.kind === 'npc') {
            const distance = Math.hypot(player.x - entity.x, player.y - entity.y);
            if (distance <= reach) {
                candidates.push({
                    id: entity.id,
                    kind: entity.kind,
                    distance,
                    tileX: Math.floor(entity.x),
                    tileY: Math.floor(entity.y),
                    name: entity.name
                });
            }
        }
    }
    if (candidates.length === 0) {
        return null;
    }
    // Priority ranking for tie-breaking: Bed (0) > ShippingBin (1) > SeedCatalog (2) > NPC (3) > Animal (4)
    const priorityRank = {
        bed: 0,
        shipping_bin: 1,
        seed_catalog: 2,
        npc: 3,
        animal: 4
    };
    candidates.sort((a, b) => {
        const diff = a.distance - b.distance;
        if (Math.abs(diff) > 1e-6) {
            return diff;
        }
        return priorityRank[a.kind] - priorityRank[b.kind];
    });
    return candidates[0] ?? null;
}
/**
 * Presentation Layer: Gameplay UI Controller.
 *
 * Strictly reads from WorldRenderSnapshot.
 * Manages presentation-only state (selected hotbar slot, inventory open toggle, visual sleep transition).
 * Never directly touches ECS components or simulation internal clocks.
 */
export class GameplayUI {
    // Pure presentation state - NEVER written to ECS or save snapshots
    _selectedHotbarSlot = 0;
    _isInventoryOpen = false;
    _isShippingBinOpen = false;
    _isSeedCatalogOpen = false;
    _isDialogueOpen = false;
    _isQuestsOpen = false;
    _isSleeping = false;
    _isFadingToBlack = false;
    _frozenDisplayState = null;
    _lastHandledCommandId = 0;
    _currentPromptKind = null;
    // DOM Elements (cached when present)
    energyFillElem = null;
    energyTextElem = null;
    dayTimeElem = null;
    goldElem = null;
    hotbarContainerElem = null;
    inventoryPanelElem = null;
    inventorySlotsElem = null;
    bedPromptElem = null;
    notificationElem = null;
    sleepOverlayElem = null;
    sleepTextElem = null;
    // Shipping Bin DOM elements
    shippingBinModalElem = null;
    shippingBinItemsElem = null;
    shippingBinRevElem = null;
    shippingEligibleElem = null;
    shippingCloseBtnElem = null;
    // Seed Catalog DOM elements
    seedCatalogModalElem = null;
    seedCatalogGoldElem = null;
    seedCatalogGridElem = null;
    seedCatalogCloseBtnElem = null;
    // Dialogue DOM elements
    dialogueModalElem = null;
    dialogueAvatarElem = null;
    dialogueNameElem = null;
    dialogueTitleElem = null;
    dialogueBodyElem = null;
    dialogueCloseBtnElem = null;
    // Quests DOM elements
    questsModalElem = null;
    questsListElem = null;
    questsCloseBtnElem = null;
    // Mobile Controls DOM elements
    joystickZoneElem = null;
    joystickThumbElem = null;
    btnMobileUseElem = null;
    btnMobileInteractElem = null;
    btnMobileEatElem = null;
    btnMobileBagElem = null;
    btnMobileQuestsElem = null;
    btnAudioToggleElem = null;
    onHotbarSlotSelect;
    onSleepTrigger;
    onContextActionTrigger;
    onShipItemCallback;
    onBuySeedCallback;
    onClaimQuestCallback;
    constructor() {
        this.bindDomElements();
    }
    bindDomElements() {
        if (typeof document === 'undefined')
            return;
        this.energyFillElem = document.getElementById('energy-bar-fill');
        this.energyTextElem = document.getElementById('energy-text');
        this.dayTimeElem = document.getElementById('hud-day-time');
        this.goldElem = document.getElementById('hud-gold');
        this.hotbarContainerElem = document.getElementById('hotbar-container');
        this.inventoryPanelElem = document.getElementById('inventory-panel');
        this.inventorySlotsElem = document.getElementById('inventory-slots-grid');
        this.bedPromptElem = document.getElementById('bed-interaction-prompt') ?? document.getElementById('interaction-prompt');
        this.notificationElem = document.getElementById('hud-notification');
        this.sleepOverlayElem = document.getElementById('sleep-overlay');
        this.sleepTextElem = document.getElementById('sleep-overlay-text');
        this.shippingBinModalElem = document.getElementById('shipping-bin-modal');
        this.shippingBinItemsElem = document.getElementById('shipping-bin-current-items');
        this.shippingBinRevElem = document.getElementById('shipping-bin-estimated-rev');
        this.shippingEligibleElem = document.getElementById('shipping-eligible-list');
        this.shippingCloseBtnElem = document.getElementById('shipping-bin-close-btn');
        this.seedCatalogModalElem = document.getElementById('seed-catalog-modal');
        this.seedCatalogGoldElem = document.getElementById('catalog-player-gold');
        this.seedCatalogGridElem = document.getElementById('seed-catalog-items-grid');
        this.seedCatalogCloseBtnElem = document.getElementById('seed-catalog-close-btn');
        this.dialogueModalElem = document.getElementById('dialogue-modal');
        this.dialogueAvatarElem = document.getElementById('dialogue-avatar');
        this.dialogueNameElem = document.getElementById('dialogue-name');
        this.dialogueTitleElem = document.getElementById('dialogue-title');
        this.dialogueBodyElem = document.getElementById('dialogue-body');
        this.dialogueCloseBtnElem = document.getElementById('dialogue-close-btn');
        this.questsModalElem = document.getElementById('quests-modal');
        this.questsListElem = document.getElementById('quests-list-container');
        this.questsCloseBtnElem = document.getElementById('quests-close-btn');
        this.joystickZoneElem = document.getElementById('virtual-joystick-zone');
        this.joystickThumbElem = document.getElementById('joystick-thumb');
        this.btnMobileUseElem = document.getElementById('btn-mobile-use');
        this.btnMobileInteractElem = document.getElementById('btn-mobile-interact');
        this.btnMobileEatElem = document.getElementById('btn-mobile-eat');
        this.btnMobileBagElem = document.getElementById('btn-mobile-bag');
        this.btnMobileQuestsElem = document.getElementById('btn-mobile-quests');
        this.btnAudioToggleElem = document.getElementById('btn-audio-toggle');
        if (this.inventoryPanelElem) {
            this.inventoryPanelElem.onclick = (e) => e.stopPropagation();
        }
        if (this.shippingBinModalElem) {
            this.shippingBinModalElem.onclick = (e) => e.stopPropagation();
        }
        if (this.shippingCloseBtnElem) {
            this.shippingCloseBtnElem.onclick = (e) => {
                e.stopPropagation();
                this.closeShippingBin();
            };
        }
        if (this.seedCatalogModalElem) {
            this.seedCatalogModalElem.onclick = (e) => e.stopPropagation();
        }
        if (this.seedCatalogCloseBtnElem) {
            this.seedCatalogCloseBtnElem.onclick = (e) => {
                e.stopPropagation();
                this.closeSeedCatalog();
            };
        }
        if (this.dialogueModalElem) {
            this.dialogueModalElem.onclick = (e) => e.stopPropagation();
        }
        if (this.dialogueCloseBtnElem) {
            this.dialogueCloseBtnElem.onclick = (e) => {
                e.stopPropagation();
                this.closeDialogue();
            };
        }
        if (this.questsModalElem) {
            this.questsModalElem.onclick = (e) => e.stopPropagation();
        }
        if (this.questsCloseBtnElem) {
            this.questsCloseBtnElem.onclick = (e) => {
                e.stopPropagation();
                this.closeQuests();
            };
        }
        this.setupHotbarListeners();
    }
    setCallbacks(callbacks) {
        this.onHotbarSlotSelect = callbacks.onHotbarSlotSelect;
        this.onSleepTrigger = callbacks.onSleepTrigger;
        this.onContextActionTrigger = callbacks.onContextAction;
        this.onShipItemCallback = callbacks.onShipItem;
        this.onBuySeedCallback = callbacks.onBuySeed;
        this.onClaimQuestCallback = callbacks.onClaimQuest;
        if (this.bedPromptElem) {
            this.bedPromptElem.onclick = (e) => {
                e.stopPropagation();
                if (this._currentPromptKind === 'bed') {
                    this.onSleepTrigger?.();
                }
                else {
                    this.onContextActionTrigger?.();
                }
            };
        }
    }
    get selectedHotbarSlot() {
        return this._selectedHotbarSlot;
    }
    get isInventoryOpen() {
        return this._isInventoryOpen;
    }
    get isShippingBinOpen() {
        return this._isShippingBinOpen;
    }
    get isSeedCatalogOpen() {
        return this._isSeedCatalogOpen;
    }
    get isDialogueOpen() {
        return this._isDialogueOpen;
    }
    get isQuestsOpen() {
        return this._isQuestsOpen;
    }
    get isModalOpen() {
        return (this._isInventoryOpen ||
            this._isShippingBinOpen ||
            this._isSeedCatalogOpen ||
            this._isDialogueOpen ||
            this._isQuestsOpen);
    }
    closeAllModals() {
        this._isInventoryOpen = false;
        this._isShippingBinOpen = false;
        this._isSeedCatalogOpen = false;
        this._isDialogueOpen = false;
        this._isQuestsOpen = false;
        if (this.inventoryPanelElem) {
            this.inventoryPanelElem.style.display = 'none';
        }
        if (this.shippingBinModalElem) {
            this.shippingBinModalElem.style.display = 'none';
        }
        if (this.seedCatalogModalElem) {
            this.seedCatalogModalElem.style.display = 'none';
        }
        if (this.dialogueModalElem) {
            this.dialogueModalElem.style.display = 'none';
        }
        if (this.questsModalElem) {
            this.questsModalElem.style.display = 'none';
        }
    }
    openDialogue(data) {
        this.closeAllModals();
        this._isDialogueOpen = true;
        if (this.dialogueNameElem)
            this.dialogueNameElem.textContent = data.name;
        if (this.dialogueTitleElem)
            this.dialogueTitleElem.textContent = data.title;
        if (this.dialogueAvatarElem)
            this.dialogueAvatarElem.textContent = data.portraitIcon;
        if (this.dialogueBodyElem)
            this.dialogueBodyElem.textContent = data.text;
        if (this.dialogueModalElem) {
            this.dialogueModalElem.style.display = 'block';
        }
        audioManager.playClick();
    }
    closeDialogue() {
        this._isDialogueOpen = false;
        if (this.dialogueModalElem) {
            this.dialogueModalElem.style.display = 'none';
        }
    }
    openQuests(snapshot) {
        this.closeAllModals();
        this._isQuestsOpen = true;
        if (this.questsModalElem) {
            this.questsModalElem.style.display = 'block';
        }
        this.renderQuests(snapshot);
        audioManager.playClick();
    }
    closeQuests() {
        this._isQuestsOpen = false;
        if (this.questsModalElem) {
            this.questsModalElem.style.display = 'none';
        }
    }
    toggleQuests(snapshot) {
        if (this._isQuestsOpen) {
            this.closeQuests();
        }
        else {
            this.openQuests(snapshot);
        }
    }
    openShippingBin(snapshot) {
        this.closeAllModals();
        this._isShippingBinOpen = true;
        if (this.shippingBinModalElem) {
            this.shippingBinModalElem.style.display = 'block';
        }
        this.renderShippingBin(snapshot);
    }
    closeShippingBin() {
        this._isShippingBinOpen = false;
        if (this.shippingBinModalElem) {
            this.shippingBinModalElem.style.display = 'none';
        }
    }
    openSeedCatalog(snapshot) {
        this.closeAllModals();
        this._isSeedCatalogOpen = true;
        if (this.seedCatalogModalElem) {
            this.seedCatalogModalElem.style.display = 'block';
        }
        this.renderSeedCatalog(snapshot);
    }
    closeSeedCatalog() {
        this._isSeedCatalogOpen = false;
        if (this.seedCatalogModalElem) {
            this.seedCatalogModalElem.style.display = 'none';
        }
    }
    get isSleeping() {
        return this._isSleeping;
    }
    /**
     * Updates presentation state: selected hotbar slot (0-9).
     */
    selectSlot(index) {
        const clamped = Math.max(0, Math.min(9, Math.floor(index)));
        this._selectedHotbarSlot = clamped;
        this.renderHotbarSelection();
        this.onHotbarSlotSelect?.(clamped);
    }
    /**
     * Toggles the read-only inventory panel visibility.
     */
    toggleInventory() {
        this._isInventoryOpen = !this._isInventoryOpen;
        if (this.inventoryPanelElem) {
            this.inventoryPanelElem.style.display = this._isInventoryOpen ? 'block' : 'none';
        }
    }
    /**
     * Main per-frame UI update reading exclusively from WorldRenderSnapshot.
     */
    update(snapshot) {
        this.updateEnergy(snapshot);
        this.updateDayTime(snapshot);
        this.updateGold(snapshot);
        this.updateHotbar(snapshot);
        this.updateInventory(snapshot);
        this.updateBedPrompt(snapshot);
        this.updateFeedback(snapshot);
        if (this._isShippingBinOpen) {
            this.renderShippingBin(snapshot);
        }
        if (this._isSeedCatalogOpen) {
            this.renderSeedCatalog(snapshot);
        }
        if (this._isQuestsOpen) {
            this.renderQuests(snapshot);
        }
    }
    /**
     * Updates Gold HUD UI derived purely from authoritative snapshot.player.wallet.gold.
     */
    updateGold(snapshot) {
        if (!this.goldElem)
            return;
        const gold = snapshot.player?.wallet?.gold;
        this.goldElem.textContent = formatGoldDisplay(gold);
    }
    /**
     * Updates Energy UI: numeric text and progress bar width.
     */
    updateEnergy(snapshot) {
        const energySource = (this._isFadingToBlack && this._frozenDisplayState)
            ? this._frozenDisplayState.energy
            : snapshot.player?.energy;
        const energyData = getEnergyDisplay(energySource);
        if (this.energyTextElem) {
            this.energyTextElem.textContent = energyData.text;
        }
        if (this.energyFillElem) {
            this.energyFillElem.style.width = `${energyData.percent}%`;
            // Color coding for visual urgency
            if (energyData.current <= 15) {
                this.energyFillElem.style.backgroundColor = '#e53935'; // Urgent red
            }
            else if (energyData.current <= 40) {
                this.energyFillElem.style.backgroundColor = '#fbc02d'; // Warning amber
            }
            else {
                this.energyFillElem.style.backgroundColor = '#43a047'; // Healthy green
            }
        }
    }
    /**
     * Updates Day and Time UI derived purely from authoritative simulation tick.
     */
    updateDayTime(snapshot) {
        if (!this.dayTimeElem)
            return;
        const tickSource = (this._isFadingToBlack && this._frozenDisplayState)
            ? this._frozenDisplayState.tick
            : snapshot.tick;
        const dt = formatDayTime(tickSource);
        const seasonText = snapshot.season ? ` • ☀️ ${snapshot.season}` : '';
        this.dayTimeElem.textContent = `${dt.dayString}${seasonText}  ${dt.timeString}`;
    }
    /**
     * Updates Hotbar visual slots from snapshot inventory.
     */
    updateHotbar(snapshot) {
        if (!this.hotbarContainerElem)
            return;
        const slots = snapshot.player?.inventory ?? [];
        const slotElements = this.hotbarContainerElem.querySelectorAll('.hotbar-slot');
        slotElements.forEach((elem, index) => {
            const item = slots[index] ?? null;
            const info = getItemInfo(item?.itemId);
            const iconElem = elem.querySelector('.slot-icon');
            const nameElem = elem.querySelector('.slot-name');
            const countElem = elem.querySelector('.slot-count');
            const chargesElem = elem.querySelector('.slot-charges');
            if (iconElem)
                iconElem.textContent = info.icon;
            if (nameElem)
                nameElem.textContent = info.name !== 'Empty' ? info.name : '';
            if (countElem) {
                if (item && item.quantity > 1) {
                    countElem.textContent = `x${item.quantity}`;
                    countElem.style.display = 'block';
                }
                else {
                    countElem.style.display = 'none';
                }
            }
            if (chargesElem) {
                if (item && item.charges !== undefined) {
                    chargesElem.textContent = `${item.charges}/${FARMING_CONFIG.WATERING_CAN_MAX_CHARGES}`;
                    chargesElem.style.display = 'block';
                }
                else {
                    chargesElem.style.display = 'none';
                }
            }
        });
        const activeItem = slots[this._selectedHotbarSlot] ?? null;
        const activeInfo = getItemInfo(activeItem?.itemId);
        const mobileUseIcon = document.getElementById('btn-use-icon');
        if (mobileUseIcon) {
            mobileUseIcon.textContent = activeInfo.icon || '✋';
        }
        this.renderHotbarSelection();
    }
    renderHotbarSelection() {
        if (!this.hotbarContainerElem)
            return;
        const slotElements = this.hotbarContainerElem.querySelectorAll('.hotbar-slot');
        slotElements.forEach((elem, index) => {
            if (index === this._selectedHotbarSlot) {
                elem.classList.add('selected');
            }
            else {
                elem.classList.remove('selected');
            }
        });
    }
    setupHotbarListeners() {
        if (!this.hotbarContainerElem)
            return;
        const slotElements = this.hotbarContainerElem.querySelectorAll('.hotbar-slot');
        slotElements.forEach((elem, index) => {
            elem.onclick = (e) => {
                e.stopPropagation();
                this.selectSlot(index);
                audioManager.playClick();
            };
        });
    }
    /**
     * Updates read-only inventory panel when open.
     */
    updateInventory(snapshot) {
        if (!this._isInventoryOpen || !this.inventorySlotsElem)
            return;
        const slots = snapshot.player?.inventory ?? [];
        this.inventorySlotsElem.innerHTML = '';
        for (let i = 0; i < slots.length; i++) {
            const item = slots[i];
            const info = getItemInfo(item?.itemId);
            const slotDiv = document.createElement('div');
            slotDiv.className = 'inv-grid-slot';
            if (item) {
                let detailsHtml = `<div class="inv-slot-icon">${info.icon}</div>
                           <div class="inv-slot-name">${info.name}</div>`;
                if (item.quantity > 1) {
                    detailsHtml += `<div class="inv-slot-qty">Qty: ${item.quantity}</div>`;
                }
                if (item.charges !== undefined) {
                    detailsHtml += `<div class="inv-slot-charges">Charges: ${item.charges}/${FARMING_CONFIG.WATERING_CAN_MAX_CHARGES}</div>`;
                }
                slotDiv.innerHTML = detailsHtml;
            }
            else {
                slotDiv.innerHTML = `<div class="inv-slot-empty">Empty</div>`;
            }
            this.inventorySlotsElem.appendChild(slotDiv);
        }
    }
    /**
     * Updates interaction affordance prompt for closest interactable entity within 1.5 reach.
     */
    updateBedPrompt(snapshot) {
        if (!this.bedPromptElem)
            return;
        if (this.isModalOpen || snapshot.playerEntityId === 0) {
            this.bedPromptElem.style.display = 'none';
            this._currentPromptKind = null;
            return;
        }
        const closest = resolveClosestInteractableEntity(snapshot);
        if (!closest) {
            this.bedPromptElem.style.display = 'none';
            this._currentPromptKind = null;
            return;
        }
        this._currentPromptKind = closest.kind;
        this.bedPromptElem.style.display = 'flex';
        if (closest.kind === 'bed') {
            this.bedPromptElem.innerHTML = '<span class="key-badge">E</span> Sleep in Bed';
        }
        else if (closest.kind === 'shipping_bin') {
            this.bedPromptElem.innerHTML = '<span class="key-badge">E</span> Open Shipping Bin';
        }
        else if (closest.kind === 'seed_catalog') {
            this.bedPromptElem.innerHTML = '<span class="key-badge">E</span> Browse Seed Catalog';
        }
        else if (closest.kind === 'animal') {
            this.bedPromptElem.innerHTML = `<span class="key-badge">E</span> Pet ${closest.name ?? 'Animal'}`;
        }
        else if (closest.kind === 'npc') {
            this.bedPromptElem.innerHTML = `<span class="key-badge">E</span> Talk to ${closest.name ?? 'Neighbor'}`;
        }
    }
    /**
     * Displays authoritative command feedback notifications.
     */
    updateFeedback(snapshot) {
        const cmdResult = snapshot.lastCommandResult;
        if (!cmdResult || cmdResult.commandId === this._lastHandledCommandId) {
            return;
        }
        this._lastHandledCommandId = cmdResult.commandId;
        if (cmdResult.success) {
            if (cmdResult.type === 'TILL')
                audioManager.playTill();
            else if (cmdResult.type === 'SOW')
                audioManager.playSow();
            else if (cmdResult.type === 'WATER')
                audioManager.playWater();
            else if (cmdResult.type === 'HARVEST')
                audioManager.playHarvest();
            else if (cmdResult.type === 'CONSUME')
                audioManager.playHarvest();
            else if (cmdResult.type === 'SHIP_ITEM')
                audioManager.playCoin();
            else if (cmdResult.type === 'BUY_SEED')
                audioManager.playCoin();
            else if (cmdResult.type === 'PET_ANIMAL')
                audioManager.playHarvest();
            else if (cmdResult.type === 'TALK_NPC')
                audioManager.playClick();
            else if (cmdResult.type === 'CLAIM_QUEST')
                audioManager.playCoin();
        }
        else if (cmdResult.reason) {
            this.showFeedback(cmdResult.reason, '#d32f2f'); // Warning red
        }
    }
    showFeedback(msg, bgColor = '#1b5e20') {
        if (!this.notificationElem)
            return;
        this.notificationElem.textContent = msg;
        this.notificationElem.style.backgroundColor = bgColor;
        this.notificationElem.style.opacity = '1';
        setTimeout(() => {
            if (this.notificationElem) {
                this.notificationElem.style.opacity = '0';
            }
        }, 2200);
    }
    /**
     * Visual Sleep Transition: 2-3 second presentation fade to black and back.
     *
     * CRITICAL: The simulation has already advanced authoritatively.
     * This transition is purely visual and NEVER controls or advances the simulation clock.
     */
    startSleepTransition(preSleepSnapshot, onMidTransition, onComplete) {
        if (this._isSleeping)
            return;
        this._isSleeping = true;
        this._isFadingToBlack = true;
        if (preSleepSnapshot) {
            this._frozenDisplayState = {
                tick: preSleepSnapshot.tick,
                energy: preSleepSnapshot.player?.energy
                    ? { ...preSleepSnapshot.player.energy }
                    : { current: 0, max: 100 }
            };
        }
        if (this.sleepOverlayElem) {
            this.sleepOverlayElem.style.display = 'flex';
            // Step 1: Fade to black (0.6s)
            this.sleepOverlayElem.style.opacity = '1';
            if (this.sleepTextElem) {
                this.sleepTextElem.textContent = '💤 Resting until morning...';
            }
        }
        // Step 2: Mid-transition callback at full black (~0.8s)
        setTimeout(() => {
            // Screen is now fully black; unfreeze display state so new dawn & energy are revealed behind black screen
            this._isFadingToBlack = false;
            this._frozenDisplayState = null;
            onMidTransition?.();
            if (this.sleepTextElem) {
                this.sleepTextElem.textContent = '🌅 Dawn arrives...';
            }
            // Step 3: Fade back in (~1.2s later, total ~2.2s)
            setTimeout(() => {
                if (this.sleepOverlayElem) {
                    this.sleepOverlayElem.style.opacity = '0';
                    setTimeout(() => {
                        if (this.sleepOverlayElem) {
                            this.sleepOverlayElem.style.display = 'none';
                        }
                        this._isSleeping = false;
                        this.showFeedback('☀️ Good Morning! Energy restored to 100/100.', '#2e7d32');
                        onComplete?.();
                    }, 600);
                }
                else {
                    this._isSleeping = false;
                    onComplete?.();
                }
            }, 800);
        }, 800);
    }
    /**
     * Renders the Shipping Bin modal UI reading purely from authoritative snapshot.
     */
    renderShippingBin(snapshot) {
        if (!this.shippingBinModalElem)
            return;
        // 1. Estimated Overnight Revenue
        if (this.shippingBinRevElem) {
            const rev = snapshot.shippingBin?.estimatedRevenue ?? 0;
            this.shippingBinRevElem.textContent = formatGoldDisplay(rev);
        }
        // 2. Current items in bin
        if (this.shippingBinItemsElem) {
            this.shippingBinItemsElem.innerHTML = '';
            const binItems = snapshot.shippingBin?.items ?? [];
            if (binItems.length === 0) {
                const emptySpan = document.createElement('span');
                emptySpan.className = 'bin-empty-text';
                emptySpan.textContent = 'Bin is empty (0 items)';
                this.shippingBinItemsElem.appendChild(emptySpan);
            }
            else {
                for (const item of binItems) {
                    const info = getItemInfo(item.itemId);
                    const tag = document.createElement('span');
                    tag.className = 'bin-item-tag';
                    tag.textContent = `${info.icon} ${info.name} x${item.quantity}`;
                    this.shippingBinItemsElem.appendChild(tag);
                }
            }
        }
        // 3. Eligible crops in player's inventory
        if (this.shippingEligibleElem) {
            this.shippingEligibleElem.innerHTML = '';
            const eligibleItems = [];
            for (const slot of snapshot.player?.inventory ?? []) {
                if (slot && isShippableItem(slot.itemId) && slot.quantity > 0) {
                    const found = eligibleItems.find(e => e.itemId === slot.itemId);
                    if (found) {
                        found.quantity += slot.quantity;
                    }
                    else {
                        eligibleItems.push({ itemId: slot.itemId, quantity: slot.quantity });
                    }
                }
            }
            if (eligibleItems.length === 0) {
                const hint = document.createElement('div');
                hint.className = 'empty-hint';
                hint.textContent = 'No harvested crops in inventory to ship.';
                this.shippingEligibleElem.appendChild(hint);
            }
            else {
                for (const crop of eligibleItems) {
                    const info = getItemInfo(crop.itemId);
                    const unitPrice = getCropSellPrice(crop.itemId) ?? 0;
                    const card = document.createElement('div');
                    card.className = 'shipping-crop-card';
                    const cropInfoDiv = document.createElement('div');
                    cropInfoDiv.className = 'crop-info';
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'crop-icon';
                    iconSpan.textContent = info.icon;
                    const detailsDiv = document.createElement('div');
                    detailsDiv.className = 'crop-details';
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'crop-name';
                    nameSpan.textContent = info.name;
                    const priceSpan = document.createElement('span');
                    priceSpan.className = 'crop-price';
                    priceSpan.textContent = `🪙 ${unitPrice}g each (Available: ${crop.quantity})`;
                    detailsDiv.appendChild(nameSpan);
                    detailsDiv.appendChild(priceSpan);
                    cropInfoDiv.appendChild(iconSpan);
                    cropInfoDiv.appendChild(detailsDiv);
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'crop-actions';
                    const shipOneBtn = document.createElement('button');
                    shipOneBtn.className = 'ship-btn';
                    shipOneBtn.textContent = `Ship 1 (🪙 ${unitPrice}g)`;
                    shipOneBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.onShipItemCallback?.(crop.itemId, 1);
                    };
                    actionsDiv.appendChild(shipOneBtn);
                    if (crop.quantity > 1) {
                        const shipAllBtn = document.createElement('button');
                        shipAllBtn.className = 'ship-btn';
                        shipAllBtn.textContent = `Ship All (${crop.quantity}) (🪙 ${unitPrice * crop.quantity}g)`;
                        shipAllBtn.onclick = (e) => {
                            e.stopPropagation();
                            this.onShipItemCallback?.(crop.itemId, crop.quantity);
                        };
                        actionsDiv.appendChild(shipAllBtn);
                    }
                    card.appendChild(cropInfoDiv);
                    card.appendChild(actionsDiv);
                    this.shippingEligibleElem.appendChild(card);
                }
            }
        }
    }
    /**
     * Renders the Seed Catalog modal UI reading purely from authoritative snapshot.
     */
    renderSeedCatalog(snapshot) {
        if (!this.seedCatalogModalElem)
            return;
        const playerGold = snapshot.player?.wallet?.gold ?? 0;
        if (this.seedCatalogGoldElem) {
            this.seedCatalogGoldElem.textContent = formatGoldDisplay(playerGold);
        }
        if (this.seedCatalogGridElem) {
            this.seedCatalogGridElem.innerHTML = '';
            const catalogEntries = [
                {
                    id: 'seed_parsnip',
                    name: 'Parsnip Seeds',
                    icon: '🌱',
                    price: getSeedBuyPrice('seed_parsnip') ?? 20,
                    desc: 'Spring crop. Matures in 4 days. Sells for 35g.'
                },
                {
                    id: 'seed_potato',
                    name: 'Potato Seeds',
                    icon: '🌱',
                    price: getSeedBuyPrice('seed_potato') ?? 50,
                    desc: 'Spring crop. Matures in 6 days. Sells for 80g.'
                },
                {
                    id: 'seed_cauliflower',
                    name: 'Cauliflower Seeds',
                    icon: '🌱',
                    price: getSeedBuyPrice('seed_cauliflower') ?? 80,
                    desc: 'Spring crop. Matures in 12 days. Sells for 175g.'
                },
                {
                    id: 'seed_carrot',
                    name: 'Carrot Seeds',
                    icon: '🌱',
                    price: getSeedBuyPrice('seed_carrot') ?? 25,
                    desc: 'Spring root. Fast growing, matures in 3 days. Sells for 45g.'
                },
                {
                    id: 'seed_tomato',
                    name: 'Tomato Seeds',
                    icon: '🌱',
                    price: getSeedBuyPrice('seed_tomato') ?? 50,
                    desc: 'Spring vine fruit. Matures in 5 days. Sells for 60g.'
                }
            ];
            for (const entry of catalogEntries) {
                const canAfford1 = playerGold >= entry.price;
                const canAfford5 = playerGold >= entry.price * 5;
                const card = document.createElement('div');
                card.className = 'catalog-item-card';
                const infoDiv = document.createElement('div');
                infoDiv.className = 'catalog-item-info';
                const iconSpan = document.createElement('span');
                iconSpan.className = 'catalog-item-icon';
                iconSpan.textContent = entry.icon;
                const detailsDiv = document.createElement('div');
                detailsDiv.className = 'catalog-item-details';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'catalog-item-name';
                nameSpan.textContent = entry.name;
                const descSpan = document.createElement('span');
                descSpan.className = 'catalog-item-desc';
                descSpan.textContent = entry.desc;
                const priceSpan = document.createElement('span');
                priceSpan.className = 'catalog-item-price';
                priceSpan.textContent = `🪙 ${entry.price}g`;
                detailsDiv.appendChild(nameSpan);
                detailsDiv.appendChild(descSpan);
                detailsDiv.appendChild(priceSpan);
                infoDiv.appendChild(iconSpan);
                infoDiv.appendChild(detailsDiv);
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'catalog-actions';
                const buy1Btn = document.createElement('button');
                buy1Btn.className = 'buy-seed-btn';
                buy1Btn.textContent = `Buy 1 (🪙 ${entry.price}g)`;
                buy1Btn.disabled = !canAfford1;
                buy1Btn.onclick = (e) => {
                    e.stopPropagation();
                    if (canAfford1) {
                        this.onBuySeedCallback?.(entry.id, 1);
                    }
                };
                const buy5Btn = document.createElement('button');
                buy5Btn.className = 'buy-seed-btn';
                buy5Btn.textContent = `Buy 5 (🪙 ${entry.price * 5}g)`;
                buy5Btn.disabled = !canAfford5;
                buy5Btn.onclick = (e) => {
                    e.stopPropagation();
                    if (canAfford5) {
                        this.onBuySeedCallback?.(entry.id, 5);
                    }
                };
                actionsDiv.appendChild(buy1Btn);
                actionsDiv.appendChild(buy5Btn);
                card.appendChild(infoDiv);
                card.appendChild(actionsDiv);
                this.seedCatalogGridElem.appendChild(card);
            }
        }
    }
    /**
     * Renders the Quests Journal modal reading purely from authoritative snapshot.
     */
    renderQuests(snapshot) {
        if (!this.questsListElem)
            return;
        this.questsListElem.innerHTML = '';
        const quests = snapshot.quests ?? [];
        if (quests.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-hint';
            emptyDiv.textContent = 'No active farmstead quests at the moment.';
            this.questsListElem.appendChild(emptyDiv);
            return;
        }
        for (const q of quests) {
            const card = document.createElement('div');
            card.className = `quest-card ${q.isClaimed ? 'quest-claimed' : q.isCompleted ? 'quest-ready' : 'quest-in-progress'}`;
            const headerDiv = document.createElement('div');
            headerDiv.className = 'quest-card-header';
            const titleSpan = document.createElement('span');
            titleSpan.className = 'quest-title';
            titleSpan.textContent = q.title;
            const categorySpan = document.createElement('span');
            categorySpan.className = `quest-badge badge-${q.category}`;
            categorySpan.textContent = q.category.toUpperCase();
            headerDiv.appendChild(titleSpan);
            headerDiv.appendChild(categorySpan);
            const descP = document.createElement('p');
            descP.className = 'quest-desc';
            descP.textContent = q.description;
            const progressContainer = document.createElement('div');
            progressContainer.className = 'quest-progress-container';
            const progressLabel = document.createElement('div');
            progressLabel.className = 'quest-progress-label';
            progressLabel.innerHTML = `<span>Progress</span><span>${q.progressText}</span>`;
            const progressBar = document.createElement('div');
            progressBar.className = 'quest-progress-bar';
            const progressFill = document.createElement('div');
            progressFill.className = 'quest-progress-fill';
            progressFill.style.width = `${q.percent}%`;
            progressBar.appendChild(progressFill);
            progressContainer.appendChild(progressLabel);
            progressContainer.appendChild(progressBar);
            const footerDiv = document.createElement('div');
            footerDiv.className = 'quest-footer';
            const rewardDiv = document.createElement('div');
            rewardDiv.className = 'quest-reward';
            let rewardText = `Reward: 🪙 ${q.rewardGold}g`;
            if (q.rewardItemName) {
                rewardText += ` + ${q.rewardItemName}`;
            }
            rewardDiv.textContent = rewardText;
            const actionBtn = document.createElement('button');
            actionBtn.className = 'quest-claim-btn';
            if (q.isClaimed) {
                actionBtn.textContent = 'Claimed ✔';
                actionBtn.disabled = true;
            }
            else if (q.isCompleted) {
                actionBtn.textContent = 'Claim Reward! 🎁';
                actionBtn.classList.add('ready-to-claim');
                actionBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.onClaimQuestCallback?.(q.id);
                };
            }
            else {
                actionBtn.textContent = 'In Progress...';
                actionBtn.disabled = true;
            }
            footerDiv.appendChild(rewardDiv);
            footerDiv.appendChild(actionBtn);
            card.appendChild(headerDiv);
            card.appendChild(descP);
            card.appendChild(progressContainer);
            card.appendChild(footerDiv);
            this.questsListElem.appendChild(card);
        }
    }
    /**
     * Binds mobile touch virtual joystick and mobile action clusters.
     */
    setupMobileControls(inputController, gameClient) {
        // 1. Audio toggle button
        if (this.btnAudioToggleElem) {
            this.btnAudioToggleElem.onclick = (e) => {
                e.stopPropagation();
                const isMuted = audioManager.toggleMute();
                this.btnAudioToggleElem.textContent = isMuted ? '🔇' : '🔊';
                this.showFeedback(isMuted ? 'Audio Muted' : 'Audio Enabled');
            };
        }
        // 2. Mobile Action Buttons
        if (this.btnMobileUseElem) {
            this.btnMobileUseElem.onclick = (e) => {
                e.stopPropagation();
                gameClient.handleContextAction();
            };
        }
        if (this.btnMobileInteractElem) {
            this.btnMobileInteractElem.onclick = (e) => {
                e.stopPropagation();
                gameClient.handleContextAction();
            };
        }
        if (this.btnMobileEatElem) {
            this.btnMobileEatElem.onclick = (e) => {
                e.stopPropagation();
                gameClient.handleConsumeAction();
            };
        }
        if (this.btnMobileBagElem) {
            this.btnMobileBagElem.onclick = (e) => {
                e.stopPropagation();
                this.toggleInventory();
            };
        }
        if (this.btnMobileQuestsElem) {
            this.btnMobileQuestsElem.onclick = (e) => {
                e.stopPropagation();
                const snap = gameClient.sim.getRenderSnapshot(0.0);
                this.toggleQuests(snap);
            };
        }
        // 3. Virtual Joystick
        if (this.joystickZoneElem && this.joystickThumbElem) {
            let isDragging = false;
            let startX = 0;
            let startY = 0;
            const handleStart = (clientX, clientY) => {
                isDragging = true;
                const rect = this.joystickZoneElem.getBoundingClientRect();
                startX = rect.left + rect.width / 2;
                startY = rect.top + rect.height / 2;
                handleMove(clientX, clientY);
            };
            const handleMove = (clientX, clientY) => {
                if (!isDragging)
                    return;
                const deltaX = clientX - startX;
                const deltaY = clientY - startY;
                const dist = Math.hypot(deltaX, deltaY);
                const maxRadius = 45;
                const clampedDist = Math.min(dist, maxRadius);
                const angle = Math.atan2(deltaY, deltaX);
                const thumbX = Math.cos(angle) * clampedDist;
                const thumbY = Math.sin(angle) * clampedDist;
                if (this.joystickThumbElem) {
                    this.joystickThumbElem.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
                }
                const normDx = Math.cos(angle) * (clampedDist / maxRadius);
                const normDy = Math.sin(angle) * (clampedDist / maxRadius);
                inputController.setTouchJoystick(normDx, normDy);
            };
            const handleEnd = () => {
                isDragging = false;
                if (this.joystickThumbElem) {
                    this.joystickThumbElem.style.transform = 'translate(0px, 0px)';
                }
                inputController.setTouchJoystick(0, 0);
            };
            this.joystickZoneElem.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                handleStart(e.clientX, e.clientY);
            });
            window.addEventListener('pointermove', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    handleMove(e.clientX, e.clientY);
                }
            });
            window.addEventListener('pointerup', handleEnd);
            window.addEventListener('pointercancel', handleEnd);
        }
    }
}
