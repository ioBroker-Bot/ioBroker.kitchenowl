/**
 * Shapes returned by the KitchenOwl backend API.
 *
 * Verified against backend version 124 (KitchenOwl v0.7.10). Every timestamp is
 * epoch milliseconds, and every field that the server may omit is optional here.
 */

/** `GET /api/health/<secret>` */
export interface Health {
	msg: string;
	version: number;
	min_frontend_version: number;
	oidc_provider?: string[];
	privacy_policy?: string;
	terms?: string;
	open_registration?: boolean;
	email_mandatory?: boolean;
	disable_username_password_login?: boolean;
}

/** A shopping item category, used to group items on a list. */
export interface Category {
	id: number;
	name: string;
	household_id: number;
	ordering?: number;
	default?: boolean;
	default_key?: string | null;
	created_at?: number;
	updated_at?: number;
}

/** A free-form label attached to recipes. */
export interface Tag {
	id: number;
	name: string;
	household_id: number;
	created_at?: number;
	updated_at?: number;
}

/** An entry in the household item catalog. */
export interface Item {
	id: number;
	name: string;
	household_id: number;
	icon?: string | null;
	category_id?: number | null;
	category?: Category | null;
	ordering?: number;
	support?: number;
	default?: boolean;
	default_key?: string | null;
	created_at?: number;
	updated_at?: number;
}

/** An item as it appears inside a shopping list: carries list-specific fields. */
export interface ShoppingListItem extends Item {
	description?: string;
	created_by?: number | null;
}

/** An item as it appears inside a recipe. */
export interface RecipeItem extends Item {
	description?: string;
	optional?: boolean;
}

/** A shopping list with its current and recently removed items. */
export interface ShoppingList {
	id: number;
	name: string;
	household_id: number;
	items?: ShoppingListItem[];
	recentItems?: ShoppingListItem[];
	created_at?: number;
	updated_at?: number;
}

/** Recipe visibility, as stored in `Recipe.visibility`. */
export enum RecipeVisibility {
	Private = 0,
	Link = 1,
	Public = 2,
}

/** A recipe, including its ingredients and tags when read from a list endpoint. */
export interface Recipe {
	id: number;
	name: string;
	household_id: number;
	description?: string;
	photo?: string | null;
	photo_hash?: string | null;
	time?: number;
	prep_time?: number;
	cook_time?: number;
	yields?: number | null;
	source?: string;
	visibility?: RecipeVisibility;
	server_curated?: boolean;
	suggestion_score?: number;
	suggestion_rank?: number;
	planned?: boolean;
	planned_days?: number[];
	planned_cooking_dates?: number[];
	items?: RecipeItem[];
	tags?: Tag[];
	created_at?: number;
	updated_at?: number;
}

/** One recipe placed on the meal plan. */
export interface PlannerEntry {
	recipe_id: number;
	household_id: number;
	/** Weekday 0-6 when the entry falls within the next seven days, otherwise -1. */
	day?: number;
	cooking_date?: number | null;
	yields?: number | null;
	recipe?: Recipe;
	created_at?: number;
	updated_at?: number;
}

/** A category expenses can be booked against, with an optional budget. */
export interface ExpenseCategory {
	id: number;
	name: string;
	household_id: number;
	/** ARGB integer as produced by the KitchenOwl app, or null. */
	color?: number | null;
	budget?: number | null;
	created_at?: number;
	updated_at?: number;
}

/** One member's share of an expense. */
export interface ExpensePaidFor {
	expense_id: number;
	user_id: number;
	factor: number;
	created_at?: number;
	updated_at?: number;
}

/** A single booked expense. */
export interface Expense {
	id: number;
	name: string;
	amount: number;
	household_id: number;
	paid_by_id: number;
	date?: number;
	description?: string;
	photo?: string | null;
	category_id?: number | null;
	category?: ExpenseCategory | null;
	paid_for?: ExpensePaidFor[];
	exclude_from_statistics?: boolean;
	created_at?: number;
	updated_at?: number;
}

/**
 * `GET /api/household/<id>/expense/overview`.
 *
 * Keyed by period index as a string: `"0"` is the current period, `"1"` the one
 * before it, and so on. Inside `by_category`, the key `-1` means uncategorised.
 */
export type ExpenseOverview = Record<
	string,
	{
		by_category: Record<string, number>;
		by_subframe: Record<string, number>;
	}
>;

/** A member of a household, with their current expense balance. */
export interface Member {
	id: number;
	name: string;
	username: string;
	/** Household admin, not server admin: the server-admin column is stripped out. */
	admin: boolean;
	owner: boolean;
	expense_balance: number;
	photo?: string | null;
	last_seen?: number;
	created_at?: number;
	updated_at?: number;
}

/** A household, including its members and enabled features. */
export interface Household {
	id: number;
	name: string;
	description?: string | null;
	language?: string | null;
	link?: string | null;
	photo?: string | null;
	photo_hash?: string | null;
	verified?: boolean | null;
	expenses_feature?: boolean;
	planner_feature?: boolean;
	view_ordering?: string[];
	member?: Member[];
	default_shopping_list?: ShoppingList;
	created_at?: number;
	updated_at?: number;
}

/** Time frames accepted by the expense overview endpoint. Values above 3 make the server fail. */
export enum ExpenseFrame {
	Daily = 0,
	Weekly = 1,
	Monthly = 2,
	Yearly = 3,
}

/** Perspective accepted by the expense endpoints. */
export enum ExpenseView {
	Household = 0,
	Personal = 1,
}
