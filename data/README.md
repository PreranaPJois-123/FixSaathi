# FixSaathi repair data

- `raw/appliancedb/`: ApplianceDB free sample CSVs + LICENSE/SOURCES, commit in `FETCH_INFO.json`. ODbL-1.0. Contains data from ApplianceDB (https://github.com/ApplianceDB/ApplianceDB-public).
- `raw/openrepair/`: place the Open Repair Alliance CSV here (not included; CC BY-SA 4.0; download via their form).
- `processed/`: unified records (`repair_records.jsonl`, derived from ODbL data, so this file is offered under ODbL-1.0), `rejected.jsonl`, `processing_report.json`.
- `synthetic/`: made-up demo records, clearly labelled, never real repair history.
- `schemas/`: JSON Schema for a repair record.

See docs/DATASET_SOURCES.md, docs/DATASET_ARCHITECTURE.md and docs/RAG_PIPELINE.md.
