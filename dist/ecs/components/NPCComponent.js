export function createNPCComponent(npcId, name, role, title, portraitIcon, dialoguePool) {
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
