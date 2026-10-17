import { expect } from 'chai';

import { localize } from './i18n';

describe('localize', () => {
	it('returns both languages for a known name', () => {
		expect(localize('Shopping lists')).to.deep.equal({ en: 'Shopping lists', de: 'Einkaufslisten' });
		expect(localize('Expense balance')).to.deep.equal({ en: 'Expense balance', de: 'Ausgabensaldo' });
	});

	it('translates every weekday the planner uses', () => {
		const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

		for (const day of weekdays) {
			expect(localize(day), day).to.not.equal(day);
		}
	});

	it('passes names that come from KitchenOwl through unchanged', () => {
		// Household, list, member and recipe titles must not be translated.
		expect(localize('Example Household')).to.equal('Example Household');
		expect(localize('Tomato Soup')).to.equal('Tomato Soup');
		expect(localize('')).to.equal('');
	});
});
