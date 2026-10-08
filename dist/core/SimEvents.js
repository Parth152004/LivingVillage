/**
 * Deterministic Simulation Event Mechanism.
 *
 * Events are immutable data records emitted during simulation ticks.
 * No arbitrary or asynchronous callbacks are executed inside the authoritative simulation.
 */
export class SimEventManager {
    nextEventId = 1;
    currentTickEvents = [];
    eventHistory = [];
    maxHistorySize;
    constructor(maxHistorySize = 1000) {
        this.maxHistorySize = maxHistorySize;
    }
    /**
     * Emits an authoritative event during the current simulation tick.
     */
    emit(tick, type, params = {}) {
        const event = {
            eventId: this.nextEventId++,
            tick,
            type,
            ...params
        };
        this.currentTickEvents.push(event);
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
        return event;
    }
    /**
     * Returns all events emitted during the active tick.
     */
    getCurrentTickEvents() {
        return this.currentTickEvents;
    }
    /**
     * Clears the active tick event buffer. Called at the end of each simulation tick.
     */
    endTick() {
        this.currentTickEvents = [];
    }
    /**
     * Returns recent event history for inspection and presentation queries.
     */
    getHistory() {
        return this.eventHistory;
    }
    getEventsOfType(type) {
        return this.eventHistory.filter(e => e.type === type);
    }
    clear() {
        this.nextEventId = 1;
        this.currentTickEvents = [];
        this.eventHistory = [];
    }
    getSnapshot() {
        return {
            nextEventId: this.nextEventId,
            eventHistory: JSON.parse(JSON.stringify(this.eventHistory))
        };
    }
    restoreSnapshot(snapshot) {
        this.nextEventId = snapshot.nextEventId;
        this.currentTickEvents = [];
        this.eventHistory = JSON.parse(JSON.stringify(snapshot.eventHistory));
    }
}
