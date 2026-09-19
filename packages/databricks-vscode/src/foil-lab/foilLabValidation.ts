import type {
    FoilAppConfig,
    FoilCampaignConfig,
    FoilLabProjectConfig,
    FoilLabValidationIssue,
    FoilMachineConfig,
} from "./FoilLabTypes";

const TECHNOLOGIES = new Set(["EOLIEN", "HYDROLIEN", "PROPULSION"]);
const MACHINE_STATUSES = new Set(["ACTIVE", "REFERENCE_ONLY", "EXPERIMENTAL"]);
const CLASSIFICATIONS = new Set(["SYNTHETIC", "SANITIZED_APPROVED"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_SCHEMA = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_APP_NAME = /^[a-z0-9][a-z0-9-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(path: string, message: string): FoilLabValidationIssue {
    return {severity: "error", path, message};
}

function warning(path: string, message: string): FoilLabValidationIssue {
    return {severity: "warning", path, message};
}

function validateSafeId(
    value: unknown,
    path: string,
    issues: FoilLabValidationIssue[]
): void {
    if (typeof value !== "string" || !SAFE_ID.test(value)) {
        issues.push(
            error(
                path,
                `${path} must contain only letters, numbers, underscore or hyphen and must start with a letter or number.`
            )
        );
    }
}

export function validateProjectConfig(value: unknown): {
    config?: FoilLabProjectConfig;
    issues: FoilLabValidationIssue[];
} {
    const issues: FoilLabValidationIssue[] = [];
    if (!isRecord(value)) {
        return {
            issues: [
                error("project", "Project configuration must be an object."),
            ],
        };
    }

    if (typeof value.version !== "string" || value.version.length === 0) {
        issues.push(error("version", "A non-empty version is required."));
    }
    if (typeof value.name !== "string" || value.name.length === 0) {
        issues.push(error("name", "A non-empty project name is required."));
    }
    if (!TECHNOLOGIES.has(String(value.activeTechnology))) {
        issues.push(
            error("activeTechnology", "Unknown Foil technology branch.")
        );
    }
    if (!CLASSIFICATIONS.has(String(value.defaultClassification))) {
        issues.push(
            error(
                "defaultClassification",
                "Classification must be SYNTHETIC or SANITIZED_APPROVED."
            )
        );
    }
    if (value.allowRealData !== false) {
        issues.push(
            error(
                "allowRealData",
                "The Free/Demo Foil Lab must explicitly keep real-data ingestion disabled."
            )
        );
    }
    if (!isRecord(value.databricks)) {
        issues.push(error("databricks", "Databricks settings are required."));
    } else {
        validateSafeId(value.databricks.target, "databricks.target", issues);
        validateSafeId(value.databricks.labJob, "databricks.labJob", issues);
        validateSafeId(
            value.databricks.appResource,
            "databricks.appResource",
            issues
        );
        if (
            typeof value.databricks.goldSchema !== "string" ||
            !SAFE_SCHEMA.test(value.databricks.goldSchema)
        ) {
            issues.push(
                error(
                    "databricks.goldSchema",
                    "goldSchema must be a simple Unity Catalog schema identifier."
                )
            );
        }
    }

    if (issues.some((issue) => issue.severity === "error")) {
        return {issues};
    }
    return {
        config: value as unknown as FoilLabProjectConfig,
        issues,
    };
}

export function validateMachineConfig(value: unknown): {
    config?: FoilMachineConfig;
    issues: FoilLabValidationIssue[];
} {
    const issues: FoilLabValidationIssue[] = [];
    if (!isRecord(value)) {
        return {
            issues: [
                error("machine", "Machine configuration must be an object."),
            ],
        };
    }

    validateSafeId(value.machineId, "machineId", issues);
    if (!TECHNOLOGIES.has(String(value.technology))) {
        issues.push(error("technology", "Unknown Foil technology branch."));
    }
    if (!MACHINE_STATUSES.has(String(value.status))) {
        issues.push(error("status", "Unknown machine status."));
    }
    if (!CLASSIFICATIONS.has(String(value.classification))) {
        issues.push(error("classification", "Unknown data classification."));
    }
    if (typeof value.modelVersion !== "string" || value.modelVersion === "") {
        issues.push(
            error(
                "modelVersion",
                "modelVersion is required for reproducibility."
            )
        );
    }
    if (value.parameters !== undefined && !isRecord(value.parameters)) {
        issues.push(
            error("parameters", "Machine parameters must be a JSON object.")
        );
    }
    if (value.technology === "HYDROLIEN" && value.status === "ACTIVE") {
        issues.push(
            warning(
                "status",
                "Hydrolien is currently a reference branch; review strategy before making it active."
            )
        );
    }

    if (issues.some((issue) => issue.severity === "error")) {
        return {issues};
    }
    return {
        config: value as unknown as FoilMachineConfig,
        issues,
    };
}

export function validateCampaignConfig(value: unknown): {
    config?: FoilCampaignConfig;
    issues: FoilLabValidationIssue[];
} {
    const issues: FoilLabValidationIssue[] = [];
    if (!isRecord(value)) {
        return {
            issues: [
                error("campaign", "Campaign configuration must be an object."),
            ],
        };
    }

    validateSafeId(value.campaignId, "campaignId", issues);
    validateSafeId(value.machineId, "machineId", issues);
    if (typeof value.objective !== "string" || value.objective.trim() === "") {
        issues.push(
            error("objective", "A non-empty experiment objective is required.")
        );
    }
    if (!TECHNOLOGIES.has(String(value.technology))) {
        issues.push(error("technology", "Unknown Foil technology branch."));
    }
    if (!CLASSIFICATIONS.has(String(value.classification))) {
        issues.push(error("classification", "Unknown data classification."));
    }
    if (value.test !== undefined && !isRecord(value.test)) {
        issues.push(
            error("test", "Campaign test configuration must be a JSON object.")
        );
    }
    if (!Array.isArray(value.analyses) || value.analyses.length === 0) {
        issues.push(
            error("analyses", "At least one analysis module is required.")
        );
    } else {
        value.analyses.forEach((analysis, index) => {
            if (
                !isRecord(analysis) ||
                typeof analysis.module !== "string" ||
                !SAFE_ID.test(analysis.module)
            ) {
                issues.push(
                    error(
                        `analyses[${index}].module`,
                        "Analysis module id must be a safe non-empty identifier."
                    )
                );
            }
            if (
                isRecord(analysis) &&
                analysis.config !== undefined &&
                !isRecord(analysis.config)
            ) {
                issues.push(
                    error(
                        `analyses[${index}].config`,
                        "Analysis module config must be a JSON object."
                    )
                );
            }
        });
    }

    if (issues.some((issue) => issue.severity === "error")) {
        return {issues};
    }
    return {
        config: value as unknown as FoilCampaignConfig,
        issues,
    };
}

export function validateAppConfig(value: unknown): {
    config?: FoilAppConfig;
    issues: FoilLabValidationIssue[];
} {
    const issues: FoilLabValidationIssue[] = [];
    if (!isRecord(value)) {
        return {
            issues: [error("app", "App configuration must be an object.")],
        };
    }

    validateSafeId(value.appId, "appId", issues);
    if (
        typeof value.appName !== "string" ||
        !SAFE_APP_NAME.test(value.appName)
    ) {
        issues.push(
            error(
                "appName",
                "Databricks App name must contain only lowercase letters, numbers, and hyphens."
            )
        );
    }
    if (value.framework !== "STREAMLIT") {
        issues.push(
            error(
                "framework",
                "The current FOIL App compiler supports STREAMLIT only."
            )
        );
    }
    if (
        value.deployment !== "DATABRICKS_APP" &&
        value.deployment !== "EXTERNAL"
    ) {
        issues.push(
            error(
                "deployment",
                "App deployment must be DATABRICKS_APP or EXTERNAL."
            )
        );
    }
    if (
        typeof value.goldSchema !== "string" ||
        !SAFE_SCHEMA.test(value.goldSchema)
    ) {
        issues.push(
            error(
                "goldSchema",
                "App goldSchema must be a simple Unity Catalog schema identifier."
            )
        );
    }
    if (typeof value.catalog !== "string") {
        issues.push(error("catalog", "catalog must be a string."));
    } else if (value.catalog === "") {
        issues.push(
            warning(
                "catalog",
                "Configure the Unity Catalog catalog before generating the Databricks App."
            )
        );
    } else if (!SAFE_SCHEMA.test(value.catalog)) {
        issues.push(
            error(
                "catalog",
                "catalog must be a simple Unity Catalog identifier."
            )
        );
    }
    if (typeof value.sqlWarehouseId !== "string") {
        issues.push(
            error("sqlWarehouseId", "sqlWarehouseId must be a string.")
        );
    } else if (value.sqlWarehouseId === "") {
        issues.push(
            warning(
                "sqlWarehouseId",
                "Configure the SQL warehouse before generating the Databricks App."
            )
        );
    } else if (!SAFE_ID.test(value.sqlWarehouseId)) {
        issues.push(
            error(
                "sqlWarehouseId",
                "sqlWarehouseId contains unsupported characters."
            )
        );
    }
    if (value.readOnly !== true) {
        issues.push(
            warning(
                "readOnly",
                "The first FOIL Databricks App should remain read-only until write/control actions are explicitly implemented."
            )
        );
    }
    if (value.canLaunchCampaigns === true) {
        issues.push(
            warning(
                "canLaunchCampaigns",
                "Campaign launch from Streamlit is not enabled in the current App compiler."
            )
        );
    }
    if (
        !Array.isArray(value.pages) ||
        !value.pages.every(
            (page) => typeof page === "string" && page.length > 0
        )
    ) {
        issues.push(
            error("pages", "pages must be an array of non-empty strings.")
        );
    }

    if (issues.some((issue) => issue.severity === "error")) {
        return {issues};
    }
    return {
        config: value as unknown as FoilAppConfig,
        issues,
    };
}
