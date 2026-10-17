import type { KitchenOwlClient } from './api';

/** Everything a write command needs to reach the server and report back. */
export interface CommandContext {
	client: KitchenOwlClient;
	log: ioBroker.Logger;
}

/** A parsed writable state id, e.g. `households.1.shoppingLists.2.items.3.remove`. */
export interface ParsedCommand {
	householdId: number;
	kind:
		| 'shoppingList.addItemByName'
		| 'shoppingList.clear'
		| 'shoppingList.item.remove'
		| 'shoppingList.item.description'
		| 'expenses.add'
		| 'expenses.recalculateBalances'
		| 'planner.addRecipe'
		| 'planner.day.remove'
		| 'recipes.scrapeUrl';
	shoppingListId?: number;
	itemId?: number;
	day?: number;
}

/**
 * Turns a namespace-relative state id into a command description.
 *
 * Returns null for ids the adapter does not treat as commands, so the caller
 * can ignore acknowledged values and states it merely subscribed to.
 *
 * @param relativeId - State id without the adapter namespace
 */
export function parseCommand(relativeId: string): ParsedCommand | null {
	const parts = relativeId.split('.');
	if (parts[0] !== 'households' || parts.length < 3) {
		return null;
	}

	const householdId = Number(parts[1]);
	if (!Number.isFinite(householdId)) {
		return null;
	}

	const [, , branch, ...rest] = parts;

	if (branch === 'shoppingLists') {
		const shoppingListId = Number(rest[0]);
		if (!Number.isFinite(shoppingListId)) {
			return null;
		}

		if (rest[1] === 'addItemByName') {
			return { householdId, kind: 'shoppingList.addItemByName', shoppingListId };
		}
		if (rest[1] === 'clear') {
			return { householdId, kind: 'shoppingList.clear', shoppingListId };
		}
		if (rest[1] === 'items' && rest.length === 4) {
			const itemId = Number(rest[2]);
			if (!Number.isFinite(itemId)) {
				return null;
			}
			if (rest[3] === 'remove') {
				return { householdId, kind: 'shoppingList.item.remove', shoppingListId, itemId };
			}
			if (rest[3] === 'description') {
				return { householdId, kind: 'shoppingList.item.description', shoppingListId, itemId };
			}
		}
		return null;
	}

	if (branch === 'expenses') {
		if (rest[0] === 'add') {
			return { householdId, kind: 'expenses.add' };
		}
		if (rest[0] === 'recalculateBalances') {
			return { householdId, kind: 'expenses.recalculateBalances' };
		}
		return null;
	}

	if (branch === 'planner') {
		if (rest[0] === 'addRecipe') {
			return { householdId, kind: 'planner.addRecipe' };
		}
		if (rest[0] === 'days' && rest[2] === 'remove') {
			const day = Number(rest[1]);
			return Number.isFinite(day) ? { householdId, kind: 'planner.day.remove', day } : null;
		}
		return null;
	}

	if (branch === 'recipes' && rest[0] === 'scrapeUrl') {
		return { householdId, kind: 'recipes.scrapeUrl' };
	}

	return null;
}

/**
 * Parses a JSON command payload, raising a readable error for bad input.
 *
 * @param value - Value to publish
 * @param what - Name of the command, used in the error message
 */
export function parseJsonPayload(value: unknown, what: string): Record<string, unknown> {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`${what} expects a JSON object as a string`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error(`${what} received a value that is not valid JSON`);
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${what} expects a JSON object`);
	}
	return parsed as Record<string, unknown>;
}

/**
 * Executes a write command against KitchenOwl.
 *
 * Resolving the planner day back to a recipe id needs the current plan, so the
 * caller supplies a lookup rather than this module re-reading it.
 *
 * @param context - Client and logger
 * @param command - Parsed command
 * @param value - The value written to the state
 * @param recipeIdForDay - Resolves a weekday to the recipe planned on it
 */
export async function runCommand(
	context: CommandContext,
	command: ParsedCommand,
	value: ioBroker.StateValue,
	recipeIdForDay: (householdId: number, day: number) => number | undefined,
): Promise<unknown> {
	const { client } = context;

	switch (command.kind) {
		case 'shoppingList.addItemByName': {
			const name = String(value ?? '').trim();
			if (!name) {
				throw new Error('Adding an item needs a non-empty name');
			}
			return client.addShoppingListItemByName(command.shoppingListId!, name);
		}

		case 'shoppingList.clear':
			return client.clearShoppingList(command.shoppingListId!);

		case 'shoppingList.item.remove':
			return client.removeShoppingListItem(command.shoppingListId!, command.itemId!);

		case 'shoppingList.item.description':
			return client.updateShoppingListItemDescription(
				command.shoppingListId!,
				command.itemId!,
				String(value ?? ''),
			);

		case 'expenses.add': {
			const payload = parseJsonPayload(value, 'Adding an expense');
			if (typeof payload.name !== 'string' || typeof payload.amount !== 'number') {
				throw new Error('Adding an expense needs at least a "name" string and an "amount" number');
			}
			return client.addExpense(command.householdId, payload);
		}

		case 'expenses.recalculateBalances':
			return client.recalculateBalances(command.householdId);

		case 'planner.addRecipe': {
			const payload = parseJsonPayload(value, 'Planning a recipe');
			if (typeof payload.recipe_id !== 'number') {
				throw new Error('Planning a recipe needs a "recipe_id" number');
			}
			return client.addPlannedRecipe(command.householdId, payload);
		}

		case 'planner.day.remove': {
			const recipeId = recipeIdForDay(command.householdId, command.day!);
			if (recipeId === undefined) {
				throw new Error(`No recipe is planned for day ${command.day}`);
			}
			return client.removePlannedRecipe(command.householdId, recipeId);
		}

		case 'recipes.scrapeUrl': {
			const url = String(value ?? '').trim();
			if (!/^https?:\/\/.+/.test(url)) {
				throw new Error('Importing a recipe needs an http or https URL');
			}
			return client.scrapeRecipe(command.householdId, url);
		}
	}
}
