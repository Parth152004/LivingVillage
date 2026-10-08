export class CommandQueue {
    nextCommandId = 1;
    pendingQueue = [];
    handlers = new Map();
    /**
     * Registers an authoritative execution handler for a command type.
     */
    registerHandler(type, handler) {
        this.handlers.set(type, handler);
    }
    /**
     * Enqueues a command after basic structural validation.
     */
    enqueue(tick, type, issuerEntityId, params = {}) {
        const validation = this.validateStructure(tick, type, issuerEntityId, params);
        if (!validation.isValid) {
            return { commandId: 0, result: validation };
        }
        const command = {
            commandId: this.nextCommandId++,
            tick,
            type,
            issuerEntityId,
            ...params
        };
        this.pendingQueue.push(command);
        return { commandId: command.commandId, result: { isValid: true } };
    }
    validateStructure(tick, type, issuerEntityId, params) {
        if (tick < 0 || !Number.isInteger(tick)) {
            return { isValid: false, reason: `Command tick must be a non-negative integer, got: ${tick}` };
        }
        if (issuerEntityId <= 0 || !Number.isInteger(issuerEntityId)) {
            return { isValid: false, reason: `Issuer EntityId must be a positive integer, got: ${issuerEntityId}` };
        }
        if (!type || typeof type !== 'string') {
            return { isValid: false, reason: 'Command type is required' };
        }
        if (params.targetTileX !== undefined && !Number.isInteger(params.targetTileX)) {
            return { isValid: false, reason: 'targetTileX must be an integer if provided' };
        }
        if (params.targetTileY !== undefined && !Number.isInteger(params.targetTileY)) {
            return { isValid: false, reason: 'targetTileY must be an integer if provided' };
        }
        return { isValid: true };
    }
    /**
     * Returns all pending commands scheduled for the given tick or earlier,
     * deterministically sorted by commandId.
     */
    getPendingForTick(currentTick) {
        const ready = this.pendingQueue.filter(cmd => cmd.tick <= currentTick);
        // Sort deterministically by commandId
        return ready.sort((a, b) => a.commandId - b.commandId);
    }
    /**
     * Removes processed commands from the pending queue.
     */
    removeProcessed(commandIds) {
        this.pendingQueue = this.pendingQueue.filter(cmd => !commandIds.has(cmd.commandId));
    }
    /**
     * Dispatches and executes a single command against registered handler.
     */
    execute(command, simContext) {
        const handler = this.handlers.get(command.type);
        if (!handler) {
            // In Phase 1A, unhandled gameplay commands fail cleanly without throwing
            return false;
        }
        return handler(command, simContext);
    }
    get pendingCount() {
        return this.pendingQueue.length;
    }
    clear() {
        this.pendingQueue = [];
        this.nextCommandId = 1;
    }
    getSnapshot() {
        return JSON.parse(JSON.stringify(this.pendingQueue));
    }
    restoreSnapshot(commands) {
        this.pendingQueue = JSON.parse(JSON.stringify(commands));
        let maxId = 0;
        for (const cmd of this.pendingQueue) {
            if (cmd.commandId > maxId)
                maxId = cmd.commandId;
        }
        this.nextCommandId = maxId + 1;
    }
}
