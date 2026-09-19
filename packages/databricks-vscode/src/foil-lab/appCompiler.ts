import type {FoilAppConfig} from "./FoilLabTypes";

export interface FoilAppArtifact {
    relativePath: string;
    content: string;
}

export interface FoilAppCompilationPlan {
    resourceKey: string;
    appName: string;
    artifacts: FoilAppArtifact[];
    requiredGoldTables: string[];
}

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_RESOURCE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_APP_NAME = /^[a-z0-9][a-z0-9-]*$/;

function yamlQuote(value: string): string {
    return JSON.stringify(value);
}

function fullTable(config: FoilAppConfig, table: string): string {
    return `${config.catalog}.${config.goldSchema}.${table}`;
}

function buildBundleResource(
    config: FoilAppConfig,
    tables: string[]
): string {
    const tableResources = tables
        .map(
            (table) => `        - name: ${table.replace(/_/g, "-")}
          uc_securable:
            securable_full_name: ${yamlQuote(fullTable(config, table))}
            securable_type: TABLE
            permission: SELECT`
        )
        .join("\n");

    return `resources:
  apps:
    ${config.appId}:
      name: ${yamlQuote(config.appName)}
      description: ${yamlQuote("FOIL Virtual Lab read-only Gold explorer")}
      source_code_path: ./app
      resources:
        - name: foil-sql-warehouse
          sql_warehouse:
            id: ${yamlQuote(config.sqlWarehouseId)}
            permission: CAN_USE
${tableResources}
`;
}

function buildAppYaml(config: FoilAppConfig): string {
    return `command: ['streamlit', 'run', 'app.py']
env:
  - name: FOIL_SQL_WAREHOUSE_ID
    valueFrom: foil-sql-warehouse
  - name: FOIL_CATALOG
    value: ${yamlQuote(config.catalog)}
  - name: FOIL_GOLD_SCHEMA
    value: ${yamlQuote(config.goldSchema)}
  - name: STREAMLIT_GATHER_USAGE_STATS
    value: 'false'
`;
}

function buildAppPython(): string {
    return `"""FOIL Virtual Lab - generated read-only Databricks App."""

from __future__ import annotations

import os

import pandas as pd
import streamlit as st
from databricks import sql
from databricks.sdk.core import Config

CATALOG = os.environ["FOIL_CATALOG"]
GOLD_SCHEMA = os.environ["FOIL_GOLD_SCHEMA"]
WAREHOUSE_ID = os.environ["FOIL_SQL_WAREHOUSE_ID"]


def full_table(table: str) -> str:
    return f"\`{CATALOG}\`.\`{GOLD_SCHEMA}\`.\`{table}\`"


def query(sql_text: str) -> pd.DataFrame:
    cfg = Config()
    server_hostname = cfg.host
    if server_hostname.startswith("https://"):
        server_hostname = server_hostname.removeprefix("https://")
    elif server_hostname.startswith("http://"):
        server_hostname = server_hostname.removeprefix("http://")

    with sql.connect(
        server_hostname=server_hostname,
        http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
        credentials_provider=lambda: cfg.authenticate,
        _use_arrow_native_complex_types=False,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql_text)
            return cursor.fetchall_arrow().to_pandas()


def safe_query(sql_text: str, label: str) -> pd.DataFrame:
    try:
        return query(sql_text)
    except Exception as exc:
        st.warning(f"{label} is not available yet: {exc}")
        return pd.DataFrame()


st.set_page_config(page_title="FOIL Virtual Lab", layout="wide")
st.title("FOIL Virtual Lab")
st.caption(
    "Eolien active · read-only Gold layer · synthetic R&D / virtual-lab evidence"
)

registry = safe_query(
    f"""
    SELECT campaign_id, source_hash, technology, machine_id,
           machine_model_version, classification, objective, compiled_at_utc
    FROM {full_table("campaign_registry")}
    ORDER BY compiled_at_utc DESC
    LIMIT 500
    """,
    "Campaign registry",
)

overview_tab, campaigns_tab, statistics_tab, data_tab = st.tabs(
    ["Overview", "Campaigns", "Design statistics", "Gold data"]
)

with overview_tab:
    c1, c2, c3 = st.columns(3)
    c1.metric("Campaign records", len(registry))
    c2.metric(
        "Active branch",
        registry.iloc[0]["technology"] if not registry.empty else "EOLIEN",
    )
    c3.metric(
        "Data mode",
        registry.iloc[0]["classification"] if not registry.empty else "SYNTHETIC",
    )
    st.info(
        "This App visualizes registered experiment contracts and Gold outputs. "
        "It does not convert synthetic results into measured engineering evidence."
    )

with campaigns_tab:
    if registry.empty:
        st.info("Run a FOIL campaign contract job to populate Gold.")
    else:
        campaign_ids = registry["campaign_id"].drop_duplicates().tolist()
        selected = st.selectbox("Campaign", campaign_ids)
        st.dataframe(
            registry[registry["campaign_id"] == selected],
            use_container_width=True,
            hide_index=True,
        )
        parameters = safe_query(
            f"""
            SELECT campaign_id, source_hash, parameter_path, value_index,
                   parameter_value_json, parameter_value_numeric
            FROM {full_table("campaign_parameters")}
            ORDER BY campaign_id, parameter_path, value_index
            LIMIT 5000
            """,
            "Campaign parameters",
        )
        if not parameters.empty:
            st.dataframe(
                parameters[parameters["campaign_id"] == selected],
                use_container_width=True,
                hide_index=True,
            )

with statistics_tab:
    statistics = safe_query(
        f"""
        SELECT campaign_id, source_hash, parameter_path, value_count,
               mean_value, stddev_value, min_value, max_value
        FROM {full_table("campaign_design_statistics")}
        ORDER BY campaign_id, parameter_path
        LIMIT 5000
        """,
        "Experiment-design descriptive statistics",
    )
    if not statistics.empty:
        st.caption(
            "Statistics below summarize configured experiment-design parameters, "
            "not measured or simulated machine performance."
        )
        st.dataframe(statistics, use_container_width=True, hide_index=True)

with data_tab:
    st.write("Gold contract")
    st.code(f"{CATALOG}.{GOLD_SCHEMA}", language=None)
    st.dataframe(registry, use_container_width=True, hide_index=True)
`;
}

