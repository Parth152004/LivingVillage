/**
 * Authoritative Quest Engine for Green Farm.
 * 
 * Manages player farm objectives, tracks simulation milestones,
 * and distributes balanced economic and item rewards.
 */

export interface Quest {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: 'farming' | 'commerce' | 'social' | 'livestock';
  readonly actionType: 'TILL' | 'SOW' | 'HARVEST' | 'SHIP' | 'PET' | 'TALK';
  readonly targetCount: number;
  currentCount: number;
  isCompleted: boolean;
  isClaimed: boolean;
  readonly rewardGold: number;
  readonly rewardItem?: { itemId: string; quantity: number } | undefined;
}

export interface QuestRenderData {
  id: string;
  title: string;
  description: string;
  category: string;
  progressText: string;
  percent: number;
  isCompleted: boolean;
  isClaimed: boolean;
  rewardGold: number;
  rewardItemName?: string | undefined;
  rewardItemIcon?: string | undefined;
}

export const INITIAL_QUESTS: readonly Omit<Quest, 'currentCount' | 'isCompleted' | 'isClaimed'>[] = [
  {
    id: 'quest_first_furrow',
    title: 'The First Furrow',
    description: 'Use your hoe to till 3 soil plots in your field.',
    category: 'farming',
    actionType: 'TILL',
    targetCount: 3,
    rewardGold: 50,
    rewardItem: { itemId: 'seed_potato', quantity: 3 }
  },
  {
    id: 'quest_spring_sowing',
    title: 'Spring Planting',
    description: 'Sow 3 seeds into tilled soil.',
    category: 'farming',
    actionType: 'SOW',
    targetCount: 3,
    rewardGold: 50,
    rewardItem: { itemId: 'seed_carrot', quantity: 3 }
  },
  {
    id: 'quest_first_harvest',
    title: 'Bountiful Harvest',
    description: 'Care for crops until maturity and harvest 3 crops.',
    category: 'farming',
    actionType: 'HARVEST',
    targetCount: 3,
    rewardGold: 100,
    rewardItem: { itemId: 'crop_parsnip', quantity: 2 }
  },
  {
    id: 'quest_market_day',
    title: 'Market Day',
    description: 'Ship 2 crops using the shipping bin for overnight settlement.',
    category: 'commerce',
    actionType: 'SHIP',
    targetCount: 2,
    rewardGold: 150
  },
  {
    id: 'quest_village_welcome',
    title: 'Warm Welcome',
    description: 'Greet the residents of Clover Valley.',
    category: 'social',
    actionType: 'TALK',
    targetCount: 2,
    rewardGold: 100
  },
  {
    id: 'quest_gentle_touch',
    title: 'Animal Care',
    description: 'Show affection by petting your farm animals.',
    category: 'livestock',
    actionType: 'PET',
    targetCount: 2,
    rewardGold: 80
  }
];

export class QuestSystem {
  private quests: Quest[];

  constructor() {
    this.quests = INITIAL_QUESTS.map(q => ({
      ...q,
      currentCount: 0,
      isCompleted: false,
      isClaimed: false
    }));
  }

  public recordAction(actionType: 'TILL' | 'SOW' | 'HARVEST' | 'SHIP' | 'PET' | 'TALK', count: number = 1): boolean {
    let anyCompleted = false;
    for (const q of this.quests) {
      if (q.actionType === actionType && !q.isCompleted && !q.isClaimed) {
        q.currentCount = Math.min(q.targetCount, q.currentCount + count);
        if (q.currentCount >= q.targetCount) {
          q.isCompleted = true;
          anyCompleted = true;
        }
      }
    }
    return anyCompleted;
  }

  public claimReward(questId: string): { rewardGold: number; rewardItem?: { itemId: string; quantity: number } | undefined } | null {
    const q = this.quests.find(item => item.id === questId);
    if (!q || !q.isCompleted || q.isClaimed) {
      return null;
    }
    q.isClaimed = true;
    return {
      rewardGold: q.rewardGold,
      rewardItem: q.rewardItem ? { ...q.rewardItem } : undefined
    };
  }

  public getQuests(): readonly Quest[] {
    return this.quests;
  }

  public getRenderData(): QuestRenderData[] {
    return this.quests.map(q => {
      const percent = Math.min(100, Math.round((q.currentCount / q.targetCount) * 100));
      return {
        id: q.id,
        title: q.title,
        description: q.description,
        category: q.category,
        progressText: `${q.currentCount} / ${q.targetCount}`,
        percent,
        isCompleted: q.isCompleted,
        isClaimed: q.isClaimed,
        rewardGold: q.rewardGold,
        rewardItemName: q.rewardItem?.itemId.replace(/^(seed_|crop_|product_|tool_)/, '').toUpperCase(),
        rewardItemIcon: q.rewardItem ? '🎁' : undefined
      };
    });
  }

  public serialize(): any[] {
    return this.quests.map(q => ({
      id: q.id,
      currentCount: q.currentCount,
      isCompleted: q.isCompleted,
      isClaimed: q.isClaimed
    }));
  }

  public deserialize(saved: any[]): void {
    if (!Array.isArray(saved)) return;
    for (const s of saved) {
      const found = this.quests.find(q => q.id === s.id);
      if (found) {
        found.currentCount = s.currentCount ?? 0;
        found.isCompleted = !!s.isCompleted;
        found.isClaimed = !!s.isClaimed;
      }
    }
  }
}
