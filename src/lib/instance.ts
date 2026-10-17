import type { Household } from './types';

/** The households a poll should read, and the configured ids that were not found. */
export interface HouseholdSelection {
	selected: Household[];
	/** Configured ids the token cannot see, so the caller can warn about them. */
	missing: number[];
}

/**
 * Narrows the households the token can see down to the configured ones.
 *
 * An empty or unset configuration means every household, which is what someone
 * who never opened the households tab expects.
 *
 * @param all - Every household the token can see
 * @param configured - Household ids from the instance configuration
 */
export function selectHouseholds(all: Household[], configured: readonly string[] | undefined): HouseholdSelection {
	// An empty entry in the list would otherwise become household 0 and be
	// reported as missing on every poll.
	const wanted = (configured ?? []).map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0);

	if (wanted.length === 0) {
		return { selected: all, missing: [] };
	}

	return {
		selected: all.filter(household => wanted.includes(household.id)),
		missing: wanted.filter(id => !all.some(household => household.id === id)),
	};
}

/** The parts of the instance configuration a throwaway client falls back to. */
export interface ConnectionDefaults {
	url?: string;
	token?: string;
	requestTimeout?: number;
	rejectUnauthorized?: boolean;
}

/** Everything needed to open a connection, resolved from a message and the configuration. */
export interface ConnectionOptions {
	url: string;
	token: string;
	timeout: number;
	rejectUnauthorized: boolean;
}

/**
 * Resolves the connection details for a client built from a message.
 *
 * The admin UI sends whatever is currently typed into the form, which may be
 * incomplete and is not to be trusted field by field, so every value falls back
 * to the saved configuration. A script that sends an empty message gets the
 * configured instance, TLS setting included.
 *
 * @param message - Payload sent with the message
 * @param defaults - Saved instance configuration
 */
export function connectionOptions(message: unknown, defaults: ConnectionDefaults): ConnectionOptions {
	const payload = (typeof message === 'object' && message !== null ? message : {}) as Record<string, unknown>;

	const text = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback).trim();

	const url = text(payload.url, defaults.url ?? '');
	const token = text(payload.token, defaults.token ?? '');

	if (!url || !token) {
		throw new Error('Please enter the server URL and an API token first');
	}

	return {
		url,
		token,
		timeout: Number(payload.requestTimeout) || defaults.requestTimeout || 10000,
		rejectUnauthorized:
			typeof payload.rejectUnauthorized === 'boolean'
				? payload.rejectUnauthorized
				: (defaults.rejectUnauthorized ?? true),
	};
}
