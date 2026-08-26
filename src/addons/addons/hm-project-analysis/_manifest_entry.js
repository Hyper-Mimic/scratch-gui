const manifest = {
    "name": "Project Analysis",
    "description": "Analyze the current project: sprite / block / script counts, block-category breakdown with progress bars, extension info and hidden errors. Open it from the Settings menu.",
    "editorOnly": true,
    "tags": [
        "new"
    ],
    "credits": [
        {
            "name": "Clyain",
            "link": "https://github.com/Clyain"
        }
    ],
    "settings": [
        {
            "id": "showFileName",
            "name": "Show file name",
            "type": "boolean",
            "default": true
        },
        {
            "id": "showSpriteCount",
            "name": "Show sprite count",
            "type": "boolean",
            "default": true
        },
        {
            "id": "showCostumeCount",
            "name": "Show costume count",
            "type": "boolean",
            "default": true
        },
        {
            "id": "showSoundCount",
            "name": "Show sound count",
            "type": "boolean",
            "default": true
        },
        {
            "id": "showBlocksNum",
            "name": "Show block count",
            "type": "boolean",
            "default": true
        },
        {
            "id": "showEffectiveBlocksNum",
            "name": "Show effective block count",
            "type": "boolean",
            "default": true
        },
        {
            "id": "showScriptsNum",
            "name": "Show script count",
            "type": "boolean",
            "default": true
        },
        {
            "id": "showEffectiveScriptsNum",
            "name": "Show effective script count",
            "type": "boolean",
            "default": true
        },
        {
            "id": "showVarDefinitionsNum",
            "name": "Show variable definitions count",
            "type": "boolean",
            "default": false
        },
        {
            "id": "showListDefinitionsNum",
            "name": "Show list definitions count",
            "type": "boolean",
            "default": false
        },
        {
            "id": "showFuncDefinitionsNum",
            "name": "Show custom-block definitions count",
            "type": "boolean",
            "default": false
        },
        {
            "id": "showExtensionsInfo",
            "name": "Show extension info",
            "type": "boolean",
            "default": false
        },
        {
            "id": "showSpecificExtensions",
            "name": "Show specific extensions",
            "type": "boolean",
            "default": true
        },
        {
            "id": "betterProgressBar",
            "name": "Better progress bar for block categories",
            "type": "boolean",
            "default": false
        },
        {
            "id": "orderType",
            "name": "Block category sort order",
            "type": "select",
            "potentialValues": [
                {
                    "name": "Original order (editor order)",
                    "id": "original"
                },
                {
                    "name": "By count (highest to lowest)",
                    "id": "byCount"
                }
            ],
            "default": "original"
        },
        {
            "id": "datadisplayway",
            "name": "Variables & Lists display",
            "type": "select",
            "potentialValues": [
                {
                    "name": "Show only 'Variables'",
                    "id": "onlydata"
                },
                {
                    "name": "Separate 'Variables' and 'Lists'",
                    "id": "separated"
                }
            ],
            "default": "onlydata"
        }
    ],
    "userscripts": [
        {
            "url": "userscript.js"
        }
    ]
};
export default manifest;
