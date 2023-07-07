// as_outputdocs outputdocs
// as_listmapscriptinfo
// as_scriptbaseclasses

import { writeFileSync, readFileSync, copyFileSync } from 'fs';
import Handlebars from 'handlebars';

// TODO:
// share links
// ScriptBases
// Constant's values
// Advnaced Search

const inputFile = './outputdocs.txt';

const buildDir = './dist/';
const srcDir = './src/';

const searchFile = 'search.json';
const searchDatabase = [];

const namespaces = new Map();
const overloadChecker = new Map();
const tokenLookup = new Map();
const typesArray = [
	'void',
	'int',
	'int8',
	'int16',
	'int32',
	'int64',
	'uint',
	'uint8',
	'uint16',
	'uint32',
	'uint64',
	'float',
	'double',
	'bool',
	'const',
	'@',
	'&',
	'?',
	'any',
	'array',
	'dictionary',
	'dictionaryValue',
];

let tokenLookupWithoutCommon;

const commonTokens = [
	'Type',
	'Activity',
	'basic',
	'Damage',
	'HUD',
	'Schedule',
	'Task',
];

const indexPartial = readFileSync(srcDir + 'index.hbs', 'utf8');
const pagePartial = readFileSync(srcDir + 'page.hbs', 'utf8');

// * EDGE CASES *
// light_level, g_EngineFuncs.GetEntityIllum
// MakeVectors, g_Engine::v_forward
// EntitiesInPVS, Edict::vars::chain
// get_pContainingEntity, pContainingEntity.vars
// In_Buttons, entvars_t.buttons