export function compileApp(config: FoilAppConfig): FoilAppCompilationPlan {
    if (!SAFE_RESOURCE.test(config.appId)) {
        throw new Error("App resource key is not safe for a Databricks bundle.");
    }
    if (!SAFE_APP_NAME.test(config.appName)) {
        throw new Error("Databricks App name must be lowercase alphanumeric/hyphen.");
    }
    if (!SAFE_IDENTIFIER.test(config.catalog)) {
        throw new Error("Configure a simple Unity Catalog catalog identifier first.");
    }
    if (!SAFE_IDENTIFIER.test(config.goldSchema)) {
        throw new Error("Gold schema is not a safe Unity Catalog identifier.");
    }
    if (!SAFE_RESOURCE.test(config.sqlWarehouseId)) {
        throw new Error("Configure a valid SQL warehouse ID first.");
    }
    if (config.readOnly !== true) {
        throw new Error("The current FOIL App compiler supports read-only mode only.");
    }

    const requiredGoldTables = [
        "campaign_registry",
        "campaign_parameters",
        "campaign_design_statistics",
    ];

    const manifest = {
        compilerVersion: "0.1",
        resourceKey: config.appId,
        appName: config.appName,
        deployment: config.deployment,
        readOnly: config.readOnly,
        catalog: config.catalog,
        goldSchema: config.goldSchema,
        sqlWarehouseResource: "foil-sql-warehouse",
        requiredGoldTables,
        prerequisite:
            "Run at least one campaign with descriptive_statistics before first App deployment.",
    };

    return {
        resourceKey: config.appId,
        appName: config.appName,
        requiredGoldTables,
        artifacts: [
            {
                relativePath: "app/app.py",
                content: buildAppPython(),
            },
            {
                relativePath: "app/app.yaml",
                content: buildAppYaml(config),
            },
            {
                relativePath: "app/requirements.txt",
                content:
                    "databricks-sdk\ndatabricks-sql-connector\nstreamlit\npandas\n",
            },
            {
                relativePath: "app/manifest.json",
                content: `${JSON.stringify(manifest, null, 4)}\n`,
            },
            {
                relativePath: "foil-app.yml",
                content: buildBundleResource(config, requiredGoldTables),
            },
        ],
    };
}
