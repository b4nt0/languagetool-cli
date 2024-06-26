import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { loadFiles } from "./lib/files.js";
import {
  loadCustomDict,
  createFetchRequest,
} from "./lib/languageToolClient.js";
import { generateReport, reporters } from "./lib/report.js";
import {
  ProgramOptions,
  LanguageToolResult,
  ReportStats,
  FileWithDiffInfo,
} from "./lib/types.js";
import { convertMarkdownToAnnotated } from "./lib/markdownToAnnotated.js";

const parser = yargs(hideBin(process.argv))
  .usage("Usage: $0 [options] [<file1> <file2> ... <fileN>]")
  .options({
    "lang": {
      type: "string",
      default: "en-US",
      nargs: 1,
      describe:
        "Language to check the grammar in.",
    },
    "mother-lang": {
      type: "string",
      default: "en-US",
      nargs: 1,
      describe:
        "Language that you speak.",
    },
    "custom-dict-file": {
      type: "string",
      default: "",
      describe: "A file containing a list of custom dictionary words.",
    },
    "max-replacements": {
      type: "number",
      default: 2,
      describe:
        "Maximum number of replacements to suggest for a grammar/spelling error.",
    },
  })
  .help("h")
  .alias("h", "help");

run().catch((err) => {
  console.error(err.message);
  console.debug(err);
  process.exit(1);
});

async function run() {
  const options = (await parser.argv) as ProgramOptions;
  options.customDict = await loadCustomDict(options["custom-dict-file"]);

  let filePathsToCheck: Array<string | FileWithDiffInfo> = options._;
  const files = await loadFiles(filePathsToCheck);
  const annotatedItems = files.map((file) => ({
    ...file,
    annotatedText: convertMarkdownToAnnotated(file.contents),
  }));

  let promises = [];

  for (let item of annotatedItems) {
    promises.push(createFetchRequest(item, options));
  }

  const responses = await Promise.all(promises);
  const results = await Promise.all(responses.map((r) => r.json()));
  const correlatedResults: LanguageToolResult[] = results.map((r: any, i) => {
    return {
      ...annotatedItems[i],
      matches: r.matches,
    };
  });

  const reporter = reporters.markdown;
  const stats = new ReportStats();

  for (const result of correlatedResults) {
    await generateReport(result, reporter, options, stats);
  }

  if (reporter.complete) {
    await reporter.complete(options, stats);
  }
}
