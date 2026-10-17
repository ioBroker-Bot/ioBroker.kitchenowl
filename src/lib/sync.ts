import type { KitchenOwlClient } from './api';
import { memberId, round2, toId, toTimestamp } from './ids';
import type { ObjectWriter } from './objects';
import {
	type Expense,
	type ExpenseCategory,
	type ExpenseFrame,
	type ExpenseOverview,
	type ExpenseView,
	type Household,
	type PlannerEntry,
	type Recipe,
	type ShoppingList,
} from './types';

/** The parts of the adapter configuration the sync functions care about. */
export interface SyncConfig {
	syncMembers: boolean;
	syncShoppingLists: boolean;
	syncRecipes: boolean;
	syncPlanner: boolean;
	syncExpenses: boolean;
	syncCatalog: boolean;
	createRecipeObjects: boolean;
	createShoppingItemObjects: boolean;
	enableWrite: boolean;
	expenseOverviewFrame: ExpenseFrame;
	expenseOverviewSteps: number;
	expenseView: ExpenseView;
	expensePages: number;
}

/** Weekday names used for the planner's `days.<n>` channels. */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Builds the absolute photo URL for a filename, or null when there is no photo.
 *
 * @param client - Connected KitchenOwl client
 * @param filename - Photo filename as returned by the API, if any
 */
function photo(client: KitchenOwlClient, filename: string | null | undefined): string | null {
	return filename ? client.photoUrl(filename) : null;
}

/**
 * Writes the household's own attributes.
 *
 * @param writer - Collector the states are added to
 * @param client - Connected KitchenOwl client
 * @param base - Namespace-relative id of the household branch
 * @param household - Household being written
 */
export function syncHousehold(
	writer: ObjectWriter,
	client: KitchenOwlClient,
	base: string,
	household: Household,
): void {
	writer.channel(base, household.name, 'device');

	writer.value(`${base}.id`, 'Household ID', 'number', 'value', household.id);
	writer.value(`${base}.name`, 'Name', 'string', 'text', household.name);
	writer.value(`${base}.description`, 'Description', 'string', 'text', household.description ?? '');
	writer.value(`${base}.language`, 'Language', 'string', 'text', household.language ?? '');
	writer.value(`${base}.photoUrl`, 'Photo URL', 'string', 'text.url', photo(client, household.photo) ?? '');
	writer.value(
		`${base}.expensesFeature`,
		'Expenses feature enabled',
		'boolean',
		'indicator',
		!!household.expenses_feature,
	);
	writer.value(
		`${base}.plannerFeature`,
		'Planner feature enabled',
		'boolean',
		'indicator',
		!!household.planner_feature,
	);
	writer.value(
		`${base}.defaultShoppingListId`,
		'Default shopping list ID',
		'number',
		'value',
		household.default_shopping_list?.id ?? 0,
	);
	writer.json(`${base}.viewOrdering`, 'Configured view order', household.view_ordering ?? []);
	writer.json(`${base}.json`, 'Raw household object', household);
}

/**
 * Writes one channel per member, plus the balance summary.
 *
 * @param writer - Collector the states are added to
 * @param client - Connected KitchenOwl client
 * @param base - Namespace-relative id of the household branch
 * @param household - Household being written
 */
export function syncMembers(writer: ObjectWriter, client: KitchenOwlClient, base: string, household: Household): void {
	const members = household.member ?? [];
	const root = `${base}.members`;

	writer.channel(root, 'Household members');
	writer.value(`${root}.count`, 'Number of members', 'number', 'value', members.length);
	writer.json(
		`${root}.balancesJson`,
		'Expense balance per member',
		Object.fromEntries(members.map(member => [member.username, round2(member.expense_balance ?? 0)])),
	);

	for (const member of members) {
		const id = `${root}.${memberId(member)}`;
		writer.channel(id, member.name);

		writer.value(`${id}.id`, 'User ID', 'number', 'value', member.id);
		writer.value(`${id}.name`, 'Display name', 'string', 'text', member.name);
		writer.value(`${id}.username`, 'Username', 'string', 'text', member.username);
		// The API returns balances as raw floats such as -220.1999999999914.
		writer.value(`${id}.balance`, 'Expense balance', 'number', 'value', round2(member.expense_balance ?? 0));
		writer.value(`${id}.isHouseholdAdmin`, 'Household administrator', 'boolean', 'indicator', !!member.admin);
		writer.value(`${id}.isOwner`, 'Household owner', 'boolean', 'indicator', !!member.owner);
		writer.value(`${id}.lastSeen`, 'Last seen', 'number', 'value.time', toTimestamp(member.last_seen) ?? 0);
		writer.value(`${id}.photoUrl`, 'Photo URL', 'string', 'text.url', photo(client, member.photo) ?? '');
	}
}

