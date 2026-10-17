import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { KitchenOwlClient } from './api';
import { ObjectWriter } from './objects';
import { FakeAdapter } from './objects.test';
import {
	householdBase,
	type SyncConfig,
	syncCatalog,
	syncExpenses,
	syncHousehold,
	syncMembers,
	syncPlanner,
	syncRecipes,
	syncShoppingLists,
} from './sync';
import {
	type Category,
	type Expense,
	type ExpenseCategory,
	ExpenseFrame,
	type ExpenseOverview,
	ExpenseView,
	type Household,
	type Item,
	type PlannerEntry,
	type Recipe,
	type ShoppingList,
	type Tag,
} from './types';

/**
 * Loads one of the hand-written fixtures; none of them contain real data.
 *
 * @param name - Fixture file name without the extension
 */
function fixture<T>(name: string): T {
	return JSON.parse(readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', `${name}.json`), 'utf8')) as T;
}

const BASE_CONFIG: SyncConfig = {
	syncMembers: true,
	syncShoppingLists: true,
	syncRecipes: true,
	syncPlanner: true,
	syncExpenses: true,
	syncCatalog: true,
	createRecipeObjects: true,
	createShoppingItemObjects: true,
	enableWrite: false,
	expenseOverviewFrame: ExpenseFrame.Monthly,
	expenseOverviewSteps: 5,
	expenseView: ExpenseView.Household,
	expensePages: 1,
};

describe('sync', () => {
	let adapter: FakeAdapter;
	let writer: ObjectWriter;
	let client: KitchenOwlClient;

	const household = (): Household => fixture<Household>('household');
	const base = (): string => householdBase(household());

	const config = (overrides: Partial<SyncConfig> = {}): SyncConfig => ({ ...BASE_CONFIG, ...overrides });

	beforeEach(() => {
		adapter = new FakeAdapter();
		writer = new ObjectWriter(adapter.asAdapter());
		client = new KitchenOwlClient({ url: 'https://kitchenowl.invalid', token: 'test-token' });
	});

	afterEach(async () => {
		await client.destroy();
	});

	it('derives the household branch from the numeric id', () => {
		expect(base()).to.equal('households.1');
	});

	describe('syncHousehold', () => {
		it('writes the household attributes and feature flags', async () => {
			syncHousehold(writer, client, base(), household());
			await writer.flush();

			expect(adapter.states.get('households.1.name')).to.equal('Example Household');
			expect(adapter.states.get('households.1.language')).to.equal('en');
			expect(adapter.states.get('households.1.expensesFeature')).to.equal(true);
			expect(adapter.states.get('households.1.plannerFeature')).to.equal(true);
			expect(adapter.states.get('households.1.defaultShoppingListId')).to.equal(1);
			expect(adapter.states.get('households.1.photoUrl')).to.equal(
				'https://kitchenowl.invalid/api/upload/household-photo.jpg',
			);
		});

		it('turns a missing description into an empty string rather than "null"', async () => {
			syncHousehold(writer, client, base(), household());
			await writer.flush();

			expect(adapter.states.get('households.1.description')).to.equal('');
		});
	});

	describe('syncMembers', () => {
		it('writes one branch per member, keyed by username', async () => {
			syncMembers(writer, client, base(), household());
			await writer.flush();

			expect(adapter.states.get('households.1.members.count')).to.equal(2);
			expect(adapter.states.get('households.1.members.alice.name')).to.equal('Alice Example');
			expect(adapter.states.get('households.1.members.bob.username')).to.equal('bob');
		});

		it('rounds the balances the API returns as long floats', async () => {
			syncMembers(writer, client, base(), household());
			await writer.flush();

			expect(adapter.states.get('households.1.members.alice.balance')).to.equal(12.34);
			expect(adapter.states.get('households.1.members.bob.balance')).to.equal(-12.34);
			expect(JSON.parse(adapter.states.get('households.1.members.balancesJson') as string)).to.deep.equal({
				alice: 12.34,
				bob: -12.34,
			});
		});

		it('distinguishes household admin from owner', async () => {
			syncMembers(writer, client, base(), household());
			await writer.flush();

			expect(adapter.states.get('households.1.members.alice.isHouseholdAdmin')).to.equal(true);
			expect(adapter.states.get('households.1.members.alice.isOwner')).to.equal(true);
			expect(adapter.states.get('households.1.members.bob.isHouseholdAdmin')).to.equal(false);
		});
	});

	describe('syncShoppingLists', () => {
		const lists = (): ShoppingList[] => fixture<ShoppingList[]>('shoppinglists');

		it('writes a branch per list with counts and a text summary', async () => {
			syncShoppingLists(writer, base(), lists(), config());
			await writer.flush();

			expect(adapter.states.get('households.1.shoppingLists.count')).to.equal(2);
			expect(adapter.states.get('households.1.shoppingLists.1.itemCount')).to.equal(2);
			expect(adapter.states.get('households.1.shoppingLists.1.itemNames')).to.equal('Bread, Milk');
			expect(adapter.states.get('households.1.shoppingLists.2.itemCount')).to.equal(0);
		});

		it('writes a branch per item, including its category', async () => {
			syncShoppingLists(writer, base(), lists(), config());
			await writer.flush();

			expect(adapter.states.get('households.1.shoppingLists.1.items.10.name')).to.equal('Bread');
			expect(adapter.states.get('households.1.shoppingLists.1.items.10.category')).to.equal('Bakery');
			expect(adapter.states.get('households.1.shoppingLists.1.items.11.category')).to.equal('');
		});

		it('omits the per-item branches when the user turned them off', async () => {
			syncShoppingLists(writer, base(), lists(), config({ createShoppingItemObjects: false }));
			await writer.flush();

			expect(adapter.objects.has('households.1.shoppingLists.1.items.10.name')).to.equal(false);
			// The JSON state still carries every item.
			expect(JSON.parse(adapter.states.get('households.1.shoppingLists.1.json') as string)).to.have.lengthOf(2);
		});

		it('creates no writable states while write access is off', async () => {
			syncShoppingLists(writer, base(), lists(), config());
			await writer.flush();

			expect(adapter.objects.has('households.1.shoppingLists.1.addItemByName')).to.equal(false);
			expect(adapter.objects.has('households.1.shoppingLists.1.clear')).to.equal(false);
			expect(adapter.objects.get('households.1.shoppingLists.1.items.10.description')?.common.write).to.equal(
				false,
			);
		});

		it('creates the write commands once write access is on', async () => {
			syncShoppingLists(writer, base(), lists(), config({ enableWrite: true }));
			await writer.flush();

			expect(adapter.objects.get('households.1.shoppingLists.1.addItemByName')?.common.write).to.equal(true);
			expect(adapter.objects.get('households.1.shoppingLists.1.clear')?.common.role).to.equal('button');
			expect(adapter.objects.get('households.1.shoppingLists.1.items.10.remove')?.common.role).to.equal('button');
			expect(adapter.objects.get('households.1.shoppingLists.1.items.10.description')?.common.write).to.equal(
				true,
			);
			expect(adapter.states.get('households.1.shoppingLists.1.items.10.description')).to.equal('2 loaves');
		});
	});

	describe('syncRecipes', () => {
		const recipes = (): Recipe[] => fixture<Recipe[]>('recipes');

		it('writes the overview and a branch per recipe', async () => {
			syncRecipes(writer, client, base(), recipes(), config());
			await writer.flush();

			expect(adapter.states.get('households.1.recipes.count')).to.equal(2);
			expect(adapter.states.get('households.1.recipes.20.name')).to.equal('Tomato Soup');
			expect(adapter.states.get('households.1.recipes.20.time')).to.equal(45);
			expect(adapter.states.get('households.1.recipes.20.yields')).to.equal(4);
			expect(adapter.states.get('households.1.recipes.20.tags')).to.equal('soup');
			expect(adapter.states.get('households.1.recipes.20.planned')).to.equal(true);
			expect(adapter.states.get('households.1.recipes.20.photoUrl')).to.equal(
				'https://kitchenowl.invalid/api/upload/soup.jpg',
			);
		});

		it('keeps the overview but skips the branches when they are turned off', async () => {
			syncRecipes(writer, client, base(), recipes(), config({ createRecipeObjects: false }));
			await writer.flush();

			expect(adapter.objects.has('households.1.recipes.20.name')).to.equal(false);
			expect(JSON.parse(adapter.states.get('households.1.recipes.json') as string)).to.have.lengthOf(2);
		});

		it('exposes the import command only with write access', async () => {
			syncRecipes(writer, client, base(), recipes(), config());
			await writer.flush();
			expect(adapter.objects.has('households.1.recipes.scrapeUrl')).to.equal(false);

			const second = new ObjectWriter(adapter.asAdapter());
			syncRecipes(second, client, base(), recipes(), config({ enableWrite: true }));
			await second.flush();
			expect(adapter.objects.get('households.1.recipes.scrapeUrl')?.common.write).to.equal(true);
		});
	});

	describe('syncPlanner', () => {
		const entries = (): PlannerEntry[] => fixture<PlannerEntry[]>('planner');

		it('fills the weekday that has a meal and leaves the others empty', async () => {
			syncPlanner(writer, base(), entries(), config());
			await writer.flush();

			expect(adapter.states.get('households.1.planner.days.2.recipeName')).to.equal('Tomato Soup');
			expect(adapter.states.get('households.1.planner.days.2.recipeId')).to.equal(20);
			expect(adapter.states.get('households.1.planner.days.2.yields')).to.equal(4);
			expect(adapter.states.get('households.1.planner.days.0.recipeName')).to.equal('');
			expect(adapter.states.get('households.1.planner.days.0.recipeId')).to.equal(0);
		});

		it('creates a channel for all seven weekdays', async () => {
			syncPlanner(writer, base(), entries(), config());
			await writer.flush();

			for (let day = 0; day < 7; day++) {
				expect(adapter.objects.has(`households.1.planner.days.${day}`), `day ${day}`).to.equal(true);
			}
		});

		it('reports the soonest planned meal, not the first in the list', async () => {
			syncPlanner(writer, base(), entries(), config());
			await writer.flush();

			expect(adapter.states.get('households.1.planner.nextRecipeName')).to.equal('Tomato Soup');
			expect(adapter.states.get('households.1.planner.nextCookingDate')).to.equal(1700100000000);
		});

		it('handles an empty plan without inventing a next meal', async () => {
			syncPlanner(writer, base(), [], config());
			await writer.flush();

			expect(adapter.states.get('households.1.planner.count')).to.equal(0);
			expect(adapter.states.get('households.1.planner.nextRecipeName')).to.equal('');
			expect(adapter.states.get('households.1.planner.nextCookingDate')).to.equal(0);
		});
	});

	describe('syncExpenses', () => {
		const expenses = (): Expense[] => fixture<Expense[]>('expenses');
		const categories = (): ExpenseCategory[] => fixture<ExpenseCategory[]>('expense-categories');
		const overview = (): ExpenseOverview => fixture<ExpenseOverview>('expense-overview');

		it('writes the newest expense and the period total', async () => {
			syncExpenses(writer, base(), expenses(), categories(), overview(), config());
			await writer.flush();

			expect(adapter.states.get('households.1.expenses.count')).to.equal(2);
			expect(adapter.states.get('households.1.expenses.newestName')).to.equal('Weekly shop');
			expect(adapter.states.get('households.1.expenses.newestAmount')).to.equal(42.5);
			expect(adapter.states.get('households.1.expenses.newestPaidBy')).to.equal(1);
			// 42.50 booked to a category plus 18.00 uncategorised.
			expect(adapter.states.get('households.1.expenses.currentPeriodTotal')).to.equal(60.5);
		});

		it('writes a branch per category with its share of the current period', async () => {
			syncExpenses(writer, base(), expenses(), categories(), overview(), config());
			await writer.flush();

			expect(adapter.states.get('households.1.expenses.categories.50.name')).to.equal('Groceries');
			expect(adapter.states.get('households.1.expenses.categories.50.budget')).to.equal(200);
			expect(adapter.states.get('households.1.expenses.categories.50.currentPeriodSum')).to.equal(42.5);
			// A category with no spending this period reports zero, not null.
			expect(adapter.states.get('households.1.expenses.categories.51.currentPeriodSum')).to.equal(0);
		});

		it('surfaces the -1 bucket as an uncategorised branch', async () => {
			syncExpenses(writer, base(), expenses(), categories(), overview(), config());
			await writer.flush();

			expect(adapter.states.get('households.1.expenses.categories.uncategorized.currentPeriodSum')).to.equal(18);
		});

		it('copes with an empty overview', async () => {
			syncExpenses(writer, base(), [], categories(), {}, config());
			await writer.flush();

			expect(adapter.states.get('households.1.expenses.currentPeriodTotal')).to.equal(0);
			expect(adapter.states.get('households.1.expenses.newestName')).to.equal('');
			expect(adapter.objects.has('households.1.expenses.categories.uncategorized')).to.equal(false);
		});

		it('exposes the write commands only with write access', async () => {
			syncExpenses(writer, base(), expenses(), categories(), overview(), config({ enableWrite: true }));
			await writer.flush();

			expect(adapter.objects.get('households.1.expenses.add')?.common.write).to.equal(true);
			expect(adapter.objects.get('households.1.expenses.recalculateBalances')?.common.role).to.equal('button');
		});
	});

	describe('syncCatalog', () => {
		it('writes counts alongside the JSON documents', async () => {
			const catalog = fixture<{ items: Item[]; categories: Category[]; tags: Tag[] }>('catalog');
			syncCatalog(writer, base(), catalog.items, catalog.categories, catalog.tags);
			await writer.flush();

			expect(adapter.states.get('households.1.catalog.itemCount')).to.equal(2);
			expect(adapter.states.get('households.1.catalog.categoryCount')).to.equal(1);
			expect(adapter.states.get('households.1.catalog.tagCount')).to.equal(1);
			expect(JSON.parse(adapter.states.get('households.1.catalog.itemsJson') as string)).to.have.lengthOf(2);
		});
	});

	/** Builds the full tree once, with every branch and write access on. */
	async function syncEverything(): Promise<void> {
		const catalog = fixture<{ items: Item[]; categories: Category[]; tags: Tag[] }>('catalog');
		const full = config({ enableWrite: true });

		syncHousehold(writer, client, base(), household());
		syncMembers(writer, client, base(), household());
		syncShoppingLists(writer, base(), fixture<ShoppingList[]>('shoppinglists'), full);
		syncRecipes(writer, client, base(), fixture<Recipe[]>('recipes'), full);
		syncPlanner(writer, base(), fixture<PlannerEntry[]>('planner'), full);
		syncExpenses(
			writer,
			base(),
			fixture<Expense[]>('expenses'),
			fixture<ExpenseCategory[]>('expense-categories'),
			fixture<ExpenseOverview>('expense-overview'),
			full,
		);
		syncCatalog(writer, base(), catalog.items, catalog.categories, catalog.tags);
		await writer.flush();
	}

	describe('payload slimming', () => {
		/** The API repeats these on every item; none of them belong in a state. */
		const NOISE = [
			'household_id',
			'created_at',
			'updated_at',
			'support',
			'ordering',
			'default',
			'default_key',
			'category_id',
			'created_by',
		];

		it('keeps only the useful fields of a shopping list item', async () => {
			syncShoppingLists(writer, base(), fixture<ShoppingList[]>('shoppinglists'), config());
			await writer.flush();

			const items = JSON.parse(adapter.states.get('households.1.shoppingLists.1.json') as string);
			expect(items[0]).to.deep.equal({
				id: 10,
				name: 'Bread',
				description: '2 loaves',
				category: 'Bakery',
				icon: 'bread',
			});
			// An item with no category reports null rather than a nested object.
			expect(items[1].category).to.equal(null);
		});

		it('keeps the optional flag on recipe ingredients', async () => {
			syncRecipes(writer, client, base(), fixture<Recipe[]>('recipes'), config());
			await writer.flush();

			const items = JSON.parse(adapter.states.get('households.1.recipes.20.itemsJson') as string);
			expect(items).to.deep.equal([
				{ id: 13, name: 'Tomatoes', description: '500 g', optional: false, category: null, icon: null },
				{ id: 14, name: 'Cream', description: '100 ml', optional: true, category: null, icon: null },
			]);
		});

		it('strips the repeated category object and bookkeeping from every item payload', async () => {
			const catalog = fixture<{ items: Item[]; categories: Category[]; tags: Tag[] }>('catalog');
			syncShoppingLists(writer, base(), fixture<ShoppingList[]>('shoppinglists'), config());
			syncRecipes(writer, client, base(), fixture<Recipe[]>('recipes'), config());
			syncCatalog(writer, base(), catalog.items, catalog.categories, catalog.tags);
			await writer.flush();

			const payloads = [
				'households.1.shoppingLists.1.json',
				'households.1.shoppingLists.1.recentItemsJson',
				'households.1.recipes.20.itemsJson',
				'households.1.catalog.itemsJson',
			];

			for (const id of payloads) {
				for (const entry of JSON.parse(adapter.states.get(id) as string)) {
					// typeof null is 'object', so check the value rather than the type.
					expect(
						entry.category === null || typeof entry.category === 'string',
						`${id} category should be a name or null, got ${JSON.stringify(entry.category)}`,
					).to.equal(true);
					for (const key of NOISE) {
						expect(entry, `${id} should not carry ${key}`).to.not.have.property(key);
					}
				}
			}
		});

		it('does not repeat the household scalars in a json state', async () => {
			syncHousehold(writer, client, base(), household());
			await writer.flush();

			// Every field of that dump already exists as its own sibling state.
			expect(adapter.objects.has('households.1.json')).to.equal(false);
			expect(adapter.states.get('households.1.name')).to.equal('Example Household');
		});
	});

	describe('localization', () => {
		it('has a German name for every state the adapter defines itself', async () => {
			await syncEverything();

			// Names taken from the fixtures are KitchenOwl's own and stay untranslated.
			const fromKitchenOwl = new Set([
				'Example Household',
				'Alice Example',
				'Bob Example',
				'Groceries',
				'Hardware store',
				'Bread',
				'Milk',
				'Tomato Soup',
				'Pancakes',
				'Eating out',
			]);

			const untranslated = [...adapter.objects.entries()]
				.filter(([, obj]) => typeof obj.common.name === 'string')
				.filter(([, obj]) => !fromKitchenOwl.has(obj.common.name as string))
				.map(([id, obj]) => `${id} (${String(obj.common.name)})`);

			expect(untranslated.join('\n'), 'states whose own name has no German translation').to.equal('');
		});
	});

	describe('state roles', () => {
		it('never leaves a state with the bare "state" role', async () => {
			await syncEverything();

			const bare = [...adapter.objects.entries()]
				.filter(([, obj]) => obj.type === 'state')
				.filter(([, obj]) => !obj.common.role || obj.common.role === 'state')
				.map(([id]) => id);

			expect(bare, 'states with a missing or bare role').to.be.empty;
			expect(adapter.objects.size).to.be.greaterThan(50);
		});
	});
});
