/**
 * Deterministic Simulation Event Mechanism.
 * 
 * Events are immutable data records emitted during simulation ticks.
 * No arbitrary or asynchronous callbacks are executed inside the authoritative simulation.
 */

export interface SimEvent {
  eventId: number;
  tick: number;
  type: string;
  actorEntityId?: number | undefined;
  targetEntityId?: number | undefined;
  tileX?: number | undefined;
  tileY?: number | undefined;
  payload?: Record<string, any> | undefined;
}

export interface SimEventsSnapshot {
  nextEventId: number;
  eventHistory: SimEvent[];
}

export class SimEventManager {
  private nextEventId: number = 1;
  private currentTickEvents: SimEvent[] = [];
  private eventHistory: SimEvent[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Emits an authoritative event during the current simulation tick.
   */
  public emit(tick: number, type: string, params: {
    actorEntityId?: number | undefined;
    targetEntityId?: number | undefined;
    tileX?: number | undefined;
    tileY?: number | undefined;
    payload?: Record<string, any> | undefined;
  } = {}): SimEvent {
    const event: SimEvent = {
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
  public getCurrentTickEvents(): readonly SimEvent[] {
    return this.currentTickEvents;
  }

  /**
   * Clears the active tick event buffer. Called at the end of each simulation tick.
   */
  public endTick(): void {
    this.currentTickEvents = [];
  }

  /**
   * Returns recent event history for inspection and presentation queries.
   */
  public getHistory(): readonly SimEvent[] {
    return this.eventHistory;
  }

  public getEventsOfType(type: string): SimEvent[] {
    return this.eventHistory.filter(e => e.type === type);
  }

  public clear(): void {
    this.nextEventId = 1;
    this.currentTickEvents = [];
    this.eventHistory = [];
  }

  public getSnapshot(): SimEventsSnapshot {
    return {
      nextEventId: this.nextEventId,
      eventHistory: JSON.parse(JSON.stringify(this.eventHistory))
    };
  }

  public restoreSnapshot(snapshot: SimEventsSnapshot): void {
    this.nextEventId = snapshot.nextEventId;
    this.currentTickEvents = [];
    this.eventHistory = JSON.parse(JSON.stringify(snapshot.eventHistory));
  }
}
