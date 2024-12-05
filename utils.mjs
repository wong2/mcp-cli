import traverse from "@json-schema-tools/traverse";
import { isEmpty, set as setPath } from "lodash-es";
import { Console } from "node:console";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";
import colors from "yoctocolors";

export const logger = new Console({ stdout: process.stderr, stderr: process.stderr });

export function prettyPrint(obj) {
  logger.dir(obj, { depth: null, colors: true });
}

export function createSpinner(text) {
  return yoctoSpinner({ text, stream: process.stderr }).start();
}

export async function readPromptArgumentInputs(args) {
  if (!args || args.length === 0) {
    return {};
  }
  return prompts(
    args.map((arg) => ({
      type: "text",
      name: arg.name,
      message: colors.inverse((arg.required ? "* " : "") + `${arg.name}: ${arg.description}`),
    }))
  );
}

export async function readJSONSchemaInputs(schema) {
  if (!schema || isEmpty(schema)) {
    return {};
  }
  const questions = [];
  traverse.default(schema, (s, _isCycle, path, parent) => {
    const key = path.replace("$.properties.", "").replace(".properties", "");
    const required = parent?.required?.includes(key.split(".").at(-1));
    if (parent && parent.type === "array") {
      return;
    }
    if (s.type === "string") {
      questions.push({ key, type: "text", required, initial: s.default });
    } else if (s.type === "integer") {
      questions.push({
        key,
        type: "number",
        required,
        initial: s.default,
        max: s.maximum ?? s.exclusiveMaximum,
        min: s.minimum ?? s.exclusiveMinimum,
      });
    } else if (s.type === "boolean") {
      questions.push({ type: "confirm", key, required, initial: s.default });
    }
  });
  const results = {};
  for (const q of questions) {
    const { key, required, ...options } = q;
    const { value } = await prompts({
      name: "value",
      message: colors.inverse(`${required ? "* " : ""}${key}`),
      ...options,
    });
    setPath(results, q.key, value);
  }
  return results;
}