/**
 * Writes every shopping list with its items, and the write commands when enabled.
 *
 * @param writer - Collector the states are added to
 * @param base - Namespace-relative id of the household branch
 * @param lists - Shopping lists including their items
 * @param config - Which branches and granularity the user enabled
 */
export function syncShoppingLists(writer: ObjectWriter, base: string, lists: ShoppingList[], config: SyncConfig): void {
	const root = `${base}.shoppingLists`;

	writer.channel(root, 'Shopping lists');
	writer.value(`${root}.count`, 'Number of lists', 'number', 'value', lists.length);
	writer.json(
		`${root}.json`,
		'All shopping lists',
		lists.map(list => ({ id: list.id, name: list.name, itemCount: list.items?.length ?? 0 })),
	);

	for (const list of lists) {
		const id = `${root}.${list.id}`;
		const items = list.items ?? [];

		writer.channel(id, list.name);
		writer.value(`${id}.id`, 'List ID', 'number', 'value', list.id);
		writer.value(`${id}.name`, 'Name', 'string', 'text', list.name);
		writer.value(`${id}.itemCount`, 'Number of items', 'number', 'value', items.length);
		writer.value(`${id}.itemNames`, 'Items as text', 'string', 'text', items.map(item => item.name).join(', '));
		writer.json(`${id}.json`, 'All items on the list', items);
		writer.json(`${id}.recentItemsJson`, 'Recently removed items', list.recentItems ?? []);

		if (config.enableWrite) {
			writer.state({
				id: `${id}.addItemByName`,
				name: 'Add an item by name',
				type: 'string',
				role: 'text',
				read: false,
				write: true,
			});
			writer.button(`${id}.clear`, 'Remove all items from the list');
		}

		if (!config.createShoppingItemObjects) {
			continue;
		}

		const itemsRoot = `${id}.items`;
		writer.channel(itemsRoot, 'Items');

		for (const item of items) {
			const itemId = `${itemsRoot}.${item.id}`;
			writer.channel(itemId, item.name);

			writer.value(`${itemId}.id`, 'Item ID', 'number', 'value', item.id);
			writer.value(`${itemId}.name`, 'Name', 'string', 'text', item.name);
			writer.value(`${itemId}.category`, 'Category', 'string', 'text', item.category?.name ?? '');
			writer.value(`${itemId}.icon`, 'Icon key', 'string', 'text', item.icon ?? '');

			if (config.enableWrite) {
				writer.state({
					id: `${itemId}.description`,
					name: 'Description, for example the amount',
					type: 'string',
					role: 'text',
					value: item.description ?? '',
					read: true,
					write: true,
				});
				writer.button(`${itemId}.remove`, 'Remove this item from the list');
			} else {
				writer.value(`${itemId}.description`, 'Description', 'string', 'text', item.description ?? '');
			}
		}
	}
}

/**
 * Writes the recipe collection, optionally one channel per recipe.
 *
 * @param writer - Collector the states are added to
 * @param client - Connected KitchenOwl client
 * @param base - Namespace-relative id of the household branch
 * @param recipes - Recipes of the household
 * @param config - Which branches and granularity the user enabled
 */
