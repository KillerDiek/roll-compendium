// Function to log messages if Dev mode is enabled
function log(message, ...args) {
	if (game.settings.get('roll-compendium', 'devMode')) {
		console.log(`Roll Compendium | ${message}`, ...args);
	}
}

// Register the settings
Hooks.once('init', () => {
	game.settings.register('roll-compendium', 'devMode', {
		name: 'Developer Mode',
		hint: 'Enable this to log additional debug information to the console.',
		scope: 'client',
		config: true,
		type: Boolean,
		default: false
	});
});

// Add Roll Compendium button
Hooks.on('renderRollTableDirectory', (RolltableDirectory, html, css) => {
	log("Roll Compendium loaded!");

	let table_actions = html.find(`[class="header-actions action-buttons flexrow"]`);
	table_actions.append(
		"<button type='button' class='import-compendium-to-table'><i class='fas fa-tasks'></i> Import Compendium(s)</button>"
	);
	html.on('click', '.import-compendium-to-table', (event) => {
		openRollCompendiumDialog();
	});
});

async function openRollCompendiumDialog() {
	log("Opening Roll Compendium dialog...");

    const DIALOGOPTIONS = {
        width: 680,
        height: 1240
    };

	// Fetch all Compendiums
	const packs = game.packs.map(p => {
		return { title: p.metadata.label, collection: p.collection };
	});

	log("Fetched compendium packs: ", packs);

	// Create dialog content
	let content = `<div class="roll-compendium"><h2>Select Entries to Import</h2>`;
	content += `<label for="table-name">Rollable Table Name:</label>`;
	content += `<input type="text" id="table-name" name="table-name" value="Imported Entries"><br>`;
	content += `<input type="checkbox" id="select-all" name="select-all"><label for="select-all">Select All</label>`;
	content += `<ul>`;
	for (let pack of packs) {
		content += `<li class="compendium-folder"><strong>${pack.title}</strong> 
		<input type="checkbox" class="select-all-pack" data-pack="${pack.collection}" name="select-all-${pack.collection}"><label for="select-all-${pack.collection}">Select All</label>
		<button type="button" class="toggle-pack" data-pack="${pack.collection}">Collapse</button>
		<ul class="pack-entries" data-pack="${pack.collection}">`;
		const packContent = await game.packs.get(pack.collection).getDocuments();
		log(`Fetched contents of pack ${pack.title}: `, packContent);
		for (let item of packContent) {
			content += `<li><input type="checkbox" data-pack="${pack.collection}" data-id="${item.id}" data-name="${item.name}" data-img="${item.img}"> ${item.name}</li>`;
		}
		content += `</ul></li>`;
	}
	content += `</ul></div>`;

	// Create and show the dialog
	new Dialog({
		title: 'Roll Compendium',
		content: content,
		buttons: {
			import: {
				label: 'Import',
				callback: async (html) => {
					let selectedEntries = [];
					html.find('input:checked').each(async function() {
                        if (this.dataset.name === undefined) return;
						selectedEntries.push({ pack: this.dataset.pack, id: this.dataset.id, name: this.dataset.name, img: this.dataset.img });
					});
					const tableName = html.find('#table-name').val();
					log("Selected entries to import: ", selectedEntries);
					log("Table name: ", tableName);
					await importSelectedEntries(selectedEntries, tableName);
				}
			},
			cancel: {
				label: 'Cancel'
			}
		},
		default: 'import',
        render: (html) => {
			// Add event listeners
			html.find('#select-all').on('click', (event) => {
				html.find('.roll-compendium input[type="checkbox"]').prop('checked', event.target.checked);
			});

			html.find('.select-all-pack').on('click', (event) => {
				const pack = $(event.currentTarget).data('pack');
				html.find(`.pack-entries[data-pack="${pack}"] input[type="checkbox"]`).prop('checked', event.target.checked);
			});

			html.find('.toggle-pack').on('click', (event) => {
				const pack = $(event.currentTarget).data('pack');
				const packEntries = html.find(`.pack-entries[data-pack="${pack}"]`);
				if (packEntries.css('display') === 'none') {
					packEntries.css('display', 'block');
					$(event.currentTarget).text('Collapse');
				} else {
					packEntries.css('display', 'none');
					$(event.currentTarget).text('Expand');
				}
			});
		}
	}, DIALOGOPTIONS).render(true);
}

async function importSelectedEntries(entries, tableName) {
	log("Importing selected entries...", entries);

	// Create a new rollable table with the specified name
	let tableResults = entries.map((entry, index) => ({
		documentCollection: entry.pack,
		documentId: entry.id,
		range: [index + 1, index + 1],
		text: entry.name,
        img: entry.img,
		type: CONST.TABLE_RESULT_TYPES.COMPENDIUM
	}));

	let table = await RollTable.create({ name: tableName, results: tableResults, formula: '1d' + entries.length });

	ui.notifications.info(`Imported ${entries.length} entries into a new rollable table named "${tableName}".`);
	log(`Imported ${entries.length} entries into the table named "${tableName}".`);
}
