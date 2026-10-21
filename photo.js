// Reads a photo of a shopping list (handwritten or printed) using Google's Gemini AI,
// via Firebase AI Logic, and returns the items it finds.
import {
  getAI, getGenerativeModel, GoogleAIBackend, Schema,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-ai.js";

const PROMPT = `This photo shows a shopping list. It may be handwritten or printed.
List every item to buy, in the order written.
- "name": the item itself, e.g. "Eggs". Fix obvious spelling mistakes.
- "details": any amount or note, e.g. "2 dozen" or "free-range". Use "" if there is none.
Skip headings, dates, prices and anything crossed out.
If there is no shopping list in the photo, return an empty list.`;

const ITEMS_SCHEMA = Schema.array({
  items: Schema.object({
    properties: { name: Schema.string(), details: Schema.string() },
  }),
});

export async function readPhoto(app, file, modelName) {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: modelName,
    generationConfig: { responseMimeType: "application/json", responseSchema: ITEMS_SCHEMA },
  });
  const image = await shrinkPhoto(file);
  const result = await model.generateContent([
    PROMPT,
    { inlineData: { data: image, mimeType: "image/jpeg" } },
  ]);
  return JSON.parse(result.response.text())
    .filter((i) => i && typeof i.name === "string" && i.name.trim())
    .map((i) => ({
      name: i.name.trim().slice(0, 100),
      details: String(i.details || "").trim().slice(0, 100),
    }));
}

// Phone photos are large; a smaller copy uploads faster and is still easy to read.
async function shrinkPhoto(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}
