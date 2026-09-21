import assert from "assert";

import {addBundleInclude} from "./bundleIntegration";

describe("addBundleInclude", () => {
    it("adds a FOIL generated resource include", () => {
        const result = addBundleInclude(
            {include: ["resources/*.yml"], bundle: {name: "foil"}},
            ".foil-lab/build/wind_test_001/resources/campaign.job.yml"
        );

        assert.strictEqual(result.changed, true);
        assert.deepStrictEqual(result.bundle.include, [
            "resources/*.yml",
            ".foil-lab/build/wind_test_001/resources/campaign.job.yml",
        ]);
    });

    it("is idempotent", () => {
        const includePath =
            ".foil-lab/build/wind_test_001/resources/campaign.job.yml";
        const input = {include: [includePath]};

        const result = addBundleInclude(input, includePath);

        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.bundle, input);
    });
});
