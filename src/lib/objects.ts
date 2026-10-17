import type * as utils from '@iobroker/adapter-core';

import { localize } from './i18n';

/** A state the adapter owns, described once and reused for create and write. */
export interface StateDef {
	/** Id relative to the adapter namespace. */
	id: string;
	name: string;
	type: ioBroker.CommonType;
	/**
	 * ioBroker state role. Always something meaningful such as `value.time`,
	 * `text`, `json` or `button`; a bare `state` is rejected by the adapter
	 * checker when an adapter is submitted to the ioBroker repository.
	 */
	role: string;
	value?: ioBroker.StateValue;
	unit?: string;
	read?: boolean;
	write?: boolean;
	states?: Record<string, string>;
}

/** A channel or folder grouping states. */
export interface ChannelDef {
	id: string;
	name: string;
	type?: 'channel' | 'device' | 'folder';
}

/**
 * Collects the objects and values one poll produced, then applies them.
 *
 * Writing goes through `setStateChanged` so that an unchanged poll does not
 * churn the states database, and object creation uses `setObjectNotExistsAsync`
 * so that names a user edited in the admin UI survive.
 */
export class ObjectWriter {
	private readonly channels: ChannelDef[] = [];
	private readonly states: StateDef[] = [];
	/** Every id this run touched, used to find objects that disappeared upstream. */
	private readonly seen = new Set<string>();

	/**
	 * @param adapter - Adapter instance the objects belong to
	 */
	public constructor(private readonly adapter: utils.AdapterInstance) {}

	/**
	 * Declares a grouping node.
	 *
	 * @param id - Namespace-relative object id
	 * @param name - Human readable name shown in the object tree
	 * @param type - Channel, device or folder
	 */
	public channel(id: string, name: string, type: ChannelDef['type'] = 'channel'): void {
		this.channels.push({ id, name, type });
		this.seen.add(id);
	}

	/**
	 * Declares a state and, when the definition carries one, its value.
	 *
	 * @param def - State description to create and write
	 */
	public state(def: StateDef): void {
		this.states.push(def);
		this.seen.add(def.id);
	}

	/**
	 * Convenience for a read-only state carrying a value.
	 *
	 * @param id - Namespace-relative object id
	 * @param name - Human readable name shown in the object tree
	 * @param type - ioBroker state or channel type
	 * @param role - ioBroker state role
	 * @param value - Value to publish
	 * @param unit - Optional unit shown next to the value
	 */
	public value(
		id: string,
		name: string,
		type: ioBroker.CommonType,
		role: string,
		value: ioBroker.StateValue,
		unit?: string,
	): void {
		this.state({ id, name, type, role, value, unit, read: true, write: false });
	}

	/**
	 * Convenience for a read-only state holding a JSON document.
	 *
	 * @param id - Namespace-relative object id
	 * @param name - Human readable name shown in the object tree
	 * @param payload - Value to serialise into the state
	 */
	public json(id: string, name: string, payload: unknown): void {
		this.state({
			id,
			name,
			type: 'string',
			role: 'json',
			value: JSON.stringify(payload ?? null),
			read: true,
			write: false,
		});
	}

	/**
	 * Convenience for a writable command button.
	 *
	 * @param id - Namespace-relative object id
	 * @param name - Human readable name shown in the object tree
	 */
	public button(id: string, name: string): void {
		this.state({ id, name, type: 'boolean', role: 'button', value: undefined, read: false, write: true });
	}

	/**
	 * Marks an id as still alive without writing to it, so pruning leaves it alone.
	 *
	 * @param id - Namespace-relative object id
	 */
	public keep(id: string): void {
		this.seen.add(id);
	}

	/**
	 * Whether this run already touched an id.
	 *
	 * @param id - Namespace-relative object id
	 */
	public has(id: string): boolean {
		return this.seen.has(id);
	}

	/** Creates any missing objects and writes every collected value. */
	public async flush(): Promise<void> {
		for (const channel of this.channels) {
			await this.adapter.setObjectNotExistsAsync(channel.id, {
				type: channel.type ?? 'channel',
				common: { name: localize(channel.name) },
				native: {},
			});
		}

		for (const def of this.states) {
			await this.adapter.setObjectNotExistsAsync(def.id, {
				type: 'state',
				common: {
					name: localize(def.name),
					type: def.type,
					role: def.role,
					read: def.read ?? true,
					write: def.write ?? false,
					...(def.unit ? { unit: def.unit } : {}),
					...(def.states ? { states: def.states } : {}),
				},
				native: {},
			});

			// Buttons and other pure command states carry no value to publish.
			if (def.value !== undefined) {
				await this.adapter.setStateChangedAsync(def.id, { val: def.value, ack: true });
			}
		}
	}

	/**
	 * Deletes objects below `prefix` that this run did not touch.
	 *
	 * This is what keeps the tree honest when a shopping list, recipe or member
	 * is removed in KitchenOwl. Only branches the adapter manages are considered.
	 *
	 * @param prefixes - Namespace-relative prefixes to prune within
	 */
	public async prune(prefixes: string[]): Promise<number> {
		const existing = await this.adapter.getAdapterObjectsAsync();
		const namespacePrefix = `${this.adapter.namespace}.`;
		const stale: string[] = [];

		for (const fullId of Object.keys(existing)) {
			if (!fullId.startsWith(namespacePrefix)) {
				continue;
			}
			const relativeId = fullId.slice(namespacePrefix.length);

			if (!prefixes.some(prefix => relativeId === prefix || relativeId.startsWith(`${prefix}.`))) {
				continue;
			}
			if (this.seen.has(relativeId)) {
				continue;
			}
			stale.push(relativeId);
		}

		// Delete parents first: a recursive delete of a channel takes its
		// children with it, so the children below it need no second pass.
		stale.sort((a, b) => a.length - b.length);

		let deleted = 0;
		for (const id of stale) {
			// Skip anything already removed as part of a parent's recursive delete.
			if (stale.some(other => other !== id && id.startsWith(`${other}.`) && id.length > other.length)) {
				continue;
			}
			try {
				await this.adapter.delObjectAsync(id, { recursive: true });
				deleted++;
			} catch (error) {
				this.adapter.log.warn(`Could not delete stale object ${id}: ${(error as Error).message}`);
			}
		}

		return deleted;
	}
}
