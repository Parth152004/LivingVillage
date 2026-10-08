import { EntityId } from '../ecs/EntityIdAllocator.js';

/**
 * Authoritative Player Command Pipeline.
 * 
 * Guarantees that external input or presentation layers cannot directly mutate simulation state.
 * All commands are validated, queued, and processed deterministically at tick boundaries.
 */

export type CommandType =
  | 'MOVE'
  | 'INTERACT'
  | 'TILL'
  | 'SOW'
  | 'WATER'
  | 'HARVEST'
  | 'PICKUP'
  | 'DROP'
  | 'TALK'
  | 'USE'
  | 'SLEEP'
  | 'WORK'
  | 'REFILL_WATER'
  | 'CONSUME'
  | 'SHIP_ITEM'
  | 'BUY_SEED'
  | 'PET_ANIMAL'
  | 'TALK_NPC'
  | 'CLAIM_QUEST'
  | 'TEST_COMMAND'; // Test command for Phase 1A verification

export interface PlayerCommand {
  commandId: number;
  tick: number; // Scheduled simulation tick
  type: CommandType;
  issuerEntityId: EntityId;
  targetTileX?: number;
  targetTileY?: number;
  targetEntityId?: EntityId;
  slotIndex?: number;
  payload?: Record<string, any>;
}

export interface CommandValidationResult {
  isValid: boolean;
  reason?: string;
}

export type CommandHandler = (command: PlayerCommand, simContext: any) => boolean;

export class CommandQueue {
  private nextCommandId: number = 1;
  private pendingQueue: PlayerCommand[] = [];
  private handlers: Map<CommandType, CommandHandler> = new Map();

  /**
   * Registers an authoritative execution handler for a command type.
   */
  public registerHandler(type: CommandType, handler: CommandHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Enqueues a command after basic structural validation.
   */
  public enqueue(
    tick: number,
    type: CommandType,
    issuerEntityId: EntityId,
    params: {
      targetTileX?: number;
      targetTileY?: number;
      targetEntityId?: EntityId;
      slotIndex?: number;
      payload?: Record<string, any>;
    } = {}
  ): { commandId: number; result: CommandValidationResult } {
    const validation = this.validateStructure(tick, type, issuerEntityId, params);
    if (!validation.isValid) {
      return { commandId: 0, result: validation };
    }

    const command: PlayerCommand = {
      commandId: this.nextCommandId++,
      tick,
      type,
      issuerEntityId,
      ...params
    };

    this.pendingQueue.push(command);
    return { commandId: command.commandId, result: { isValid: true } };
  }

  private validateStructure(
    tick: number,
    type: CommandType,
    issuerEntityId: EntityId,
    params: any
  ): CommandValidationResult {
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
  public getPendingForTick(currentTick: number): PlayerCommand[] {
    const ready = this.pendingQueue.filter(cmd => cmd.tick <= currentTick);
    // Sort deterministically by commandId
    return ready.sort((a, b) => a.commandId - b.commandId);
  }

  /**
   * Removes processed commands from the pending queue.
   */
  public removeProcessed(commandIds: Set<number>): void {
    this.pendingQueue = this.pendingQueue.filter(cmd => !commandIds.has(cmd.commandId));
  }

  /**
   * Dispatches and executes a single command against registered handler.
   */
  public execute(command: PlayerCommand, simContext: any): boolean {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      // In Phase 1A, unhandled gameplay commands fail cleanly without throwing
      return false;
    }
    return handler(command, simContext);
  }

  public get pendingCount(): number {
    return this.pendingQueue.length;
  }

  public clear(): void {
    this.pendingQueue = [];
    this.nextCommandId = 1;
  }

  public getSnapshot(): PlayerCommand[] {
    return JSON.parse(JSON.stringify(this.pendingQueue));
  }

  public restoreSnapshot(commands: PlayerCommand[]): void {
    this.pendingQueue = JSON.parse(JSON.stringify(commands));
    let maxId = 0;
    for (const cmd of this.pendingQueue) {
      if (cmd.commandId > maxId) maxId = cmd.commandId;
    }
    this.nextCommandId = maxId + 1;
  }
}
