// Asks a vision-capable LLM which slide of a carousel should be the cover.
// Uses whichever API key is present in the environment:
//   ANTHROPIC_API_KEY -> Claude (default if both are set)
//   OPENAI_API_KEY    -> GPT-4o
//
// Neither SDK is a hard dependency of this project until you actually use
// this feature — install whichever one matches your key:
//   npm install @anthropic-ai/sdk    (for ANTHROPIC_API_KEY)
//   npm install openai               (for OPENAI_API_KEY)

function buildPrompt(slideCount, caption) {
  return (
    `You are picking which single photo from a ${slideCount}-slide Instagram carousel ` +
    `should be the COVER (the first slide, the one shown in the profile grid). ` +
    `Judge purely on which image is the strongest thumbnail: composition, subject clarity, ` +
    `visual impact at small size, and how well it represents the set. ` +
    (caption ? `Caption for context: "${caption}". ` : "") +
    `Respond with ONLY the slide number (1-${slideCount}), nothing else.`
  );
}

function parseSlideNumber(text, slideCount) {
  const match = text.match(/\d+/);
  if (!match) {
    throw new Error(`Could not parse a slide number from vision response: "${text}"`);
  }
  const chosen = parseInt(match[0], 10);
  if (chosen < 1 || chosen > slideCount) {
    throw new Error(`Vision model returned an out-of-range slide number: ${chosen}`);
  }
  return chosen - 1;
}

async function askAnthropic(prompt, buffers) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const content = [
    { type: "text", text: prompt },
    ...buffers.map((buffer) => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: buffer.toString("base64") },
    })),
  ];
  const res = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16,
    messages: [{ role: "user", content }],
  });
  return res.content.map((block) => block.text || "").join("");
}

async function askOpenAI(prompt, buffers) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();
  const content = [
    { type: "text", text: prompt },
    ...buffers.map((buffer) => ({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${buffer.toString("base64")}` },
    })),
  ];
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 16,
    messages: [{ role: "user", content }],
  });
  return res.choices[0].message.content;
}

export async function pickBestCoverIndex(imageBuffers, { caption } = {}) {
  const provider = process.env.ANTHROPIC_API_KEY
    ? "anthropic"
    : process.env.OPENAI_API_KEY
    ? "openai"
    : null;

  if (!provider) {
    throw new Error(
      "Set ANTHROPIC_API_KEY or OPENAI_API_KEY so cover selection has a vision model to call."
    );
  }

  const prompt = buildPrompt(imageBuffers.length, caption);
  const text =
    provider === "anthropic"
      ? await askAnthropic(prompt, imageBuffers)
      : await askOpenAI(prompt, imageBuffers);

  return parseSlideNumber(text, imageBuffers.length);
}
