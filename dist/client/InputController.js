/**
 * Client Keyboard Input Controller.
 *
 * Captures user keystrokes and dispatches authoritative PlayerCommands
 * to the WorldSimulation. Never directly mutates simulation state.
 */
export class InputController {
    activeKeys = new Set();
    sim;
    enabled = true;
    touchDx = 0;
    touchDy = 0;
    onQuickSaveCallback;
    onQuickLoadCallback;
    onSelectSlotCallback;
    onContextActionCallback;
    onConsumeActionCallback;
    onToggleInventoryCallback;
    onEscapeCallback;
    onIsModalOpenCallback;
    keyDownHandler = (e) => this.handleKeyDown(e);
    keyUpHandler = (e) => this.handleKeyUp(e);
    constructor(sim) {
        this.sim = sim;
    }
    setCallbacks(callbacks) {
        this.onQuickSaveCallback = callbacks.onQuickSave;
        this.onQuickLoadCallback = callbacks.onQuickLoad;
        this.onSelectSlotCallback = callbacks.onSelectSlot;
        this.onContextActionCallback = callbacks.onContextAction;
        this.onConsumeActionCallback = callbacks.onConsumeAction;
        this.onToggleInventoryCallback = callbacks.onToggleInventory;
        this.onEscapeCallback = callbacks.onEscape;
        this.onIsModalOpenCallback = callbacks.onIsModalOpen;
    }
    windowBlurHandler = () => this.activeKeys.clear();
    attach(target = window) {
        target.addEventListener('keydown', this.keyDownHandler);
        target.addEventListener('keyup', this.keyUpHandler);
        if (typeof window !== 'undefined') {
            window.addEventListener('blur', this.windowBlurHandler);
        }
    }
    detach(target = window) {
        target.removeEventListener('keydown', this.keyDownHandler);
        target.removeEventListener('keyup', this.keyUpHandler);
        if (typeof window !== 'undefined') {
            window.removeEventListener('blur', this.windowBlurHandler);
        }
        this.activeKeys.clear();
    }
    handleKeyDown(e) {
        if (!this.enabled)
            return;
        this.activeKeys.add(e.code);
        // Filter out OS/browser repeated keydown events for discrete single-press actions
        if (e.repeat) {
            return;
        }
        // Escape key closes open modals
        if (e.code === 'Escape') {
            e.preventDefault();
            this.onEscapeCallback?.();
            return;
        }
        // When modal is open, suppress hotbar selection and gameplay actions
        if (this.onIsModalOpenCallback?.()) {
            if (e.code === 'KeyE') {
                e.preventDefault();
                this.onContextActionCallback?.();
                return;
            }
            if (e.code === 'KeyI' || e.code === 'Tab') {
                e.preventDefault();
                this.onToggleInventoryCallback?.();
                return;
            }
            return;
        }
        // Number keys 1-9, 0 for hotbar selection
        if (e.code >= 'Digit1' && e.code <= 'Digit9') {
            const slotIndex = parseInt(e.code.replace('Digit', ''), 10) - 1;
            this.onSelectSlotCallback?.(slotIndex);
            return;
        }
        else if (e.code === 'Digit0') {
            this.onSelectSlotCallback?.(9);
            return;
        }
        // Contextual interaction key (E)
        if (e.code === 'KeyE') {
            e.preventDefault();
            this.onContextActionCallback?.();
            return;
        }
        // Food consumption key (C)
        if (e.code === 'KeyC') {
            e.preventDefault();
            this.onConsumeActionCallback?.();
            return;
        }
        // Inventory panel toggle (I or Tab)
        if (e.code === 'KeyI' || e.code === 'Tab') {
            e.preventDefault();
            this.onToggleInventoryCallback?.();
            return;
        }
        // Single-press commands
        if (e.code === 'Space') {
            e.preventDefault();
            if (this.sim.isPaused) {
                this.sim.resume();
            }
            else {
                this.sim.pause();
            }
        }
        else if (e.code === 'Period') {
            e.preventDefault();
            // Step 1 tick while paused
            this.sim.step(true);
        }
        else if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.onQuickSaveCallback?.();
        }
        else if (e.code === 'KeyL' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.onQuickLoadCallback?.();
        }
    }
    handleKeyUp(e) {
        this.activeKeys.delete(e.code);
    }
    /**
     * Updates virtual joystick direction vector (-1.0 to 1.0).
     */
    setTouchJoystick(dx, dy) {
        this.touchDx = dx;
        this.touchDy = dy;
    }
    triggerContextAction() {
        if (!this.enabled)
            return;
        this.onContextActionCallback?.();
    }
    triggerConsumeAction() {
        if (!this.enabled || this.onIsModalOpenCallback?.())
            return;
        this.onConsumeActionCallback?.();
    }
    triggerToggleInventory() {
        if (!this.enabled)
            return;
        this.onToggleInventoryCallback?.();
    }
    /**
     * Called every animation frame to poll active continuous movement keys.
     * If movement keys or virtual joystick are active, enqueues an authoritative MOVE command.
     */
    update() {
        if (!this.enabled || this.sim.playerEntityId === 0 || this.sim.isPaused || this.onIsModalOpenCallback?.()) {
            return;
        }
        let dx = this.touchDx;
        let dy = this.touchDy;
        if (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp'))
            dy -= 1;
        if (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown'))
            dy += 1;
        if (this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft'))
            dx -= 1;
        if (this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight'))
            dx += 1;
        // Normalize diagonal velocity vector if exceeding unit length
        const len = Math.hypot(dx, dy);
        if (len > 1.0) {
            dx /= len;
            dy /= len;
        }
        if (dx !== 0 || dy !== 0) {
            this.sim.enqueueCommand('MOVE', this.sim.playerEntityId, {
                payload: { dx, dy, speed: 6.0 } // 6 tiles / second
            });
        }
    }
}
