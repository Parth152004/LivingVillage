/**
 * Authoritative NPC Component.
 * 
 * Defines village resident identity, vocation, daily schedule, and friendship.
 */
export interface NPCComponent {
  npcId: string;
  name: string;
  role: 'elder' | 'shopkeeper' | 'blacksmith';
  title: string;
  portraitIcon: string;
  friendshipPoints: number; // 0 - 2500 (10 hearts * 250)
  talkedToday: boolean;
  dialoguePool: readonly string[];
}

export function createNPCComponent(
  npcId: string,
  name: string,
  role: 'elder' | 'shopkeeper' | 'blacksmith',
  title: string,
  portraitIcon: string,
  dialoguePool: readonly string[]
): NPCComponent {
  return {
    npcId,
    name,
    role,
    title,
    portraitIcon,
    friendshipPoints: 250, // 1 starting heart
    talkedToday: false,
    dialoguePool
  };
}
