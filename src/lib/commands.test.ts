import { expect } from 'chai';

import { parseCommand, parseJsonPayload, runCommand } from './commands';
import type { KitchenOwlClient } from './api';

describe('commands', () => {
	describe('parseCommand', () => {
		it('recognises every shopping list command', () => {
			expect(parseCommand('households.1.shoppingLists.2.addItemByName')).to.deep.equal({
				householdId: 1,
				kind: 'shoppingList.addItemByName',
				shoppingListId: 2,
			});
			expect(parseCommand('households.1.shoppingLists.2.clear')).to.deep.equal({
				householdId: 1,
				kind: 'shoppingList.clear',
				shoppingListId: 2,
			});
			expect(parseCommand('households.1.shoppingLists.2.items.10.remove')).to.deep.equal({
				householdId: 1,
				kind: 'shoppingList.item.remove',
				shoppingListId: 2,
				itemId: 10,
			});
			expect(parseCommand('households.1.shoppingLists.2.items.10.description')).to.deep.equal({
				householdId: 1,
				kind: 'shoppingList.item.description',
				shoppingListId: 2,
				itemId: 10,
			});
		});

		it('recognises the expense, planner and recipe commands', () => {
			expect(parseCommand('households.3.expenses.add')?.kind).to.equal('expenses.add');
			expect(parseCommand('households.3.expenses.recalculateBalances')?.kind).to.equal(
				'expenses.recalculateBalances',
			);
			expect(parseCommand('households.3.planner.addRecipe')?.kind).to.equal('planner.addRecipe');
			expect(parseCommand('households.3.planner.days.4.remove')).to.deep.equal({
				householdId: 3,
				kind: 'planner.day.remove',
				day: 4,
			});
			expect(parseCommand('households.3.recipes.scrapeUrl')?.kind).to.equal('recipes.scrapeUrl');
		});

		it('ignores read-only states and anything outside the households branch', () => {
			expect(parseCommand('info.connection')).to.equal(null);
			expect(parseCommand('commands.refresh')).to.equal(null);
			expect(parseCommand('households.1.name')).to.equal(null);
			expect(parseCommand('households.1.shoppingLists.2.itemCount')).to.equal(null);
			expect(parseCommand('households.1.members.alice.balance')).to.equal(null);
			expect(parseCommand('households')).to.equal(null);
		});

		it('rejects ids whose numeric segments are not numbers', () => {
			expect(parseCommand('households.abc.expenses.add')).to.equal(null);
			expect(parseCommand('households.1.shoppingLists.xyz.clear')).to.equal(null);
			expect(parseCommand('households.1.shoppingLists.2.items.xyz.remove')).to.equal(null);
		});
	});

	describe('parseJsonPayload', () => {
		it('accepts a JSON object', () => {
			expect(parseJsonPayload('{"a":1}', 'Test')).to.deep.equal({ a: 1 });
		});

		it('rejects empty input, invalid JSON, arrays and scalars', () => {
			expect(() => parseJsonPayload('', 'Test')).to.throw('JSON object as a string');
			expect(() => parseJsonPayload(42, 'Test')).to.throw('JSON object as a string');
			expect(() => parseJsonPayload('{nope}', 'Test')).to.throw('not valid JSON');
			expect(() => parseJsonPayload('[1,2]', 'Test')).to.throw('expects a JSON object');
			expect(() => parseJsonPayload('"text"', 'Test')).to.throw('expects a JSON object');
		});
	});

	describe('runCommand', () => {
		/** Records which client method a command reached, without any network. */
		const spyClient = (): { calls: unknown[][]; client: KitchenOwlClient } => {
			const calls: unknown[][] = [];
			const record =
				(name: string) =>
				(...args: unknown[]): Promise<unknown> => {
					calls.push([name, ...args]);
					return Promise.resolve(undefined);
				};

			const client = {
				addShoppingListItemByName: record('addShoppingListItemByName'),
				removeShoppingListItem: record('removeShoppingListItem'),
				clearShoppingList: record('clearShoppingList'),
				updateShoppingListItemDescription: record('updateShoppingListItemDescription'),
				addExpense: record('addExpense'),
				recalculateBalances: record('recalculateBalances'),
				addPlannedRecipe: record('addPlannedRecipe'),
				removePlannedRecipe: record('removePlannedRecipe'),
				scrapeRecipe: record('scrapeRecipe'),
			} as unknown as KitchenOwlClient;

			return { calls, client };
		};

		const context = (client: KitchenOwlClient): { client: KitchenOwlClient; log: ioBroker.Logger } => ({
			client,
			log: { silly() {}, debug() {}, info() {}, warn() {}, error() {}, level: 'info' },
		});

		const noPlan = (): undefined => undefined;

		it('adds a shopping list item', async () => {
			const { calls, client } = spyClient();
			await runCommand(
				context(client),
				parseCommand('households.1.shoppingLists.2.addItemByName')!,
				'Bread',
				noPlan,
			);

			expect(calls).to.deep.equal([['addShoppingListItemByName', 2, 'Bread']]);
		});

		it('refuses to add an item with a blank name', async () => {
			const { calls, client } = spyClient();
			const command = parseCommand('households.1.shoppingLists.2.addItemByName')!;

			await expect(runCommand(context(client), command, '   ', noPlan)).to.be.rejectedWith('non-empty name');
			expect(calls).to.be.empty;
		});

		it('requires the mandatory fields when adding an expense', async () => {
			const { calls, client } = spyClient();
			const command = parseCommand('households.1.expenses.add')!;

			await expect(runCommand(context(client), command, '{"name":"Shop"}', noPlan)).to.be.rejectedWith(
				'"amount" number',
			);
			expect(calls).to.be.empty;

			await runCommand(context(client), command, '{"name":"Shop","amount":9.5}', noPlan);
			expect(calls).to.deep.equal([['addExpense', 1, { name: 'Shop', amount: 9.5 }]]);
		});

		it('requires a recipe id when planning a meal', async () => {
			const { client } = spyClient();
			const command = parseCommand('households.1.planner.addRecipe')!;

			await expect(runCommand(context(client), command, '{"cooking_date":1}', noPlan)).to.be.rejectedWith(
				'"recipe_id" number',
			);
		});

		it('resolves a planner day to the recipe currently planned on it', async () => {
			const { calls, client } = spyClient();
			const command = parseCommand('households.1.planner.days.2.remove')!;

			await runCommand(context(client), command, true, (householdId, day) =>
				householdId === 1 && day === 2 ? 20 : undefined,
			);

			expect(calls).to.deep.equal([['removePlannedRecipe', 1, 20]]);
		});

		it('explains itself when nothing is planned on the chosen day', async () => {
			const { client } = spyClient();
			const command = parseCommand('households.1.planner.days.5.remove')!;

			await expect(runCommand(context(client), command, true, noPlan)).to.be.rejectedWith(
				'No recipe is planned for day 5',
			);
		});

		it('only imports recipes from http URLs', async () => {
			const { calls, client } = spyClient();
			const command = parseCommand('households.1.recipes.scrapeUrl')!;

			await expect(runCommand(context(client), command, 'not-a-url', noPlan)).to.be.rejectedWith(
				'http or https URL',
			);

			await runCommand(context(client), command, 'https://example.invalid/r', noPlan);
			expect(calls).to.deep.equal([['scrapeRecipe', 1, 'https://example.invalid/r']]);
		});
	});
});
