import { promises as fs } from "node:fs";

export async function extractText(absolutePath: string, ext: string): Promise<string> {
  switch (ext) {
    case ".txt":
    case ".md":
      return fs.readFile(absolutePath, "utf-8");
    case ".pdf": {
      // Lazy require: keeps this dependency out of the module graph for the
      // (more common) plain-text path.
      const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;
      const buffer = await fs.readFile(absolutePath);
      const result = await pdfParse(buffer);
      return result.text;
    }
    case ".docx": {
      const mammoth = require("mammoth") as {
        extractRawText: (input: { path: string }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ path: absolutePath });
      return result.value;
    }
    default:
      throw new Error(`unsupported file extension: ${ext}`);
  }
}