//Parses .asdoc file into JS object
function parseASDOC(data) {
	const IS_AN_ARRAY = {
		Interfaces: true,
		Classes: true,
		Enums: true,
		Functions: true,
		Properties: true,
		Typedefs: true,
		FuncDefs: true,
		Methods: true,
		Values: true,
		Properties: true,
	};

	const IS_AN_OBJ = {
		Interface: true,
		Method: true,
		Class: true,
		Value: true,
		Property: true,
		Enum: true,
		Function: true,
		Typedef: true,
		FuncDef: true,
	};

	const lines = data.split('\n');
	lines.shift(); // skip the 'AngelScipt Documentation'
	lines.shift(); // skip the {}

	let previousLineKey;
	let stack = [];

	let api = {};
	stack.push(api);

	for (let line of lines) {
		let key = null;
		let value = null;

		line = line.trim();
		const firstSpaceIndex = line.indexOf(' ');

		if (firstSpaceIndex !== -1) {
			key = line.slice(0, firstSpaceIndex);
			value = line.slice(firstSpaceIndex + 1);
			if (!isNaN(value)) {
				value = Number(value);
			}
		} else {
			key = line;
		}

		const peek = stack[stack.length - 1];
		if (value == null) {
			if (key == '}') {
				stack.pop();
			} else if (key == '{') {
				if (IS_AN_ARRAY[previousLineKey]) {
					peek[previousLineKey] = [];
					stack.push(peek[previousLineKey]);
				} else if (IS_AN_OBJ[previousLineKey]) {
					let obj = {};
					peek.push(obj);
					stack.push(obj);
				}
			}
		} else if (key != null) {
			if (
				typeof value === 'string' &&
				value.startsWith('"') &&
				value.endsWith('"')
			) {
				value = value.substring(1, value.length - 1);
			}
			peek[key] = value;
		}
		previousLineKey = key;
	}

	const jsonString = JSON.stringify(api, null, 2)
		.replace(/\\\\/g, '\\') // Replace `double backslashes` with `single backslash`
		.replace(/\\"/g, '"') // Replace `backslash double-quote` with `double-quote`
		.replace(/\\'/g, "'"); // Replace `backslash single-quote` with `single-quote`

	return JSON.parse(jsonString);
}

Handlebars.registerPartial('Table', readFileSync(`${srcDir}table.hbs`, 'utf8'));

// * DOCUMENTATION
Handlebars.registerHelper('doc', function (text) {
	if (typeof text !== 'string') return text;

	var words = text.split(/( |\(|,|\)|@|&|\.|\[|\])/g).filter(Boolean);

	words = words.map((word) => {
		if (tokenLookupWithoutCommon.has(word)) {
			const token = tokenLookupWithoutCommon.get(word);
			if (token.Fragment) {
				return `<a href='/${token.Page}#${token.Fragment}'>${word}</a>`;
			} else {
				return `<a href='/${token.Page}'>${word}</a>`;
			}
		} else {
			return word;
		}
	});

	let result = words.join('');
	result = result.replace(/(\n)/gm, '<br>');

	return new Handlebars.SafeString(result);
});

// * DECLARATION
Handlebars.registerHelper('dec', function (text) {
	if (typeof text !== 'string') return text;

	var words = text.split(/( |\(|,|\)|@|&)/g);

	let ignoreIndex = -1;
	for (var i = 1; i < words.length; i++)
		if (words[i] === '(' || words[i] === '()') {
			ignoreIndex = i - 1;
			break;
		}

	const identifier = text.match(/[\w$]+(?=\s*=|\s*\(|$)/)[0];

	let newWords = [];
	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		const isMethodName = ignoreIndex == i;
		const isPropertyName = ignoreIndex == -1 && word == identifier;
		if (isMethodName || isPropertyName) {
			newWords.push(word);
			continue;
		}

		const isToken = tokenLookup.has(word);
		const isType = typesArray.includes(word);

		const nextWord = words[i + 1];

		if (isToken) {
			const token = tokenLookup.get(word); // Link the token to the correct page.
			const style = isType ? 'type' : 'value';
			if (token.Fragment)
				newWords.push(
					`<a class="${style}" href='/${token.Page}#${token.Fragment}'>${word}</a>`
				);
			else
				newWords.push(
					`<a class="${style}" href='/${token.Page}'>${word}</a>`
				);
		} else if (isType) {
			newWords.push(`<span class="type">${word}</span>`);
		} else if (nextWord == ' ' && (word == 'in' || word == 'out')) {
			newWords.push(`<span class="inout">${word}</span>`);
		} else {
			newWords.push(word);
		}
	}
	words = newWords;

	return new Handlebars.SafeString(words.join(''));
});

// * NAMESPACE
Handlebars.registerHelper('ns', function (text) {
	if (typeof text !== 'string') return text;

	var words = text.split(/( |\(|,|\)|@|&|\.|\[|\])/g).filter(Boolean);

	words = words.map((word) => {
		if (namespaces.has(word)) {
			return `<a href='/${namespaces.get(word).File}'>${word}</a>`;
		} else {
			return word;
		}
	});

	return new Handlebars.SafeString(words.join(''));
});

const template = Handlebars.compile(
	readFileSync(srcDir + 'document.hbs', 'utf8')
);

function writePage(obj) {
	const html = template(obj);
	writeFileSync(`${buildDir}${obj.FileName}.html`, html, 'utf8');
}

function sortAlphabetically(arr, key) {
	arr.sort((a, b) => {
		const classNameA = a[key].toLowerCase();
		const classNameB = b[key].toLowerCase();

		if (classNameA < classNameB) {
			return -1;
		} else if (classNameA > classNameB) {
			return 1;
		} else {
			return 0;
		}
	});
	return arr;
}

function setFirstLine(arr) {
	for (const item of arr) {
		const lines = item.Documentation.split('\n');
		item.FirstLine = lines[0];
	}
	return arr;
}

function setId(arr, key) {
	overloadChecker.clear();
	for (const item of arr) {
		let identifier = item[key].match(/[\w$]+(?=\s*=|\s*\(|$)/)[0];
		item.Id = identifier;
		item.IsFirst = true;
		if (overloadChecker.has(identifier)) {
			const i = overloadChecker.get(identifier) + 1;
			overloadChecker.set(identifier, i);
			identifier += '@' + i.toString();
			item.IsFirst = false;
		}
		overloadChecker.set(identifier, 1);
		item.UniqueId = identifier;
	}
	return arr;
}

function generateTokenLookup(api) {
	for (const [key, value] of namespaces) {
		sortAlphabetically(value.Classes, 'ClassName');
		sortAlphabetically(value.Enums, 'Name');
		value.Functions.reverse();
		value.Properties.reverse();
	}

	sortAlphabetically(api.Classes, 'ClassName');
	setFirstLine(api.Classes);

	for (const cls of api.Classes) {
		tokenLookup.set(cls.ClassName, { Page: cls.ClassName });
		typesArray.push(cls.ClassName);
		cls.Methods.reverse();
		cls.Properties.reverse();
		setId(cls.Methods, 'Declaration');
		setId(cls.Properties, 'Declaration');

		for (const method of cls.Methods)
			if (method.IsFirst)
				tokenLookup.set(`${cls.ClassName}::${method.Id}`, {
					Page: cls.ClassName,
					Fragment: method.Id,
				});
		for (const prop of cls.Properties)
			tokenLookup.set(`${cls.ClassName}::${prop.Id}`, {
				Page: cls.ClassName,
				Fragment: prop.Id,
			});
	}

	sortAlphabetically(api.Enums, 'Name');
	setFirstLine(api.Enums);

	for (const enm of api.Enums) {
		enm.Values.reverse();
		tokenLookup.set(enm.Name, { Page: enm.Name });
		typesArray.push(enm.Name);
		if (namespaces.has(enm.Namespace))
			tokenLookup.set(`${enm.Namespace}::${enm.Name}`, { Page: enm.Name });
		for (const val of enm.Values) {
			tokenLookup.set(`${enm.Name}::${val.Name}`, {
				Page: enm.Name,
				Fragment: val.Name,
			});
			if (namespaces.has(enm.Namespace))
				tokenLookup.set(`${enm.Namespace}::${val.Name}`, {
					Page: enm.Name,
					Fragment: val.Name,
				});
			tokenLookup.set(val.Name, { Page: enm.Name, Fragment: val.Name });
		}
	}

	api.Functions.reverse();
	setId(api.Functions, 'Declaration');

	api.Properties.reverse();
	setId(api.Properties, 'Declaration');

	for (const prop of api.Properties) {
		tokenLookup.set(prop.Id, {
			Page: 'Properties',
			Fragment: prop.Id,
		});
		if (namespaces.has(prop.Namespace))
			tokenLookup.set(`${prop.Namespace}::${prop.Id}`, {
				Page: 'Properties',
				Fragment: prop.Id,
			});
	}

	api.Typedefs.reverse();
	for (const typedef of api.Typedefs) {
		tokenLookup.set(`${typedef.Name}`, {
			Page: 'Typedefs',
			Fragment: typedef.Name,
		});
		typesArray.push(typedef.Name);
	}

	api.FuncDefs.reverse();
	setId(api.FuncDefs, 'Name');

	sortAlphabetically(api.Interfaces, 'InterfaceName');
	setFirstLine(api.Interfaces);

	for (const inter of api.Interfaces) {
		inter.Methods.reverse();
		typesArray.push(inter.InterfaceName);
		tokenLookup.set(`${inter.InterfaceName}`, {
			Page: inter.InterfaceName,
		});
		setId(inter.Methods, 'Declaration');
	}

	tokenLookupWithoutCommon = new Map(tokenLookup);
	for (const str of commonTokens) {
		tokenLookupWithoutCommon.delete(str);
	}
}

function genNamespace(namespace) {
	if (!namespaces.has(namespace))
		namespaces.set(namespace, {
			File: 'Namespace.' + namespace.replace(/::/g, '.'),
			Classes: [],
			Enums: [],
			Functions: [],
			Properties: [],
		});
}

function generateNamespaceData(api) {
	for (const enm of api.Enums)
		if (enm.Namespace != '') {
			genNamespace(enm.Namespace);
			namespaces.get(enm.Namespace).Enums.push(enm);
		}
	for (const cls of api.Classes) {
		if (cls.Namespace != '') {
			genNamespace(cls.Namespace);
			namespaces.get(cls.Namespace).Classes.push(cls);
		}
	}
	for (const fnc of api.Functions) {
		if (fnc.Namespace != '') {
			genNamespace(fnc.Namespace);
			namespaces.get(fnc.Namespace).Functions.push(fnc);
		}
	}
	for (const prop of api.Properties) {
		if (prop.Namespace != '') {
			genNamespace(prop.Namespace);
			namespaces.get(prop.Namespace).Properties.push(prop);
		}
	}
}

function generateDocs(api) {
	// * GENERATE INDEX
	Handlebars.registerPartial('Main', indexPartial);
	writeFileSync(buildDir + 'index.html', template(api));

	Handlebars.registerPartial('Main', pagePartial);
	const namespacePageTableData = [];

	namespaces.forEach((value, key) => {
		namespacePageTableData.push({
			Name: key,
			File: value.File,
			Documentation: '',
		});
	});

	// * GENERATE NAMESPACES PAGE
	writePage({
		FileName: 'Namespaces',
		Title: 'Namespaces',
		Description: '',
		Tables: [
			{
				Title: 'Namespaces',
				IsNamespacePage: true,
				Columns: ['Names'],
				Rows: namespacePageTableData,
			},
		],
	});
	// * GENERATE EACH NAMESPACE PAGE
	namespaces.forEach((namespace, key) => {
		writePage({
			FileName: namespace.File,
			ParentFileName: 'Namespaces',
			DisplayName: key,
			Title: key,
			Description: `Definitions for ${key} Namespace`,
			Tables: [
				{
					Title: 'Classes',
					IsClassPage: true,
					Columns: ['Namespace', 'Name', 'Description'],
					Rows: namespace.Classes,
				},
				{
					Title: 'Enums',
					IsEnumPage: true,
					Columns: ['Namespace', 'Name', 'Description'],
					Rows: namespace.Enums,
				},
				{
					Title: 'Functions',
					IsNamDecDes: true,
					Columns: ['Namespace', 'Declaration', 'Description'],
					Rows: namespace.Functions,
				},
				{
					Title: 'Properties',
					IsNamDecDes: true,
					Columns: ['Namespace', 'Declaration', 'Description'],
					Rows: namespace.Properties,
				},
			],
		});
	});

	// * GENERATE CLASSES PAGE
	writePage({
		FileName: 'Classes',
		Title: 'Classes',
		Description:
			'List of all documented classes with a brief descriptions of each.',
		Tables: [
			{
				Title: 'Classes',
				IsClassPage: true,
				Columns: ['Namepspace', 'Name', 'Description'],
				Rows: api.Classes,
			},
		],
	});

	// * GENERATE EACH CLASS PAGE
	for (const cls of api.Classes) {
		writePage({
			ParentFileName: 'Classes',
			FileName: cls.ClassName,
			Title: cls.ClassName,
			Description: cls.Documentation,
			Namespace: cls.Namespace,
			RenderNav: cls.Methods.length > 0 && cls.Properties.length > 0,
			Type: cls.Flags % 2 ? 'Reference' : 'Value',
			Tables: [
				{
					Title: 'Methods',
					IsDecDes: true,
					Columns: ['Declaration', 'Description'],
					Rows: cls.Methods,
				},
				{
					Title: 'Properties',
					IsDecDes: true,
					Columns: ['Declaration', 'Description'],
					Rows: cls.Properties,
				},
			],
		});
	}

	// * GENERATE ENUMS PAGE
	writePage({
		FileName: 'Enums',
		Title: 'Enumerations',
		Description:
			'List of all documented enums with a brief descriptions of each.',
		Tables: [
			{
				Title: 'Enums',
				IsEnumPage: true,
				Columns: ['Namespace', 'Name', 'Description'],
				Rows: api.Enums,
			},
		],
	});

	// * GENERATE EACH ENUM PAGE
	for (const enm of api.Enums) {
		writePage({
			ParentFileName: 'Enums',
			FileName: enm.Name,
			Title: enm.Name,
			Description: enm.Documentation,
			Namespace: enm.Namespace,
			Tables: [
				{
					Title: 'Values',
					Enum: true,
					Columns: ['Name', 'Value', 'Description'],
					Rows: enm.Values,
				},
			],
		});
	}

	// * GENERATE FUNCTIONS PAGE
	writePage({
		FileName: 'Functions',
		Title: 'Global Functions',
		Description: 'Functions that are accessible at a global level.',
		Tables: [
			{
				Title: 'Functions',
				IsNamDecDes: true,
				Columns: ['Namespace', 'Declaration', 'Description'],
				Rows: api.Functions,
			},
		],
	});

	// * GENERATE PROPERTIES PAGE
	writePage({
		FileName: 'Properties',
		Title: 'Global Properties',
		Description: 'Properties that are accessible at a global level.',
		Tables: [
			{
				Title: 'Properties',
				IsNamDecDes: true,
				Columns: ['Namespace', 'Declaration', 'Description'],
				Rows: api.Properties,
			},
		],
	});

	// * GENERATE TYPEDEFS PAGE
	// As of now there are no namespaces for Typedefs. Omitting
	writePage({
		FileName: 'Typedefs',
		Title: 'Type definitions',
		Description: 'Typedefs provides alternative names to existing tyes.',
		Tables: [
			{
				Title: 'Typedefs',
				Typedef: true,
				Columns: ['Type', 'Declaration', 'Description'],
				Rows: api.Typedefs,
			},
		],
	});

	// * GENERATE FUNCDEFS PAGE
	// As of now there are no namespaces for FuncDefs. Omitting
	writePage({
		FileName: 'FuncDefs',
		Title: 'Function Definitions',
		Description:
			'Function definitions are callbacks that can be passed around.',
		Tables: [
			{
				Title: 'FuncDefs',
				FuncDef: true,
				Columns: ['Declaration', 'Description'],
				Rows: api.FuncDefs,
			},
		],
	});

	// * GENERATE INTERFACES PAGE
	// As of now there are no namespaces for interfaces. Omitting
	writePage({
		FileName: 'Interfaces',
		Title: 'Interfaces',
		Description: '',
		Tables: [
			{
				Title: 'Interfaces',
				IsInterfacePage: true,
				Columns: ['Name', 'Description'],
				Rows: api.Interfaces,
			},
		],
	});

	// * GENERATE EACH INTERFACE PAGE
	for (const inter of api.Interfaces) {
		writePage({
			ParentFileName: 'Interfaces',
			FileName: inter.InterfaceName,
			Title: inter.InterfaceName,
			Description: inter.Documentation,
			Tables: [
				{
					Title: 'Methods',
					IsDecDes: true,
					Columns: ['Declaration', 'Description'],
					Rows: inter.Methods,
				},
			],
		});
	}
}


function stringifyObject(obj) {
  return '{' + Object.keys(obj).map(key => `${key}:${JSON.stringify(obj[key])}`).join(',') + '}';
}

/*
P - Primary Search Term.
D - Documentation.
W - Webpage
C - Context
J - Jumpto
*/
function generateDatabase(api) {
	// WRITE CLASSES TO DATABASE
	for (const cls of api.Classes) {
		searchDatabase.push({
			P: cls.ClassName,
			D: cls.Documentation,
			W: cls.ClassName,
			C: 'Class',
		});
		for (const method of cls.Methods) {
			if (method.IsFirst) {
				searchDatabase.push({
					P: method.Id,
					D: method.Documentation,
					W: cls.ClassName,
					C: cls.ClassName,
					J: 1,
				});
			}
		}
		for (const prop of cls.Properties) {
			searchDatabase.push({
				P: prop.Id,
				D: prop.Documentation,
				W: cls.ClassName,
				C: cls.ClassName,
				J: 1,
			});
		}
	}
	// WRITE ENUMS TO DATABASE
	for (const enm of api.Enums) {
		searchDatabase.push({
			P: enm.Name,
			D: enm.Documentation,
			W: enm.Name,
			C: 'Enum',
		});
		for (const val of enm.Values) {
			searchDatabase.push({
				P: val.Name,
				D: val.Documentation,
				W: enm.Name,
				C: enm.Name,
				J: 1,
			});
		}
	}
	// WRITE FUNCTIONS TO DATABASE
	for (const func of api.Functions) {
		if (func.IsFirst) {
			searchDatabase.push({
				P: func.Id,
				D: func.Documentation,
				W: 'Functions',
				C: 'Global Function',
				J: 1,
			});
		}
	}
	// WRITE PROPERTIES TO DATABASE
	for (const prop of api.Properties) {
		searchDatabase.push({
			P: prop.Id,
			D: prop.Documentation,
			W: 'Properties',
			C: 'Global Property',
			J: 1,
		});
	}
	// WRITE TYPEDEFS TO DATABASE
	for (const typeDef of api.Typedefs) {
		searchDatabase.push({
			P: typeDef.Name,
			D: typeDef.Documentation,
			W: 'Typedefs',
			C: 'Typedef',
			J: 1,
		});
	}
	// WRITE FUNCDEFS TO DATABASE
	for (const funcDef of api.FuncDefs) {
		searchDatabase.push({
			P: funcDef.Id,
			D: funcDef.Documentation,
			W: 'FuncDefs',
			C: 'FuncDef',
			J: 1,
		});
	}
	// WRITE INTERFACES TO DATABASE
	for (const inter of api.Interfaces) {
		searchDatabase.push({
			P: inter.InterfaceName,
			D: inter.Documentation,
			W: 'Interfaces',
			C: 'Interface',
		});
		for (const method of inter.Methods) {
			if (method.IsFirst) {
				searchDatabase.push({
					P: method.Id,
					D: method.Documentation,
					W: 'Interfaces',
					C: inter.InterfaceName,
					J: 1,
				});
			}
		}
	}
	const data = 'export const database = [' 
  + searchDatabase.map(obj => stringifyObject(obj)).join(',') 
  + '];';
	writeFileSync(buildDir + 'db.js', data, 'utf8');
	//writeFileSync(buildDir + searchFile, JSON.stringify(searchDatabase), 'utf8');
}

const api = parseASDOC(readFileSync(inputFile, 'utf8'));

generateNamespaceData(api);
generateTokenLookup(api);
generateDatabase(api);
generateDocs(api);

copyFileSync(srcDir + 'style.css', buildDir + 'style.css');
copyFileSync(srcDir + 'favicon.ico', buildDir + 'favicon.ico');
copyFileSync(srcDir + 'script.mjs', buildDir + 'script.mjs');

console.log('Done!');
