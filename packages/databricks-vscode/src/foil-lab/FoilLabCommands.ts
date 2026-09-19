import {commands, Uri, window, workspace} from "vscode";

import type {BundleValidateModel} from "../bundle/models/BundleValidateModel";
import {FoilLabManager} from "./FoilLabManager";
import {FoilLabModel} from "./FoilLabModel";

export class FoilLabCommands {
    constructor(
        private readonly manager: FoilLabManager,
        private readonly model: FoilLabModel,
        private readonly bundleValidateModel: BundleValidateModel
    ) {}

    initializeProject = async (): Promise<void> => {
        try {
            await this.manager.initializeProject();
            window.showInformationMessage(
                "FOIL Lab initialized for Eolien-first R&D."
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to initialize FOIL Lab: ${(e as Error).message}`
            );
        }
    };

    refresh = async (): Promise<void> => {
        await this.manager.refresh();
    };

    validateProject = async (): Promise<void> => {
        const state = await this.model.refresh();
        const issues = [
            ...state.projectIssues,
            ...state.machines.flatMap((machine) => machine.issues),
            ...state.campaigns.flatMap((campaign) => campaign.issues),
        ];
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity === "warning");

        if (!state.initialized) {
            window.showWarningMessage(
                "FOIL Lab is not initialized in the active Databricks project."
            );
            return;
        }
        if (errors.length > 0) {
            window.showErrorMessage(
                `FOIL Lab validation failed: ${errors.length} error(s), ${warnings.length} warning(s).`
            );
            return;
        }
        window.showInformationMessage(
            `FOIL Lab validation passed${warnings.length > 0 ? ` with ${warnings.length} warning(s)` : ""}.`
        );
    };

    validateBundle = async (): Promise<void> => {
        if (
            !this.bundleValidateModel.target ||
            !this.bundleValidateModel.authProvider
        ) {
            window.showWarningMessage(
                "Configure a Databricks workspace and bundle target before validation."
            );
            return;
        }
        await this.bundleValidateModel.refresh();
        window.showInformationMessage("Databricks bundle validation passed.");
    };

    deploy = async (): Promise<void> => {
        await commands.executeCommand("databricks.bundle.deploy");
    };

    deployAndRun = async (): Promise<void> => {
        await commands.executeCommand(
            "databricks.bundle.deployAndRunFromInput"
        );
    };

    configureLogin = async (): Promise<void> => {
        await commands.executeCommand("databricks.connection.configureLogin");
    };

    focusGold = async (): Promise<void> => {
        await commands.executeCommand("unityCatalogView.focus");
        await commands.executeCommand("list.find");
    };

    openProjectConfig = async (): Promise<void> => {
        await this.openFile(this.model.projectConfigPath);
    };

    openAppSpec = async (): Promise<void> => {
        await this.openFile(this.model.appSpecPath);
    };

    createCampaign = async (): Promise<void> => {
        try {
            if (!this.model.state.initialized) {
                await this.manager.initializeProject();
            }
            const campaignId = await window.showInputBox({
                title: "Create FOIL campaign",
                prompt: "Campaign id used for the version-controlled JSON file",
                placeHolder: "wind_turbulence_sensitivity_001",
                validateInput: (value) =>
                    value.trim().length === 0
                        ? "Campaign id is required."
                        : undefined,
            });
            if (campaignId === undefined) {
                return;
            }

            const filePath = await this.manager.createCampaign(campaignId);
            await this.openFile(filePath);
        } catch (e) {
            window.showErrorMessage(
                `Unable to create FOIL campaign: ${(e as Error).message}`
            );
        }
    };

    compileCampaign = async (): Promise<void> => {
        const campaignId = await this.pickCampaign("Compile FOIL campaign");
        if (campaignId === undefined) {
            return;
        }

        try {
            const manifestPath = await this.manager.compileCampaign(campaignId);
            await this.openFile(manifestPath);
            window.showInformationMessage(
                `FOIL campaign ${campaignId} compiled to .foil-lab/build. Review before adding it to the bundle.`
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to compile FOIL campaign: ${(e as Error).message}`
            );
        }
    };

    applyCampaign = async (): Promise<void> => {
        const campaignId = await this.pickCampaign(
            "Apply FOIL campaign to Databricks bundle"
        );
        if (campaignId === undefined) {
            return;
        }

        const confirmation = await window.showWarningMessage(
            `Apply ${campaignId} to the active Databricks bundle? This updates the bundle include list but does not deploy anything.`,
            {modal: true},
            "Apply"
        );
        if (confirmation !== "Apply") {
            return;
        }

        try {
            const result = await this.manager.applyCampaign(campaignId);
            let validationMessage =
                "Bundle target is not configured; validate before deployment.";
            if (
                this.bundleValidateModel.target &&
                this.bundleValidateModel.authProvider
            ) {
                await this.bundleValidateModel.refresh();
                validationMessage = "Databricks bundle validation passed.";
            }

            window.showInformationMessage(
                result.changed
                    ? `FOIL campaign ${campaignId} added to ${result.bundleFile}. ${validationMessage}`
                    : `FOIL campaign ${campaignId} is already included. ${validationMessage}`
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to apply FOIL campaign: ${(e as Error).message}`
            );
        }
    };

    private async pickCampaign(
        title: string
    ): Promise<string | undefined> {
        const state = await this.model.refresh();
        const validCampaigns = state.campaigns.filter(
            (campaign) => campaign.config !== undefined
        );
        if (validCampaigns.length === 0) {
            window.showWarningMessage(
                "No valid FOIL campaign is available."
            );
            return undefined;
        }

        const selected = await window.showQuickPick(
            validCampaigns.map((campaign) => ({
                label: campaign.config!.campaignId,
                description: campaign.config!.objective,
            })),
            {
                title,
                placeHolder:
                    "Select a validated campaign from .foil-lab/campaigns",
            }
        );
        return selected?.label;
    }

    private async openFile(filePath: string | undefined): Promise<void> {
        if (filePath === undefined) {
            window.showWarningMessage(
                "Open or select a Databricks project folder first."
            );
            return;
        }
        try {
            const document = await workspace.openTextDocument(
                Uri.file(filePath)
            );
            await window.showTextDocument(document);
        } catch {
            window.showWarningMessage(
                "FOIL Lab file was not found. Initialize the lab first."
            );
        }
    }
}
