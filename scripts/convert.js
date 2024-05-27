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
Hooks.on('renderRollTableDirectory', async (RollTableDirectory, html, css) => {
    log("Roll Compendium loaded!");

    let tableActions = html.find('.header-actions.action-buttons.flexrow');
    tableActions.append(
        "<button type='button' class='import-compendium-to-table'><i class='fas fa-tasks'></i> Import Compendium(s)</button>"
    );
    html.on('click', '.import-compendium-to-table', async (event) => {
        openRollCompendiumDialog();
    });
});

async function openRollCompendiumDialog() {
    log("Opening Roll Compendium dialog...");

    // Fetch all Compendiums metadata only (lazy loading content later)
    const packs = game.packs.map(p => ({
        title: p.metadata.label,
        collection: p.collection
    }));

    // Sort packs alphabetically by title
    packs.sort((a, b) => a.title.localeCompare(b.title));

    log("Fetched compendium metadata: ", packs);

    // Create dialog content
    let content = `
        <div class="roll-compendium">
            <h2>Select Entries to Import</h2>
            <label for="table-name">Rollable Table Name:</label>
            <input type="text" id="table-name" name="table-name" value="Imported Entries"><br>
            <input type="checkbox" id="select-all" name="select-all">
            <label for="select-all">Select All</label>
            <ul>`;
    
    for (let pack of packs) {
        content += `
            <li class="compendium-folder">
                <strong class="toggle-pack" data-pack="${pack.collection}" data-title="${pack.title}">+ ${pack.title}</strong>
                <input type="checkbox" class="select-all-pack" data-pack="${pack.collection}">
                <ul class="pack-entries" data-pack="${pack.collection}" style="display: none;"></ul>
            </li>`;
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
                    let packsToLoad = new Set();
                    
                    html.find('input:checked').each(function () {
                        if (this.dataset.name !== undefined) {
                            selectedEntries.push({
                                pack: this.dataset.pack,
                                id: this.dataset.id,
                                name: this.dataset.name,
                                img: this.dataset.img
                            });
                        } else if (this.classList.contains('select-all-pack')) {
                            packsToLoad.add(this.dataset.pack);
                        }
                    });

                    // Load any packs that were not expanded but have their "select all" checked
                    for (let pack of packsToLoad) {
                        const packContent = await game.packs.get(pack).getDocuments();
                        const sortedContent = packContent.sort((a, b) => a.name.localeCompare(b.name));
                        log(`Loaded content for pack ${pack}: `, sortedContent);

                        sortedContent.forEach(item => {
                            if (!selectedEntries.find(entry => entry.id === item.id && entry.pack === pack)) {
                                selectedEntries.push({
                                    pack: pack,
                                    id: item.id,
                                    name: item.name,
                                    img: item.img
                                });
                            }
                        });
                    }

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
            // Cache selectors
            const $selectAll = html.find('#select-all');
            const $compendiumInputs = html.find('.roll-compendium input[type="checkbox"]');

            // Add event listeners
            $selectAll.on('click', (event) => {
                $compendiumInputs.prop('checked', event.target.checked);
            });

            html.find('.select-all-pack').on('click', (event) => {
                const pack = $(event.currentTarget).data('pack');
                const isChecked = $(event.currentTarget).prop('checked');
                html.find(`.pack-entries[data-pack="${pack}"] input[type="checkbox"]`).prop('checked', isChecked);
            });

            html.find('.entry-checkbox').on('click', (event) => {
                const pack = $(event.currentTarget).data('pack');
                const allChecked = html.find(`.pack-entries[data-pack="${pack}"] input[type="checkbox"]:not(:checked)`).length === 0;
                html.find(`.select-all-pack[data-pack="${pack}"]`).prop('checked', allChecked);

                const allCheckedOverall = html.find('.entry-checkbox:not(:checked)').length === 0;
                $selectAll.prop('checked', allCheckedOverall);
            });

            html.find('.toggle-pack').on('click', async (event) => {
                const pack = $(event.currentTarget).data('pack');
                const title = $(event.currentTarget).data('title');
                const $packEntries = html.find(`.pack-entries[data-pack="${pack}"]`);
                const $icon = $(event.currentTarget);

                if ($packEntries.is(':visible')) {
                    $packEntries.hide();
                    $icon.text(`+ ${title}`);
                } else {
                    // Lazy load pack content if not already loaded
                    if ($packEntries.is(':empty')) {
                        log(`Loading content for pack ${pack}...`);
                        const packContent = await game.packs.get(pack).getDocuments();
                        const sortedContent = packContent.sort((a, b) => a.name.localeCompare(b.name));
                        log(`Loaded content for pack ${pack}: `, sortedContent);

                        for (let item of sortedContent) {
                            $packEntries.append(`<li>
                                <input type="checkbox" class="entry-checkbox" data-pack="${pack}" data-id="${item.id}" data-name="${item.name}" data-img="${item.img}"> ${item.name}
                            </li>`);
                        }
                    }
                    $packEntries.show();
                    $icon.text(`- ${title}`);
                }
            });
        }
    }).render(true);
}

async function importSelectedEntries(entries, tableName) {
    log("Importing selected entries...", entries);

    // Create a new rollable table with the specified name
    const tableResults = entries.map((entry, index) => ({
        documentCollection: entry.pack,
        documentId: entry.id,
        range: [index + 1, index + 1],
        text: entry.name,
        img: entry.img,
        type: CONST.TABLE_RESULT_TYPES.COMPENDIUM
    }));

    const table = await RollTable.create({ name: tableName, results: tableResults, formula: `1d${entries.length}` });

    ui.notifications.info(`Imported ${entries.length} entries into a new rollable table named "${tableName}".`);
    log(`Imported ${entries.length} entries into the table named "${tableName}".`);
}