/**
 * Authoritative Bed Component.
 * 
 * Tags an entity as an authoritative homestead bed capable of being targeted by the SLEEP command.
 */
export interface BedComponent {
  isOccupied: boolean;
}