export function syncRecipes(
	writer: ObjectWriter,
	client: KitchenOwlClient,
	base: string,
	recipes: Recipe[],
	config: SyncConfig,
): void {
	const root = `${base}.recipes`;

	writer.channel(root, 'Recipes');
	writer.value(`${root}.count`, 'Number of recipes', 'number', 'value', recipes.length);
	writer.json(
		`${root}.json`,
		'Recipe overview',
		recipes.map(recipe => ({
			id: recipe.id,
			name: recipe.name,
			time: recipe.time ?? 0,
			yields: recipe.yields ?? null,
			planned: !!recipe.planned,
			tags: (recipe.tags ?? []).map(tag => tag.name),
		})),
	);

	if (config.enableWrite) {
		writer.state({
			id: `${root}.scrapeUrl`,
			name: 'Import a recipe from a URL',
			type: 'string',
			role: 'text.url',
			read: false,
			write: true,
		});
		writer.json(`${root}.scrapeResult`, 'Result of the last import', null);
		// The result state is written by the command handler, not by the poll.
		writer.keep(`${root}.scrapeResult`);
	}

	if (!config.createRecipeObjects) {
		return;
	}

	for (const recipe of recipes) {
		const id = `${root}.${recipe.id}`;
		writer.channel(id, recipe.name);

		writer.value(`${id}.id`, 'Recipe ID', 'number', 'value', recipe.id);
		writer.value(`${id}.name`, 'Name', 'string', 'text', recipe.name);
		writer.value(`${id}.description`, 'Description', 'string', 'text', recipe.description ?? '');
		writer.value(`${id}.time`, 'Total time', 'number', 'value', recipe.time ?? 0, 'min');
		writer.value(`${id}.prepTime`, 'Preparation time', 'number', 'value', recipe.prep_time ?? 0, 'min');
		writer.value(`${id}.cookTime`, 'Cooking time', 'number', 'value', recipe.cook_time ?? 0, 'min');
		writer.value(`${id}.yields`, 'Servings', 'number', 'value', recipe.yields ?? 0);
		writer.value(`${id}.source`, 'Source', 'string', 'text.url', recipe.source ?? '');
		writer.value(`${id}.photoUrl`, 'Photo URL', 'string', 'text.url', photo(client, recipe.photo) ?? '');
		writer.value(
			`${id}.tags`,
			'Tags as text',
			'string',
			'text',
			(recipe.tags ?? []).map(tag => tag.name).join(', '),
		);
		writer.value(`${id}.planned`, 'Currently planned', 'boolean', 'indicator', !!recipe.planned);
		writer.json(`${id}.plannedDays`, 'Planned weekdays', recipe.planned_days ?? []);
		writer.value(`${id}.visibility`, 'Visibility', 'number', 'value', recipe.visibility ?? 0);
		writer.json(`${id}.itemsJson`, 'Ingredients', recipe.items ?? []);
	}
}

/**
 * Writes the meal plan, one channel per weekday plus the next planned meal.
 *
 * @param writer - Collector the states are added to
 * @param base - Namespace-relative id of the household branch
 * @param entries - Planner entries of the household
 * @param config - Which branches and granularity the user enabled
 */
export function syncPlanner(writer: ObjectWriter, base: string, entries: PlannerEntry[], config: SyncConfig): void {
	const root = `${base}.planner`;

	writer.channel(root, 'Meal planner');
	writer.value(`${root}.count`, 'Number of planned meals', 'number', 'value', entries.length);
	writer.json(
		`${root}.json`,
		'Planned meals',
		entries.map(entry => ({
			recipeId: entry.recipe_id,
			recipeName: entry.recipe?.name ?? '',
			day: entry.day ?? -1,
			cookingDate: toTimestamp(entry.cooking_date),
			yields: entry.yields ?? null,
		})),
	);

	// The soonest entry that carries a real date, so a script can show "what's next".
	const upcoming = entries
		.filter(entry => toTimestamp(entry.cooking_date) !== null)
		.sort((a, b) => (a.cooking_date ?? 0) - (b.cooking_date ?? 0))[0];

	writer.value(`${root}.nextRecipeName`, 'Next planned meal', 'string', 'text', upcoming?.recipe?.name ?? '');
	writer.value(`${root}.nextRecipeId`, 'Next planned recipe ID', 'number', 'value', upcoming?.recipe_id ?? 0);
	writer.value(
		`${root}.nextCookingDate`,
		'Next cooking date',
		'number',
		'value.time',
		toTimestamp(upcoming?.cooking_date) ?? 0,
	);

	if (config.enableWrite) {
		writer.state({
			id: `${root}.addRecipe`,
			name: 'Plan a recipe, as JSON: {"recipe_id": 1, "cooking_date": 1700000000000}',
			type: 'string',
			role: 'json',
			read: false,
			write: true,
		});
	}

	const daysRoot = `${root}.days`;
	writer.channel(daysRoot, 'Planned meals by weekday');

	for (let day = 0; day < WEEKDAYS.length; day++) {
		const id = `${daysRoot}.${day}`;
		// A planner entry's `day` is -1 when it falls outside the coming week.
		const entry = entries.find(candidate => candidate.day === day);

		writer.channel(id, WEEKDAYS[day]);
		writer.value(`${id}.recipeId`, 'Recipe ID', 'number', 'value', entry?.recipe_id ?? 0);
		writer.value(`${id}.recipeName`, 'Recipe name', 'string', 'text', entry?.recipe?.name ?? '');
		writer.value(`${id}.yields`, 'Servings', 'number', 'value', entry?.yields ?? 0);
		writer.value(`${id}.date`, 'Cooking date', 'number', 'value.time', toTimestamp(entry?.cooking_date) ?? 0);

		if (config.enableWrite) {
			writer.button(`${id}.remove`, 'Remove this meal from the plan');
		}
	}
}

/**
 * Writes recent expenses, the statistics overview and the expense categories.
 *
 * @param writer - Collector the states are added to
 * @param base - Namespace-relative id of the household branch
 * @param expenses - Recent expenses, newest first
 * @param categories - Expense or item categories of the household
 * @param overview - Spending totals grouped by period
 * @param config - Which branches and granularity the user enabled
 */
