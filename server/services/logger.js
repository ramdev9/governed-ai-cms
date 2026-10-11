const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "../db/database.sqlite");
const db = new sqlite3.Database(dbPath);

const AGENTIC_COLUMNS = [
    ["draft_v1", "TEXT"],
    ["draft_v2", "TEXT"],
    ["critique_v2", "TEXT"],
    ["selected_version", "INTEGER"],
    ["final_body", "TEXT"],
    ["gen_time_ms", "INTEGER"],
    ["critique_time_ms", "INTEGER"],
    ["refine_time_ms", "INTEGER"],
    ["critique_v2_time_ms", "INTEGER"],
    ["total_time_ms", "INTEGER"],
    ["finalized_at", "TEXT"]
];

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

const ready = (async () => {
    await run(`
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input TEXT,
      output TEXT,
      final_output TEXT,
      override_delta TEXT,
      override_percentage REAL,
      critique TEXT,
      critique_status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    const columns = await all("PRAGMA table_info(generations)");
    const existing = new Set(columns.map((column) => column.name));

    for (const [name, type] of AGENTIC_COLUMNS) {
        if (!existing.has(name)) {
            await run(`ALTER TABLE generations ADD COLUMN ${name} ${type}`);
        }
    }
})();

module.exports.ready = ready;

module.exports.logGeneration = function (input, output) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO generations (input, output, critique_status) VALUES (?, ?, 'PENDING')`,
            [input, JSON.stringify(output)],
            function (err) {
                if (err) return reject(err);
                resolve(this.lastID);
            }
        );
    });
};

module.exports.logCritique = function (id, critiqueData) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE generations SET critique = ?, critique_status = 'COMPLETE' WHERE id = ?`,
            [JSON.stringify(critiqueData), id],
            function (err) {
                if (err) return reject(err);
                resolve();
            }
        );
    });
};

module.exports.markCritiqueFailed = function (id) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE generations SET critique_status = 'FAILED' WHERE id = ?`,
            [id],
            function (err) {
                if (err) return reject(err);
                resolve();
            }
        );
    });
};

module.exports.logAgenticGeneration = async function (record) {
    await ready;

    const result = await run(
        `INSERT INTO generations (
            input,
            output,
            draft_v1,
            critique,
            draft_v2,
            critique_v2,
            gen_time_ms,
            critique_time_ms,
            refine_time_ms,
            critique_v2_time_ms,
            total_time_ms,
            critique_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETE')`,
        [
            record.input,
            JSON.stringify(record.draftV2),
            JSON.stringify(record.draftV1),
            JSON.stringify(record.critique),
            JSON.stringify(record.draftV2),
            JSON.stringify(record.critiqueV2),
            record.genTimeMs,
            record.critiqueTimeMs,
            record.refineTimeMs,
            record.critiqueV2TimeMs,
            record.totalTimeMs
        ]
    );

    return result.lastID;
};

module.exports.getAgenticGeneration = async function (id) {
    await ready;
    return get(
        `SELECT id, input, draft_v1, critique, draft_v2, critique_v2, selected_version, final_body,
                created_at, finalized_at, gen_time_ms, critique_time_ms, refine_time_ms,
                critique_v2_time_ms, total_time_ms
         FROM generations WHERE id = ?`,
        [id]
    );
};

module.exports.finalizeAgentic = async function (id, version, editedBody) {
    await ready;

    const row = await get(
        `SELECT draft_v1, draft_v2 FROM generations WHERE id = ?`,
        [id]
    );

    if (!row) {
        return null;
    }

    const selectedJson = version === 1 ? row.draft_v1 : row.draft_v2;
    let overridePercentage = null;
    let overrideDelta = null;

    if (editedBody && selectedJson) {
        const calculateOverride = require("./overrideService");
        const original = JSON.parse(selectedJson);
        const override = calculateOverride(original.body || "", editedBody);
        overridePercentage = override.overridePercentage;
        overrideDelta = JSON.stringify(override.diffSummary);
    }

    await run(
        `UPDATE generations
         SET selected_version = ?,
             final_body = ?,
             final_output = ?,
             override_percentage = COALESCE(?, override_percentage),
             override_delta = COALESCE(?, override_delta),
             finalized_at = datetime('now')
         WHERE id = ?`,
        [
            version,
            editedBody || null,
            selectedJson,
            overridePercentage,
            overrideDelta,
            id
        ]
    );

    return {
        id: Number(id),
        version,
        overridePercentage
    };
};
