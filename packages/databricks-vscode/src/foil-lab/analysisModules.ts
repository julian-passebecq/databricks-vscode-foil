import type {FoilCampaignConfig, FoilLabProjectConfig} from "./FoilLabTypes";

function jsonString(value: unknown): string {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
        throw new Error(
            "Unable to serialize FOIL analysis module configuration."
        );
    }
    return serialized;
}

function pythonLiteralJson(value: unknown): string {
    return jsonString(value).replace(/'''/g, "\\u0027\\u0027\\u0027");
}

export function isAnalysisEnabled(
    campaign: FoilCampaignConfig,
    moduleId: string
): boolean {
    return campaign.analyses.some(
        (analysis) => analysis.module === moduleId && analysis.enabled !== false
    );
}

export function buildAnalysisTaskYaml(
    campaign: FoilCampaignConfig,
    includeResponseStatistics = false
): string {
    const tasks: string[] = [];

    if (isAnalysisEnabled(campaign, "descriptive_statistics")) {
        tasks.push(`        - task_key: descriptive_statistics
          depends_on:
            - task_key: register_campaign_contract
          spark_python_task:
            python_file: ../src/analyses/descriptive_statistics.py
          environment_key: default`);
    }

    if (
        includeResponseStatistics &&
        isAnalysisEnabled(campaign, "response_statistics")
    ) {
        tasks.push(`        - task_key: response_statistics
          depends_on:
            - task_key: register_campaign_contract
          spark_python_task:
            python_file: ../src/analyses/response_statistics.py
          environment_key: default`);
    }

    return tasks.length === 0 ? "" : `\n${tasks.join("\n")}`;
}

export function buildDescriptiveStatisticsRunner(
    project: FoilLabProjectConfig,
    campaign: FoilCampaignConfig,
    sourceHash: string
): string | undefined {
    if (!isAnalysisEnabled(campaign, "descriptive_statistics")) {
        return undefined;
    }

    return `"""Generated FOIL experiment-design descriptive statistics.

This module summarizes configured numeric parameter ranges only. It does not
represent simulated or measured machine performance.
"""

from __future__ import annotations

import json

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

PROJECT = json.loads(r'''${pythonLiteralJson(project)}''')
CAMPAIGN = json.loads(r'''${pythonLiteralJson(campaign)}''')
SOURCE_HASH = "${sourceHash}"


def main():
    spark = SparkSession.builder.getOrCreate()
    gold_schema = PROJECT["databricks"]["goldSchema"]
    catalog = PROJECT["databricks"].get("catalog")
    campaign_id = CAMPAIGN["campaignId"]

    if catalog:
        spark.sql(f"USE CATALOG `{catalog}`")

    source = (
        spark.table(f"\`{gold_schema}\`.campaign_parameters")
        .where(F.col("campaign_id") == campaign_id)
        .where(F.col("source_hash") == SOURCE_HASH)
        .where(F.col("parameter_value_numeric").isNotNull())
    )

    stats = (
        source.groupBy("parameter_path")
        .agg(
            F.count("*").cast("long").alias("value_count"),
            F.avg("parameter_value_numeric").alias("mean_value"),
            F.stddev_samp("parameter_value_numeric").alias("stddev_value"),
            F.min("parameter_value_numeric").alias("min_value"),
            F.max("parameter_value_numeric").alias("max_value"),
        )
        .withColumn("campaign_id", F.lit(campaign_id))
        .withColumn("source_hash", F.lit(SOURCE_HASH))
        .select(
            "campaign_id",
            "source_hash",
            "parameter_path",
            "value_count",
            "mean_value",
            "stddev_value",
            "min_value",
            "max_value",
        )
    )

    spark.sql(
        f"""
        CREATE TABLE IF NOT EXISTS \`{gold_schema}\`.campaign_design_statistics (
            campaign_id STRING,
            source_hash STRING,
            parameter_path STRING,
            value_count BIGINT,
            mean_value DOUBLE,
            stddev_value DOUBLE,
            min_value DOUBLE,
            max_value DOUBLE
        ) USING DELTA
        """
    )

    stats.createOrReplaceTempView("foil_campaign_design_statistics")
    spark.sql(
        f"""
        MERGE INTO \`{gold_schema}\`.campaign_design_statistics target
        USING foil_campaign_design_statistics source
        ON target.campaign_id = source.campaign_id
           AND target.source_hash = source.source_hash
           AND target.parameter_path = source.parameter_path
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
        """
    )

    print(
        json.dumps(
            {
                "campaign_id": campaign_id,
                "source_hash": SOURCE_HASH,
                "output": f"{gold_schema}.campaign_design_statistics",
                "scope": "EXPERIMENT_DESIGN_PARAMETERS",
                "status": "SUCCESS",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
`;
}

export function buildResponseStatisticsRunner(
    project: FoilLabProjectConfig,
    campaign: FoilCampaignConfig,
    sourceHash: string
): string | undefined {
    if (!isAnalysisEnabled(campaign, "response_statistics")) {
        return undefined;
    }

    return `"""Generated FOIL synthetic-response descriptive statistics.

This module summarizes explicitly synthetic scenario-response proxies only.
It does not represent measured Foil'O performance.
"""

from __future__ import annotations

import json

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

PROJECT = json.loads(r'''${pythonLiteralJson(project)}''')
CAMPAIGN = json.loads(r'''${pythonLiteralJson(campaign)}''')
SOURCE_HASH = "${sourceHash}"

METRICS = [
    "available_fluid_power_kw",
    "capture_proxy",
    "mechanical_power_proxy_kw",
    "electrical_power_proxy_kw",
    "efficiency_proxy",
    "energy_proxy_kwh",
    "load_proxy_n",
]


def main():
    spark = SparkSession.builder.getOrCreate()
    gold_schema = PROJECT["databricks"]["goldSchema"]
    catalog = PROJECT["databricks"].get("catalog")
    campaign_id = CAMPAIGN["campaignId"]

    if catalog:
        spark.sql(f"USE CATALOG `{catalog}`")

    source = (
        spark.table(f"\`{gold_schema}\`.scenario_response_results")
        .where(F.col("campaign_id") == campaign_id)
        .where(F.col("source_hash") == SOURCE_HASH)
        .where(F.col("result_classification") == "SYNTHETIC_MODEL_OUTPUT")
    )

    if source.limit(1).count() == 0:
        raise RuntimeError(
            "No SYNTHETIC_MODEL_OUTPUT rows exist for this campaign/source hash."
        )

    rows = []
    for metric in METRICS:
        result = source.agg(
            F.count(F.col(metric)).cast("long").alias("value_count"),
            F.avg(metric).alias("mean_value"),
            F.stddev_samp(metric).alias("stddev_value"),
            F.min(metric).alias("min_value"),
            F.max(metric).alias("max_value"),
        ).first()
        rows.append(
            (
                campaign_id,
                SOURCE_HASH,
                "SYNTHETIC_MODEL_OUTPUT",
                metric,
                int(result["value_count"]),
                float(result["mean_value"]),
                (
                    None
                    if result["stddev_value"] is None
                    else float(result["stddev_value"])
                ),
                float(result["min_value"]),
                float(result["max_value"]),
            )
        )

    stats = spark.createDataFrame(
        rows,
        schema=(
            "campaign_id string, source_hash string, result_classification string, "
            "metric string, value_count long, mean_value double, "
            "stddev_value double, min_value double, max_value double"
        ),
    )

    spark.sql(
        f"""
        CREATE TABLE IF NOT EXISTS \`{gold_schema}\`.campaign_response_statistics (
            campaign_id STRING,
            source_hash STRING,
            result_classification STRING,
            metric STRING,
            value_count BIGINT,
            mean_value DOUBLE,
            stddev_value DOUBLE,
            min_value DOUBLE,
            max_value DOUBLE
        ) USING DELTA
        """
    )

    stats.createOrReplaceTempView("foil_campaign_response_statistics")
    spark.sql(
        f"""
        MERGE INTO \`{gold_schema}\`.campaign_response_statistics target
        USING foil_campaign_response_statistics source
        ON target.campaign_id = source.campaign_id
           AND target.source_hash = source.source_hash
           AND target.metric = source.metric
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
        """
    )

    print(
        json.dumps(
            {
                "campaign_id": campaign_id,
                "source_hash": SOURCE_HASH,
                "output": f"{gold_schema}.campaign_response_statistics",
                "scope": "SYNTHETIC_MODEL_OUTPUT",
                "metric_count": len(rows),
                "status": "SUCCESS",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
`;
}
