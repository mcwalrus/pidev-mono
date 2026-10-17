import { assertToolContract, describeRegisteredTools } from "@piex/test-utils";
import { describe, it } from "vitest";
import { registerNoteTool, TOOL_NAME } from "./hello.js";

describe("note tool contract", () => {
	it("exposes the documented tool shape", async () => {
		const [tool] = await describeRegisteredTools((pi) => registerNoteTool(pi));
		assertToolContract(tool!, {
			name: TOOL_NAME,
			requiredFields: ["action"],
			optionalFields: ["text"],
		});
	});
});
