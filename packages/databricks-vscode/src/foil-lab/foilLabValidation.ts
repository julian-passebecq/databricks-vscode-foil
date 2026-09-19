import type {
    FoilCampaignConfig,
    FoilLabProjectConfig,
    FoilLabValidationIssue,
    FoilMachineConfig,
} from "./FoilLabTypes";

const TECHNOLOGIES = new Set(["EOLIEN", "HYDROLIEN", "PROPULSION"]);
const MACHINE_STATUSES = new Set(["ACTIVE", "REFERENCE_ONLY", "EXPERIMENTAL"]);
const CLASSIFICATIONS = new Set(["SYNTHETIC", "SANITIZED_APPROVED"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(path: string, message: string): FoilLabValidationIssue {
    return {severity: "error", path, message};
}

function warning(path: string, message: string): FoilLabValidationIssue {
    return {severity: "warning", path, message};
}

export function validateProjectConfig(value: unknown): {
    config?: FoilLabProjectConfig;
    issues: FoilLabValidationIssue[];
} {
    const issues: FoilLabValidationIssue[] = [];
    if (!isRecord(value)) {
        return {issues: [error("project", "Project configuration must be an object.")]};
    }

    if (typeof value.version !== "string" || value.version.length === 0) {
        issues.push(error("version", "A non-empty version is required."));
    }
    if (typeof value.name !== "string" || value.name.length === 0) {
        issues.push(error("name", "A non-empty project name is required."));
    }
    if (!TECHNOLOGIES.has(String(value.activeTechnology))) {
        issues.push(error("activeTechnology", "Unknown Foil technology branch."));
    }
    if (!CLASSIFICATIONS.has(String(value.defaultClassification))) {
        issues.push(error("defaultClassification", "Classification must be SYNTHETIC or SANITIZED_APPROVED."));
    }
    if (value.allowRealData !== false) {
        issues.push(error("allowRealData", "The Free/Demo Foil Lab must explicitly keep real-data ingestion disabled."));
    }
    if (!isRecord(value.databricks)) {
        issues.push(error("databricks", "Databricks settings are required."));
    } else {
        for (const key of ["target", "goldSchema", "labJob", "appResource"]) {
            if (typeof value.databricks[key] !== "string" || value.databricks[key] === "") {
                issues.push(error(`databricks.${key}`, `${key} must be a non-empty string.`));
            }
        }
    }

    if (issues.some((issue) => issue.severity === "error")) {
        return {issues};
    }
    return {config: value as unknown as FoilLabProjectConfig, issues};
}

export function validateMachineConfig(value: unknown): {
    config?: FoilMachineConfig;
    issues: FoilLabValidationIssue[];
} {
    const issues: FoilLabValidationIssue[] = [];
    if (!isRecord(value)) {
        return {issues: [error("machine", "Machine configuration must be an object.")]};
    }

    if (typeof value.machineId !== "string" || value.machineId === "") {
        issues.push(error("machineId", "machineId is required."));
    }
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
        issues.push(error("modelVersion", "modelVersion is required for reproducibility."));
    }
    if (value.technology === "HYDROLIEN" && value.status === "ACTIVE") {
        issues.push(warning("status", "Hydrolien is currently a reference branch; review strategy before making it active."));
    }

    if (issues.some((issue) => issue.severity === "error")) {
        return {issues};
    }
    return {config: value as unknown as FoilMachineConfig, issues};
}

export function validateCampaignConfig(value: unknown): {
    config?: FoilCampaignConfig;
    issues: FoilLabValidationIssue[];
} {
    const issues: FoilLabValidationIssue[] = [];
    if (!isRecord(value)) {
        return {issues: [error("campaign", "Campaign configuration must be an object.")]};
    }

    for (const key of ["campaignId", "machineId", "objective"]) {
        if (typeof value[key] !== "string" || value[key] === "") {
            issues.push(error(key, `${key} is required.`));
        }
    }
    if (!TECHNOLOGIES.has(String(value.technology))) {
        issues.push(error("technology", "Unknown Foil technology branch."));
    }
    if (!CLASSIFICATIONS.has(String(value.classification))) {
        issues.push(error("classification", "Unknown data classification."));
    }
    if (!Array.isArray(value.analyses) || value.analyses.length === 0) {
        issues.push(error("analyses", "At least one analysis module is required."));
    } else {
        value.analyses.forEach((analysis, index) => {
            if (!isRecord(analysis) || typeof analysis.module !== "string" || analysis.module === "") {
                issues.push(error(`analyses[${index}].module`, "Analysis module id is required."));
            }
        });
    }

    if (issues.some((issue) => issue.severity === "error")) {
        return {issues};
    }
    return {config: value as unknown as FoilCampaignConfig, issues};
}
