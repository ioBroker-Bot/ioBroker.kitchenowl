// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config from '@iobroker/eslint-config';

export default [
	...config,
	{
		// specify files to exclude from linting here
		ignores: [
			'.dev-server/',
			'.vscode/',
			'*.test.js',
			'test/**/*.js',
			'*.config.mjs',
			'build',
			'dist',
			'admin/words.js',
			'admin/admin.d.ts',
			'admin/blockly.js',
			'**/adapter-config.d.ts',
			'widgets/**/*.js'
		],
	},
	{
		rules: {
			// Each interface still needs a doc comment, but the individual fields of
			// the API response types mirror KitchenOwl's own JSON keys and documenting
			// every one of them adds noise rather than meaning.
			'jsdoc/require-jsdoc': [
				'warn',
				{
					publicOnly: true,
					require: {
						ClassDeclaration: true,
						MethodDefinition: true,
						FunctionDeclaration: true,
					},
					contexts: ['TSInterfaceDeclaration'],
				},
			],
		},
	},
];