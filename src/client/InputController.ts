import { WorldSimulation } from '../core/WorldSimulation.js';

/**
 * Client Keyboard Input Controller.
 * 
 * Captures user keystrokes and dispatches authoritative PlayerCommands
 * to the WorldSimulation. Never directly mutates simulation state.
 */
export class InputController {
  private activeKeys: Set<string> = new Set();
  private sim: WorldSimulation;
  public enabled: boolean = true;
  private touchDx: number = 0;
  private touchDy: number = 0;
  private onQuickSaveCallback?: (() => void) | undefined;
  private onQuickLoadCallback?: (() => void) | undefined;
  private onSelectSlotCallback?: ((slotIndex: number) => void) | undefined;
  private onContextActionCallback?: (() => void) | undefined;
  private onConsumeActionCallback?: (() => void) | undefined;
  private onToggleInventoryCallback?: (() => void) | undefined;
  private onEscapeCallback?: (() => void) | undefined;
  private onIsModalOpenCallback?: (() => boolean) | undefined;

  private keyDownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
  private keyUpHandler = (e: KeyboardEvent) => this.handleKeyUp(e);

  constructor(sim: WorldSimulation) {
    this.sim = sim;
  }

  public setCallbacks(callbacks: {
    onQuickSave?: () => void;
    onQuickLoad?: () => void;
    onSelectSlot?: (slotIndex: number) => void;
    onContextAction?: () => void;
    onConsumeAction?: () => void;
    onToggleInventory?: () => void;
    onEscape?: () => void;
    onIsModalOpen?: () => boolean;
  }) {
    this.onQuickSaveCallback = callbacks.onQuickSave;
    this.onQuickLoadCallback = callbacks.onQuickLoad;
    this.onSelectSlotCallback = callbacks.onSelectSlot;
    this.onContextActionCallback = callbacks.onContextAction;
    this.onConsumeActionCallback = callbacks.onConsumeAction;
    this.onToggleInventoryCallback = callbacks.onToggleInventory;
    this.onEscapeCallback = callbacks.onEscape;
    this.onIsModalOpenCallback = callbacks.onIsModalOpen;
  }

  private windowBlurHandler = () => this.activeKeys.clear();

  public attach(target: Window | HTMLElement = window): void {
    target.addEventListener('keydown', this.keyDownHandler as EventListener);
    target.addEventListener('keyup', this.keyUpHandler as EventListener);
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.windowBlurHandler);
    }
  }

  public detach(target: Window | HTMLElement = window): void {
    target.removeEventListener('keydown', this.keyDownHandler as EventListener);
    target.removeEventListener('keyup', this.keyUpHandler as EventListener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.windowBlurHandler);
    }
    this.activeKeys.clear();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;

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
    } else if (e.code === 'Digit0') {
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
      } else {
        this.sim.pause();
      }
    } else if (e.code === 'Period') {
      e.preventDefault();
      // Step 1 tick while paused
      this.sim.step(true);
    } else if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.onQuickSaveCallback?.();
    } else if (e.code === 'KeyL' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.onQuickLoadCallback?.();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.activeKeys.delete(e.code);
  }

  /**
   * Updates virtual joystick direction vector (-1.0 to 1.0).
   */
  public setTouchJoystick(dx: number, dy: number): void {
    this.touchDx = dx;
    this.touchDy = dy;
  }

  public triggerContextAction(): void {
    if (!this.enabled) return;
    this.onContextActionCallback?.();
  }

  public triggerConsumeAction(): void {
    if (!this.enabled || this.onIsModalOpenCallback?.()) return;
    this.onConsumeActionCallback?.();
  }

  public triggerToggleInventory(): void {
    if (!this.enabled) return;
    this.onToggleInventoryCallback?.();
  }

  /**
   * Called every animation frame to poll active continuous movement keys.
   * If movement keys or virtual joystick are active, enqueues an authoritative MOVE command.
   */
  public update(): void {
    if (!this.enabled || this.sim.playerEntityId === 0 || this.sim.isPaused || this.onIsModalOpenCallback?.()) {
      return;
    }

    let dx = this.touchDx;
    let dy = this.touchDy;

    if (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp')) dy -= 1;
    if (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown')) dy += 1;
    if (this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft')) dx -= 1;
    if (this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight')) dx += 1;

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
