const INPUT_ELEMENT_ID = 'search-input';
const SUGGESTIONS_ELEMENT_ID = 'search-suggestions';
const SUGGESTIONS_MAX_SIZE = 16;

const FUSE_OPTIONS = {
	isCaseSensitive: false,
	includeScore: true,
	shouldSort: true,
	threshold: 0.6,
};

const inputElement = document.getElementById(INPUT_ELEMENT_ID);
const suggestionsElement = document.getElementById(SUGGESTIONS_ELEMENT_ID);

let isFocused = false;
let suggestionsCache;
let currentIndex = -1;

const worker = new Worker(
	URL.createObjectURL(
		new Blob(
			[
				`
  importScripts('https://cdnjs.cloudflare.com/ajax/libs/fuse.js/6.5.3/fuse.min.js');
  onmessage = function(e) {
    const { list, keys, pattern } = e.data;
    const fuse = new Fuse(list, { keys: keys });
    const result = fuse.search(pattern);
    postMessage(result);
  };
`,
			],
			{ type: 'application/javascript' }
		)
	)
);

document.addEventListener('keydown', function (event) {
	const key = event.key;
	if (key === 'f' && document.activeElement != inputElement && !event.ctrlKey) {
		inputElement.focus();
		event.preventDefault();
	}
});

fetch('./search.json')
	.then((response) => {
		if (!response.ok) {
			throw new Error('HTTP error ' + response.status);
		}
		return response.json();
	})
	.then((db) => {
		inputElement.addEventListener('input', () => {
			isFocused = true;
			worker.postMessage({
				list: db,
				keys: ['Primary'],
				pattern: inputElement.value,
			});
		});

		inputElement.addEventListener('focus', () => {
			isFocused = true;
			suggestionsElement.removeAttribute('hidden');
		});

		inputElement.addEventListener('blur', () => {
			isFocused = false;
			suggestionsElement.setAttribute('hidden', '');
		});

		inputElement.addEventListener('keydown', function (event) {
			const listItems = suggestionsElement.querySelectorAll('.suggestion');

			switch (event.key) {
				case 'ArrowDown':
					currentIndex++;
					if (currentIndex >= listItems.length) currentIndex = 0;
					highlightSuggestion(listItems, currentIndex);
					event.preventDefault();
					break;
				case 'ArrowUp':
					currentIndex--;
					if (currentIndex < 0) currentIndex = listItems.length - 1;
					highlightSuggestion(listItems, currentIndex);
					event.preventDefault();
					break;
				case 'Enter':
					if (currentIndex > -1)
						listItems[currentIndex].querySelector('a').click();
					else listItems[0].querySelector('a').click();
					break;
				default:
					return;
			}
		});

		function highlightSuggestion(listItems, index) {
			for (const item of listItems) item.classList.remove('highlight');
			listItems[index].classList.add('highlight');
		}

		suggestionsElement.addEventListener('mousedown', function (event) {
			event.preventDefault();
			event.stopPropagation();
		});

		worker.onmessage = function (e) {
			suggestionsCache = e.data.slice(0, SUGGESTIONS_MAX_SIZE);
			renderSuggestions();
		};

		const renderSuggestions = () => {
			if (isFocused) {
				suggestionsElement.innerHTML = '';
				for (const option of suggestionsCache) {
					const listItem = document.createElement('li');
					listItem.classList.add('suggestion');

					const span_secondary = document.createElement('span');
					span_secondary.innerText = ' > ' + option.item.Context;
					span_secondary.classList.add('secondary');

					const span = document.createElement('span');
					span.innerText = option.item.Primary;

					const anchor = document.createElement('a');

					if (option.item.Jump == 1)
						anchor.href = `${option.item.Page}#${option.item.Primary}`;
					else anchor.href = `${option.item.Page}`;

					anchor.appendChild(span);
					anchor.appendChild(span_secondary);
					listItem.appendChild(anchor);
					suggestionsElement.appendChild(listItem);
				}
			}
		};
	});
