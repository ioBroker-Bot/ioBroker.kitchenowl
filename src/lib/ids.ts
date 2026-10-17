/**
 * Everything outside this set becomes an underscore.
 *
 * ioBroker's own blocklist is narrower, but an allowlist keeps ids predictable:
 * KitchenOwl names routinely contain emoji, and a category named with one
 * should not produce an object id that is awkward to type in a script.
 */
const ALLOWED_CHARS = /[^A-Za-z0-9_-]/g;

/** Combining marks left behind by the NFKD decomposition. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Turns arbitrary text into a safe ioBroker object id segment.
 *
 * Diacritics are folded rather than dropped, so a name like "Muesli" spelled
 * with an umlaut keeps all of its letters, and the fallback keeps the result
 * non-empty for names made entirely of emoji or punctuation.
 *
 * @param value - Text to convert
 * @param fallback - Used when nothing printable survives
 */
export function toId(value: string, fallback = 'unknown'): string {
	const normalized = value
		.normalize('NFKD')
		.replace(COMBINING_MARKS, '')
		.replace(ALLOWED_CHARS, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '');

	return normalized.length > 0 ? normalized : fallback;
}

/** The parts of a member that identify it; satisfied by the full Member type. */
export interface IdentifiableMember {
	id: number;
	username?: string;
	name?: string;
}

/**
 * Id segment for a household member, preferring the stable username.
 *
 * @param member - Member to build an id for
 */
export function memberId(member: IdentifiableMember): string {
	return toId(member.username || member.name || '', `user_${member.id}`);
}

/**
 * Rounds a float to two decimals, for the balances the API returns unrounded.
 *
 * @param value - Value to publish
 */
export function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Converts the API's epoch-millisecond timestamps into something safe to store.
 *
 * @param value - Timestamp from the API
 */
export function toTimestamp(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
