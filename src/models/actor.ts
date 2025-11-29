/**
 * Actor Model
 *
 * Represents an individual who performs MR events.
 */

/**
 * Actor roles in MR context
 */
export enum ActorRole {
  AUTHOR = 'Author',               // MR author
  AI_REVIEWER = 'AI Reviewer',     // AI bot reviewer
  REVIEWER = 'Reviewer',           // Human reviewer
  SYSTEM = 'System',               // System-generated events
}

/**
 * Actor - represents an individual performing MR events
 */
export interface Actor {
  id: number;              // GitLab user ID
  username: string;        // GitLab username
  name: string;            // Display name
  role: ActorRole;         // Role in this MR
  isAIBot: boolean;        // Whether this is an AI bot
}

/**
 * Validates an actor
 */
export function validateActor(actor: Actor): boolean {
  if (!actor.username || actor.username.trim() === '') {
    return false;
  }

  if (!actor.name || actor.name.trim() === '') {
    return false;
  }

  // Author priority rule: even if AI bot, if author, role should be AUTHOR
  // This validation is handled in role determination logic

  return true;
}

/**
 * Creates an actor from GitLab user data
 */
export function createActor(
  userId: number,
  username: string,
  name: string,
  role: ActorRole,
  isAIBot: boolean
): Actor {
  return {
    id: userId,
    username,
    name,
    role,
    isAIBot,
  };
}
