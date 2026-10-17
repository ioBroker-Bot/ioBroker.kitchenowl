import { expect } from 'chai';

import { connectionOptions, selectHouseholds } from './instance';
import type { Household } from './types';

/**
 * A household reduced to what the selection looks at.
 *
 * @param id - Household id
 * @param name - Household name
 */
const household = (id: number, name: string): Household => ({ id, name });

describe('selectHouseholds', () => {
	const all = (): Household[] => [household(1, 'Home'), household(2, 'Cabin'), household(5, 'Office')];

	it('takes every household when nothing is configured', () => {
		expect(selectHouseholds(all(), []).selected).to.have.lengthOf(3);
		expect(selectHouseholds(all(), undefined).selected).to.have.lengthOf(3);
	});

	it('keeps only the configured households, in the order the server sent them', () => {
		const { selected, missing } = selectHouseholds(all(), ['5', '1']);

		expect(selected.map(entry => entry.id)).to.deep.equal([1, 5]);
		expect(missing).to.be.empty;
	});

	it('reports configured households the token cannot see', () => {
		const { selected, missing } = selectHouseholds(all(), ['1', '9']);

		expect(selected.map(entry => entry.id)).to.deep.equal([1]);
		expect(missing).to.deep.equal([9]);
	});

	it('ignores configured values that are not numbers', () => {
		const { selected, missing } = selectHouseholds(all(), ['', 'two', '2']);

		expect(selected.map(entry => entry.id)).to.deep.equal([2]);
		expect(missing).to.be.empty;
	});
});

describe('connectionOptions', () => {
	const saved = {
		url: 'https://saved.invalid',
		token: 'saved-token',
		requestTimeout: 5000,
		rejectUnauthorized: false,
	};

	it('prefers what the admin form sent', () => {
		const options = connectionOptions(
			{
				url: ' https://typed.invalid ',
				token: ' typed-token ',
				requestTimeout: 2000,
				rejectUnauthorized: true,
			},
			saved,
		);

		expect(options).to.deep.equal({
			url: 'https://typed.invalid',
			token: 'typed-token',
			timeout: 2000,
			rejectUnauthorized: true,
		});
	});

	it('fills in only the fields the form left out', () => {
		const options = connectionOptions({ url: 'https://typed.invalid' }, saved);

		expect(options.url).to.equal('https://typed.invalid');
		expect(options.token).to.equal('saved-token');
		expect(options.rejectUnauthorized).to.equal(false);
	});

	it('falls back to the saved configuration, TLS setting included', () => {
		// What a script sending an empty message gets: the configured instance,
		// not a different one that suddenly verifies a self-signed certificate.
		expect(connectionOptions({}, saved)).to.deep.equal({
			url: 'https://saved.invalid',
			token: 'saved-token',
			timeout: 5000,
			rejectUnauthorized: false,
		});
	});

	it('verifies certificates when neither side says otherwise', () => {
		expect(connectionOptions({}, { url: 'https://x.invalid', token: 't' }).rejectUnauthorized).to.equal(true);
	});

	it('ignores a message that is not an object', () => {
		expect(connectionOptions('nonsense', saved).url).to.equal('https://saved.invalid');
		expect(connectionOptions(null, saved).token).to.equal('saved-token');
	});

	it('asks for the missing details instead of building a useless client', () => {
		expect(() => connectionOptions({}, {})).to.throw('server URL and an API token');
		expect(() => connectionOptions({ url: 'https://x.invalid' }, {})).to.throw('server URL and an API token');
	});
});