export function syncExpenses(
	writer: ObjectWriter,
	base: string,
	expenses: Expense[],
	categories: ExpenseCategory[],
	overview: ExpenseOverview,
	config: SyncConfig,
): void {
	const root = `${base}.expenses`;
	const newest = expenses[0];
	// Period "0" of the overview is the current one.
	const currentPeriod = overview['0'];

	writer.channel(root, 'Expenses');
	writer.value(`${root}.count`, 'Number of expenses read', 'number', 'value', expenses.length);
	writer.json(
		`${root}.recentJson`,
		'Recent expenses',
		expenses.map(expense => ({
			id: expense.id,
			name: expense.name,
			amount: round2(expense.amount),
			date: toTimestamp(expense.date),
			paidById: expense.paid_by_id,
			category: expense.category?.name ?? null,
		})),
	);
	writer.json(`${root}.overviewJson`, 'Spending overview by period', overview);

	const currentTotal = currentPeriod
		? round2(Object.values(currentPeriod.by_category).reduce((sum, value) => sum + value, 0))
		: 0;
	writer.value(`${root}.currentPeriodTotal`, 'Total spent in the current period', 'number', 'value', currentTotal);

	writer.value(`${root}.newestName`, 'Newest expense', 'string', 'text', newest?.name ?? '');
	writer.value(`${root}.newestAmount`, 'Newest expense amount', 'number', 'value', round2(newest?.amount ?? 0));
	writer.value(`${root}.newestDate`, 'Newest expense date', 'number', 'value.time', toTimestamp(newest?.date) ?? 0);
	writer.value(`${root}.newestPaidBy`, 'Newest expense paid by user ID', 'number', 'value', newest?.paid_by_id ?? 0);

	if (config.enableWrite) {
		writer.state({
			id: `${root}.add`,
			name: 'Add an expense, as JSON: {"name": "Groceries", "amount": 12.5, "paid_by_id": 1}',
			type: 'string',
			role: 'json',
			read: false,
			write: true,
		});
		writer.button(`${root}.recalculateBalances`, 'Recalculate member balances');
	}

	const categoriesRoot = `${root}.categories`;
	writer.channel(categoriesRoot, 'Expense categories');

	for (const category of categories) {
		const id = `${categoriesRoot}.${category.id}`;
		writer.channel(id, category.name);

		writer.value(`${id}.id`, 'Category ID', 'number', 'value', category.id);
		writer.value(`${id}.name`, 'Name', 'string', 'text', category.name);
		writer.value(`${id}.budget`, 'Budget', 'number', 'value', category.budget ?? 0);
		writer.value(`${id}.color`, 'Colour as an ARGB integer', 'number', 'value', category.color ?? 0);
		writer.value(
			`${id}.currentPeriodSum`,
			'Spent in the current period',
			'number',
			'value',
			round2(currentPeriod?.by_category[String(category.id)] ?? 0),
		);
	}

	// The overview reports uncategorised spending under the key -1.
	const uncategorized = currentPeriod?.by_category['-1'];
	if (uncategorized !== undefined) {
		const id = `${categoriesRoot}.uncategorized`;
		writer.channel(id, 'Uncategorised');
		writer.value(`${id}.currentPeriodSum`, 'Spent in the current period', 'number', 'value', round2(uncategorized));
	}
}

/**
 * Writes the item catalog, item categories and tags as JSON states.
 *
 * @param writer - Collector the states are added to
 * @param base - Namespace-relative id of the household branch
 * @param items - Items of the household catalog
 * @param categories - Expense or item categories of the household
 * @param tags - Recipe tags of the household
 */
export function syncCatalog(
	writer: ObjectWriter,
	base: string,
	items: unknown[],
	categories: unknown[],
	tags: unknown[],
): void {
	const root = `${base}.catalog`;

	writer.channel(root, 'Item catalog');
	writer.value(`${root}.itemCount`, 'Number of known items', 'number', 'value', items.length);
	writer.json(`${root}.itemsJson`, 'All known items', items);
	writer.value(`${root}.categoryCount`, 'Number of categories', 'number', 'value', categories.length);
	writer.json(`${root}.categoriesJson`, 'All item categories', categories);
	writer.value(`${root}.tagCount`, 'Number of tags', 'number', 'value', tags.length);
	writer.json(`${root}.tagsJson`, 'All recipe tags', tags);
}

/**
 * Namespace-relative base id of a household branch.
 *
 * @param household - Household being written
 */
export function householdBase(household: Household): string {
	return `households.${toId(String(household.id))}`;
}
